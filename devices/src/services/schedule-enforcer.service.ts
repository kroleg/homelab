import type { Logger } from '../logger.ts';
import type { KeeneticService } from './keenetic.service.ts';
import type { DeviceRepository } from '../storage/device.repository.ts';
import type { ScheduleRepository } from '../storage/schedule.repository.ts';
import type { UserRepository } from '../storage/user.repository.ts';
import type { TrafficRepository } from '../storage/traffic.repository.ts';
import type { Schedule } from '../storage/db-schema.ts';


export function isScheduleActive(schedule: Schedule, now: Date): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = schedule.fromHour * 60 + schedule.fromMinute;
  const toMinutes = schedule.toHour * 60 + schedule.toMinute;

  if (fromMinutes < toMinutes) {
    return currentMinutes >= fromMinutes && currentMinutes < toMinutes;
  }
  // Crosses midnight: e.g. 21:00 - 05:00
  return currentMinutes >= fromMinutes || currentMinutes < toMinutes;
}

export function isOverridden(schedule: Schedule, now: Date): boolean {
  return schedule.overrideUntil != null && new Date(schedule.overrideUntil) > now;
}

export function getNextChangeTime(schedule: Schedule, now: Date): string {
  const active = isScheduleActive(schedule, now);
  if (active) {
    return `${String(schedule.toHour).padStart(2, '0')}:${String(schedule.toMinute).padStart(2, '0')}`;
  }
  return `${String(schedule.fromHour).padStart(2, '0')}:${String(schedule.fromMinute).padStart(2, '0')}`;
}

// windowHours must evenly divide 24 so that toHour never exceeds 24
export function getCurrentWindow(now: Date, windowHours: number): { fromHour: number; toHour: number; date: string } {
  const currentHour = now.getHours();
  const fromHour = Math.floor(currentHour / windowHours) * windowHours;
  const toHour = fromHour + windowHours;
  const date = now.toISOString().slice(0, 10);
  return { fromHour, toHour, date };
}

export function createScheduleEnforcer(
  keenetic: KeeneticService,
  deviceRepo: DeviceRepository,
  scheduleRepo: ScheduleRepository,
  userRepo: UserRepository,
  trafficRepo: TrafficRepository,
  logger: Logger,
  intervalMs: number,
  speedLimitKbps: number,
) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function enforce() {
    try {
      const now = new Date();
      const [schedules, currentLimits, quotaUsers] = await Promise.all([
        scheduleRepo.findAll(),
        keenetic.getSpeedLimits(),
        userRepo.findWithQuotaEnabled(),
      ]);

      // Build set of MACs that should have speed limits right now
      const shouldBeLimited = new Set<string>();

      // 1. Time-based schedule limits
      for (const schedule of schedules) {
        const shouldEnforce = schedule.enabled
          && isScheduleActive(schedule, now)
          && !isOverridden(schedule, now);

        if (!shouldEnforce) continue;

        const devices = await deviceRepo.findByUserId(schedule.userId);
        for (const device of devices) {
          shouldBeLimited.add(device.mac.toLowerCase());
        }
      }

      // 2. Traffic quota limits
      for (const user of quotaUsers) {
        const window = getCurrentWindow(now, user.quotaWindowHours);
        const devices = await deviceRepo.findByUserId(user.id);
        const macs = devices.map(d => d.mac.toLowerCase());
        if (macs.length === 0) continue;

        const usedBytes = await trafficRepo.getWindowTotal(macs, window.date, window.fromHour, window.toHour);
        const limitBytes = user.quotaLimitMb * 1024 * 1024;

        if (usedBytes >= limitBytes) {
          for (const mac of macs) {
            shouldBeLimited.add(mac);
          }
          logger.debug(`Quota: user ${user.name} exceeded ${user.quotaLimitMb} MB in window ${window.fromHour}-${window.toHour}`);
        }
      }

      // Apply limits to devices that should be limited but aren't (or have wrong rate)
      for (const mac of shouldBeLimited) {
        if (currentLimits[mac] !== speedLimitKbps) {
          const success = await keenetic.setSpeedLimit(mac, speedLimitKbps);
          if (success) {
            logger.info(`Enforcer: set ${speedLimitKbps} kbps limit on ${mac}`);
          }
        }
      }

      // Remove limits from devices that are limited but shouldn't be
      for (const mac of Object.keys(currentLimits)) {
        if (!shouldBeLimited.has(mac)) {
          const success = await keenetic.removeSpeedLimit(mac);
          if (success) {
            logger.info(`Enforcer: removed speed limit from ${mac}`);
          }
        }
      }
    } catch (error) {
      logger.error('Schedule enforcer error:', error);
    }
  }

  return {
    start() {
      logger.info(`Schedule enforcer starting (interval: ${intervalMs / 1000}s)`);
      enforce();
      timer = setInterval(enforce, intervalMs);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    async refresh() {
      await enforce();
    },
  };
}

export type ScheduleEnforcer = ReturnType<typeof createScheduleEnforcer>;
