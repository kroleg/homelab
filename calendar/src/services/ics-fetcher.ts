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

    for (const event of events) {
      const eventWithRrule = event as CalendarEvent & { rrule?: string };

      if (eventWithRrule.rrule) {
        // Expand recurring events
        const expanded = this.expandRecurringEvent(
          eventWithRrule as CalendarEvent & { rrule: string },
          startDate,
          endDate
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

  private expandRecurringEvent(
    event: CalendarEvent & { rrule: string },
    startDate: Date,
    endDate: Date
  ): FullCalendarEvent[] {
    const results: FullCalendarEvent[] = [];

    try {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const duration = eventEnd.getTime() - eventStart.getTime();

      const rule = RRule.fromString(`DTSTART:${this.toRRuleDateString(eventStart)}\n${event.rrule}`);
      const occurrences = rule.between(startDate, endDate, true);

      for (const occurrence of occurrences) {
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
}
