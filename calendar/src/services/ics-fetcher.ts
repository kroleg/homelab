import ICAL from 'ical.js';
import rrulePkg from 'rrule';
const { RRule } = rrulePkg;
import type { CalendarConfig, CalendarEvent, FullCalendarEvent } from '../types.ts';
import { Cache } from './cache.ts';

export class ICSFetcher {
  private cache: Cache<CalendarEvent[]>;
  private calendars: CalendarConfig[];

  constructor(calendars: CalendarConfig[], cacheTtlMinutes: number) {
    this.calendars = calendars;
    this.cache = new Cache(cacheTtlMinutes);
  }

  async fetchEvents(startDate: Date, endDate: Date): Promise<FullCalendarEvent[]> {
    const allEvents: FullCalendarEvent[] = [];

    for (const calendar of this.calendars) {
      try {
        const events = await this.fetchCalendarEvents(calendar, startDate, endDate);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Failed to fetch calendar ${calendar.id}:`, error);
      }
    }

    return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  private async fetchCalendarEvents(
    calendar: CalendarConfig,
    startDate: Date,
    endDate: Date
  ): Promise<FullCalendarEvent[]> {
    const cacheKey = calendar.id;
    let events = this.cache.get(cacheKey);

    if (!events) {
      events = await this.fetchAndParseICS(calendar);
      this.cache.set(cacheKey, events);
    }

    // Filter events by date range and expand recurring events
    return this.filterAndExpandEvents(events, startDate, endDate, calendar.color);
  }

  private async fetchAndParseICS(calendar: CalendarConfig): Promise<CalendarEvent[]> {
    const response = await fetch(calendar.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const icsText = await response.text();
    return this.parseICS(icsText, calendar);
  }

  private parseICS(icsText: string, calendar: CalendarConfig): CalendarEvent[] {
    const events: CalendarEvent[] = [];

    try {
      const jcalData = ICAL.parse(icsText);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      for (const vevent of vevents) {
        const event = new ICAL.Event(vevent);

        const calEvent: CalendarEvent = {
          id: event.uid || `${calendar.id}-${Date.now()}-${Math.random()}`,
          calendarId: calendar.id,
          title: event.summary || 'Untitled',
          description: event.description || undefined,
          location: event.location || undefined,
          start: event.startDate?.toJSDate()?.toISOString() || new Date().toISOString(),
          end: event.endDate?.toJSDate()?.toISOString() || new Date().toISOString(),
          allDay: event.startDate?.isDate || false,
          color: calendar.color,
        };

        // Store RRULE for recurring events
        const rruleProp = vevent.getFirstPropertyValue('rrule');
        if (rruleProp) {
          (calEvent as CalendarEvent & { rrule?: string }).rrule = rruleProp.toString();
        }

        // Store EXDATE (excluded dates) for recurring events
        const exdates = vevent.getAllProperties('exdate');
        if (exdates.length > 0) {
          const excludedDates: string[] = [];
          for (const exdate of exdates) {
            const values = exdate.getValues();
            for (const val of values) {
              if (val && typeof val.toJSDate === 'function') {
                excludedDates.push(val.toJSDate().toISOString());
              }
            }
          }
          if (excludedDates.length > 0) {
            (calEvent as CalendarEvent & { exdates?: string[] }).exdates = excludedDates;
          }
        }

        // Store RECURRENCE-ID for exception events (modified instances)
        const recurrenceIdProp = vevent.getFirstProperty('recurrence-id');
        if (recurrenceIdProp) {
          const recurrenceIdVal = recurrenceIdProp.getFirstValue() as { toJSDate?: () => Date } | null;
          if (recurrenceIdVal && typeof recurrenceIdVal.toJSDate === 'function') {
            (calEvent as CalendarEvent & { recurrenceId?: string }).recurrenceId = recurrenceIdVal.toJSDate().toISOString();
          }
        }

        events.push(calEvent);
      }
    } catch (error) {
      console.error(`Failed to parse ICS for ${calendar.id}:`, error);
    }

    return events;
  }

  private filterAndExpandEvents(
    events: CalendarEvent[],
    startDate: Date,
    endDate: Date,
    color: string
  ): FullCalendarEvent[] {
    const result: FullCalendarEvent[] = [];

    // Build a map of exception events (modified instances) by their base UID
    // Key: base event UID, Value: Set of recurrence dates that have been modified
    const exceptionDates = new Map<string, Set<string>>();
    for (const event of events) {
      const eventWithRecurrenceId = event as CalendarEvent & { recurrenceId?: string };
      if (eventWithRecurrenceId.recurrenceId) {
        const baseUid = event.id;
        if (!exceptionDates.has(baseUid)) {
          exceptionDates.set(baseUid, new Set());
        }
        // Normalize the date to start of day for comparison
        const recDate = new Date(eventWithRecurrenceId.recurrenceId);
        exceptionDates.get(baseUid)!.add(this.normalizeDate(recDate));
      }
    }

    for (const event of events) {
      const eventWithRrule = event as CalendarEvent & { rrule?: string; exdates?: string[]; recurrenceId?: string };

      // Skip events with recurrenceId - they will be added separately as single events
      if (eventWithRrule.recurrenceId) {
        // This is a modified instance - add it as a regular event if in range
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        if (eventEnd >= startDate && eventStart <= endDate) {
          result.push(this.toFullCalendarEvent(event, color));
        }
        continue;
      }

      if (eventWithRrule.rrule) {
        // Get excluded dates (EXDATE + dates with RECURRENCE-ID exceptions)
        const excludedDatesSet = new Set<string>();

        // Add EXDATE dates
        if (eventWithRrule.exdates) {
          for (const exdate of eventWithRrule.exdates) {
            excludedDatesSet.add(this.normalizeDate(new Date(exdate)));
          }
        }

        // Add dates that have exception events
        const eventExceptions = exceptionDates.get(event.id);
        if (eventExceptions) {
          for (const excDate of eventExceptions) {
            excludedDatesSet.add(excDate);
          }
        }

        // Expand recurring events with exclusions
        const expanded = this.expandRecurringEvent(
          eventWithRrule as CalendarEvent & { rrule: string },
          startDate,
          endDate,
          excludedDatesSet
        );
        result.push(...expanded);
      } else {
        // Check if single event falls within range
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);

        if (eventEnd >= startDate && eventStart <= endDate) {
          result.push(this.toFullCalendarEvent(event, color));
        }
      }
    }

    return result;
  }

  private normalizeDate(date: Date): string {
    // Normalize to YYYY-MM-DD for date comparison
    return date.toISOString().split('T')[0];
  }

  private expandRecurringEvent(
    event: CalendarEvent & { rrule: string },
    startDate: Date,
    endDate: Date,
    excludedDates: Set<string> = new Set()
  ): FullCalendarEvent[] {
    const results: FullCalendarEvent[] = [];

    try {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const duration = eventEnd.getTime() - eventStart.getTime();

      const rule = RRule.fromString(`DTSTART:${this.toRRuleDateString(eventStart)}\n${event.rrule}`);
      const occurrences = rule.between(startDate, endDate, true);

      for (const occurrence of occurrences) {
        // Skip excluded dates (EXDATE or modified by RECURRENCE-ID)
        const normalizedDate = this.normalizeDate(occurrence);
        if (excludedDates.has(normalizedDate)) {
          continue;
        }

        const occurrenceEnd = new Date(occurrence.getTime() + duration);

        results.push({
          id: `${event.id}-${occurrence.getTime()}`,
          title: event.title,
          start: occurrence.toISOString(),
          end: occurrenceEnd.toISOString(),
          allDay: event.allDay,
          color: event.color,
          extendedProps: {
            calendarId: event.calendarId,
            description: event.description,
            location: event.location,
          },
        });
      }
    } catch (error) {
      console.error(`Failed to expand recurring event ${event.id}:`, error);
      // Fall back to single occurrence
      results.push(this.toFullCalendarEvent(event, event.color));
    }

    return results;
  }

  private toRRuleDateString(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  private toFullCalendarEvent(event: CalendarEvent, color: string): FullCalendarEvent {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      color,
      extendedProps: {
        calendarId: event.calendarId,
        description: event.description,
        location: event.location,
      },
    };
  }

  invalidateCache(): void {
    this.cache.invalidate();
  }

  getCalendars(): CalendarConfig[] {
    return this.calendars;
  }

  isCached(): boolean {
    return this.calendars.every(cal => this.cache.has(cal.id));
  }

  startBackgroundFetch(startDate: Date, endDate: Date): void {
    this.fetchEvents(startDate, endDate).catch(err =>
      console.error('Background fetch failed:', err)
    );
  }
}
