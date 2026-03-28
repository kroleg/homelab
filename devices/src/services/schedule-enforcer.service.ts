import type { Logger } from '../logger.ts';
import type { KeeneticService } from './keenetic.service.ts';
import type { DeviceRepository } from '../storage/device.repository.ts';
import type { ScheduleRepository } from '../storage/schedule.repository.ts';
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

export function createScheduleEnforcer(
  keenetic: KeeneticService,
  deviceRepo: DeviceRepository,
  scheduleRepo: ScheduleRepository,
  logger: Logger,
  intervalMs: number,
) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function enforce() {
    try {
      const schedules = await scheduleRepo.findAll();
      if (schedules.length === 0) return;

      const now = new Date();

      // Get current device policies from router (one call for all devices)
      const clients = await keenetic.getClients();
      const policyIdByMac = new Map<string, string | null>();
      for (const c of clients) {
        policyIdByMac.set(c.mac.toUpperCase(), c.policy?.id ?? null);
      }

      for (const schedule of schedules) {
        const shouldEnforce = schedule.enabled
          && isScheduleActive(schedule, now)
          && !isOverridden(schedule, now);

        const devices = await deviceRepo.findByUserId(schedule.userId);

        for (const device of devices) {
          const currentPolicyId = policyIdByMac.get(device.mac.toUpperCase()) ?? null;
          const hasSchedulePolicy = currentPolicyId === schedule.policyId;

          if (shouldEnforce && !hasSchedulePolicy) {
            const success = await keenetic.setDevicePolicy(device.mac, schedule.policyId);
            if (success) {
              logger.info(`Schedule: applied policy ${schedule.policyId} to ${device.customName || device.mac} (user ${schedule.userId})`);
            }
          } else if (!shouldEnforce && hasSchedulePolicy) {
            // Remove the schedule policy (set to no policy)
            const success = await keenetic.setDevicePolicy(device.mac, null);
            if (success) {
              logger.info(`Schedule: removed policy from ${device.customName || device.mac} (user ${schedule.userId})`);
            }
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
