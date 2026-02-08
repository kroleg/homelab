import { readdir, readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../logger.ts';

interface MemoryInfo {
  totalGb: number;
  usedGb: number;
  usedPercent: number;
}

interface DiskSpace {
  mount: string;
  totalGb: number;
  usedGb: number;
  usedPercent: number;
}

interface HardwareMetrics {
  cpuTemp: number | null;
  diskTemps: { device: string; temp: number }[];
  loadAvg: { load1: number; load5: number; load15: number } | null;
  memory: MemoryInfo | null;
  diskSpace: DiskSpace[];
}

export function createHardwareService(sysPath: string, procPath: string, rootfsPath: string, logger: Logger) {
  async function readHwmonTemp(hwmonPath: string): Promise<number | null> {
    try {
      const tempInput = await readFile(path.join(hwmonPath, 'temp1_input'), 'utf-8');
      return parseInt(tempInput.trim()) / 1000;
    } catch {
      return null;
    }
  }

  async function getCpuTemp(): Promise<number | null> {
    try {
      const hwmonDir = path.join(sysPath, 'class/hwmon');
      const entries = await readdir(hwmonDir);

      for (const entry of entries) {
        const hwmonPath = path.join(hwmonDir, entry);
        try {
          const name = await readFile(path.join(hwmonPath, 'name'), 'utf-8');
          if (name.trim() === 'coretemp') {
            return await readHwmonTemp(hwmonPath);
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.error('Failed to read CPU temp', { error });
    }
    return null;
  }

  async function getDiskTemps(): Promise<{ device: string; temp: number }[]> {
    const temps: { device: string; temp: number }[] = [];

    try {
      const hwmonDir = path.join(sysPath, 'class/hwmon');
      const entries = await readdir(hwmonDir);

      for (const entry of entries) {
        const hwmonPath = path.join(hwmonDir, entry);
        try {
          const name = await readFile(path.join(hwmonPath, 'name'), 'utf-8');
          if (name.trim() === 'drivetemp') {
            const temp = await readHwmonTemp(hwmonPath);
            if (temp !== null) {
              let device = 'unknown';

              try {
                const blockPath = path.join(hwmonPath, 'device/block');
                const blockEntries = await readdir(blockPath);
                if (blockEntries.length > 0) {
                  device = blockEntries[0];
                }
              } catch {
                device = `disk${temps.length + 1}`;
              }

              temps.push({ device, temp });
            }
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      logger.error('Failed to read disk temps', { error });
    }

    return temps;
  }

  async function getLoadAvg(): Promise<{ load1: number; load5: number; load15: number } | null> {
    try {
      const content = await readFile(path.join(procPath, 'loadavg'), 'utf-8');
      const parts = content.trim().split(' ');
      return {
        load1: parseFloat(parts[0]),
        load5: parseFloat(parts[1]),
        load15: parseFloat(parts[2]),
      };
    } catch (error) {
      logger.error('Failed to read load average', { error });
      return null;
    }
  }

  async function getMemory(): Promise<MemoryInfo | null> {
    try {
      const content = await readFile(path.join(procPath, 'meminfo'), 'utf-8');
      const lines = content.split('\n');
      const values: Record<string, number> = {};

      for (const line of lines) {
        const match = line.match(/^(\w+):\s+(\d+)\s+kB/);
        if (match) {
          values[match[1]] = parseInt(match[2]);
        }
      }

      const totalKb = values['MemTotal'] || 0;
      const availableKb = values['MemAvailable'] || 0;
      const usedKb = totalKb - availableKb;

      const totalGb = totalKb / 1024 / 1024;
      const usedGb = usedKb / 1024 / 1024;
      const usedPercent = totalKb > 0 ? (usedKb / totalKb) * 100 : 0;

      return { totalGb, usedGb, usedPercent };
    } catch (error) {
      logger.error('Failed to read memory info', { error });
      return null;
    }
  }

  async function getDiskSpace(): Promise<DiskSpace[]> {
    const disks: DiskSpace[] = [];
    const mountsToCheck = ['/', '/mnt/data'];

    for (const mount of mountsToCheck) {
      try {
        const hostPath = path.join(rootfsPath, mount);
        const stats = await statfs(hostPath);

        const blockSize = stats.bsize;
        const totalBytes = stats.blocks * blockSize;
        const freeBytes = stats.bfree * blockSize;
        const usedBytes = totalBytes - freeBytes;

        const totalGb = totalBytes / 1024 / 1024 / 1024;
        const usedGb = usedBytes / 1024 / 1024 / 1024;
        const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

        disks.push({ mount, totalGb, usedGb, usedPercent });
      } catch {
        continue;
      }
    }

    return disks;
  }

  async function getMetrics(): Promise<HardwareMetrics> {
    const [cpuTemp, diskTemps, loadAvg, memory, diskSpace] = await Promise.all([
      getCpuTemp(),
      getDiskTemps(),
      getLoadAvg(),
      getMemory(),
      getDiskSpace(),
    ]);

    return { cpuTemp, diskTemps, loadAvg, memory, diskSpace };
  }

  function formatMetrics(metrics: HardwareMetrics): string {
    const lines: string[] = [];

    if (metrics.cpuTemp !== null) {
      lines.push(`*CPU:* \`${metrics.cpuTemp.toFixed(1)}°C\``);
    }

    if (metrics.diskTemps.length > 0) {
      lines.push('');
      lines.push('*Disks:*');
      for (const disk of metrics.diskTemps) {
        lines.push(`  ${disk.device}: \`${disk.temp.toFixed(1)}°C\``);
      }
    }

    if (metrics.memory) {
      lines.push('');
      const freeGb = metrics.memory.totalGb - metrics.memory.usedGb;
      lines.push(`*Memory:* \`${freeGb.toFixed(1)} GB\` free of ${metrics.memory.totalGb.toFixed(0)} GB`);
    }

    if (metrics.diskSpace.length > 0) {
      lines.push('');
      lines.push('*Disk space:*');
      for (const disk of metrics.diskSpace) {
        const freeGb = disk.totalGb - disk.usedGb;
        lines.push(`  ${disk.mount}: \`${freeGb.toFixed(0)} GB\` free of ${disk.totalGb.toFixed(0)} GB`);
      }
    }

    if (metrics.loadAvg) {
      lines.push('');
      lines.push('*Load average:*');
      lines.push(`  1 min: \`${metrics.loadAvg.load1.toFixed(2)}\``);
      lines.push(`  5 min: \`${metrics.loadAvg.load5.toFixed(2)}\``);
      lines.push(`  15 min: \`${metrics.loadAvg.load15.toFixed(2)}\``);
    }

    return lines.join('\n');
  }

  return {
    getMetrics,
    formatMetrics,
  };
}

export type HardwareService = ReturnType<typeof createHardwareService>;
