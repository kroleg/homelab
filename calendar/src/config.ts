import type { CalendarConfig } from './types.ts';

export interface AppConfig {
  port: number;
  cacheTtlMinutes: number;
  timezone: string; // e.g., "+03:00"
  calendars: CalendarConfig[];
}

const DEFAULT_COLORS = [
  '#3788d8', // blue
  '#e74c3c', // red
  '#2ecc71', // green
  '#9b59b6', // purple
  '#f39c12', // orange
  '#1abc9c', // teal
];

const ENV_PREFIX = 'CALENDAR_CONFIG_';

/**
 * Parse environment variables to build calendar configuration.
 *
 * Use CALENDAR_IDS to explicitly list calendars (recommended):
 *   CALENDAR_IDS=FAMILY,WORK
 *   CALENDAR_CONFIG_FAMILY_URL=https://...
 *   CALENDAR_CONFIG_FAMILY_NAME=Family
 *   CALENDAR_CONFIG_FAMILY_COLOR=#3788d8
 */
function parseCalendarConfigs(): CalendarConfig[] {
  const calendars: CalendarConfig[] = [];

  const calendarIds = process.env.CALENDAR_IDS
    ?.split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean) || [];

  if (calendarIds.length === 0) {
    return calendars;
  }

  let colorIndex = 0;
  for (const id of calendarIds) {
    const url = process.env[`${ENV_PREFIX}${id}_URL`];
    if (!url) {
      console.warn(`Warning: CALENDAR_CONFIG_${id}_URL not set, skipping calendar ${id}`);
      continue;
    }

    const name = process.env[`${ENV_PREFIX}${id}_NAME`] || id.toLowerCase().replace(/_/g, ' ');
    const color = process.env[`${ENV_PREFIX}${id}_COLOR`] || DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];

    calendars.push({
      id: id.toLowerCase(),
      name,
      url,
      color,
    });

    colorIndex++;
  }

  return calendars;
}

export function loadConfig(): AppConfig {
  const calendars = parseCalendarConfigs();

  if (calendars.length === 0) {
    console.warn('Warning: No calendars configured. Set CALENDAR_CONFIG_<ID>_URL environment variables.');
  }

  return {
    port: parseInt(process.env.PORT || '3003', 10),
    cacheTtlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || '5', 10),
    timezone: process.env.TIMEZONE || '+03:00',
    calendars,
  };
}
