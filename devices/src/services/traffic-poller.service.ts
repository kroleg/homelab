import type { Logger } from '../logger.ts';
import type { KeeneticService } from './keenetic.service.ts';
import type { DeviceRepository } from '../storage/device.repository.ts';
import type { TrafficRepository } from '../storage/traffic.repository.ts';

export function createTrafficPoller(
  keenetic: KeeneticService,
  deviceRepo: DeviceRepository,
  trafficRepo: TrafficRepository,
  logger: Logger,
  intervalMs: number,
) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    try {
      const devices = await deviceRepo.findAll();
      const macs = devices.filter(d => d.userId).map(d => d.mac);
      if (macs.length === 0) return;

      const bulk = await keenetic.getTrafficBulk(macs);

      const rows: Array<{ date: string; hour: number; mac: string; rx: number; tx: number }> = [];
      for (const [mac, hours] of Object.entries(bulk)) {
        for (const h of hours) {
          if (h.rx > 0 || h.tx > 0) {
            rows.push({ date: h.date, hour: h.hour, mac, rx: h.rx, tx: h.tx });
          }
        }
      }

      if (rows.length > 0) {
        await trafficRepo.upsertHourly(rows);
        logger.debug(`Traffic poll: saved ${rows.length} hourly rows for ${Object.keys(bulk).length} devices`);
      }
    } catch (error) {
      logger.error('Traffic poll error:', error);
    }
  }

  return {
    start() {
      logger.info(`Traffic poller starting (interval: ${intervalMs / 1000}s)`);
      poll();
      timer = setInterval(poll, intervalMs);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
