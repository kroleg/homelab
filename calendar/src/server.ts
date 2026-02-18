import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { ICSFetcher } from './services/ics-fetcher.ts';
import { createApiRoutes } from './routes/api.ts';
import { Cache } from './services/cache.ts';

// Cache for SSR week data
interface SSRWeekData {
  weekTitle: string;
  prevWeek: string;
  nextWeek: string;
  startHour: number;
  days: Array<{
    dayName: string;
    dayNum: number;
    isToday: boolean;
    allDayEvents: Array<{ id: string; title: string; color: string }>;
    timedEvents: Array<{ id: string; title: string; color: string; topPx: number; heightPx: number; timeStr: string; leftPercent: number; widthPercent: number }>;
  }>;
  eventsData: Record<string, { title: string; timeDisplay: string; location?: string; description?: string; calendarId: string }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const fetcher = new ICSFetcher(config.calendars, config.cacheTtlMinutes);
const ssrCache = new Cache<SSRWeekData>(config.cacheTtlMinutes);

// Parse timezone offset from config (e.g., "+03:00" -> 180 minutes)
function parseTimezoneOffset(tz: string): number {
  const match = tz.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === '+' ? 1 : -1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);
  return sign * (hours * 60 + minutes);
}

const tzOffsetMinutes = parseTimezoneOffset(config.timezone);

// Convert a Date to the configured timezone for display
function toTz(date: Date): Date {
  // getTimezoneOffset returns the difference in minutes from UTC (negative for +TZ)
  // We want to shift the date to display as if it were in the target timezone
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + tzOffsetMinutes * 60000);
}

// Calculate column positions for overlapping events
function calculateEventColumns<T extends { startHour: number; endHour: number }>(
  events: T[]
): Array<T & { column: number; totalColumns: number }> {
  if (events.length === 0) return [];

  // Sort by start time, then by end time (longer events first)
  const sorted = [...events].sort((a, b) => {
    if (a.startHour !== b.startHour) return a.startHour - b.startHour;
    return b.endHour - a.endHour; // Longer events first when same start
  });

  const result: Array<T & { column: number; totalColumns: number }> = [];
  const columns: Array<{ endHour: number; events: number[] }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];

    // Find a column where this event fits (no overlap)
    let columnIndex = -1;
    for (let c = 0; c < columns.length; c++) {
      if (columns[c].endHour <= event.startHour) {
        columnIndex = c;
        break;
      }
    }

    if (columnIndex === -1) {
      // Need a new column
      columnIndex = columns.length;
      columns.push({ endHour: event.endHour, events: [i] });
    } else {
      columns[columnIndex].endHour = event.endHour;
      columns[columnIndex].events.push(i);
    }

    result.push({ ...event, column: columnIndex, totalColumns: 0 });
  }

  // Calculate max columns for overlapping groups
  for (let i = 0; i < result.length; i++) {
    const event = result[i];
    // Find all events that overlap with this one
    let maxCol = event.column;
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      const other = result[j];
      // Check if they overlap in time
      if (event.startHour < other.endHour && event.endHour > other.startHour) {
        maxCol = Math.max(maxCol, other.column);
      }
    }
    result[i].totalColumns = maxCol + 1;
  }

  return result;
}

// Build prefix variations for matching: "Вася: ", "Вася:", "Вася "
function getPrefixVariations(prefix: string): string[] {
  return [prefix + ': ', prefix + ':', prefix + ' '];
}

// Find sub-calendar by any of its prefixes
function findSubCalendarByPrefix(prefix: string) {
  for (const sub of config.subCalendars) {
    if (sub.prefixes.some((p) => p.toLowerCase() === prefix.toLowerCase())) {
      return sub;
    }
  }
  return null;
}

// Helper to apply sub-calendar prefix matching
// Supports: "Вася: Event", "Вася и Поля: Event", "Лева, Поля: Event"
function applySubCalendar(title: string, defaultColor: string): { title: string; color: string; calendarId: string; person?: string } {
  // First, try to match multiple persons pattern: "Name1 и Name2: " or "Name1, Name2: "
  const multiPersonMatch = title.match(/^(.+?):\s*/);
  if (multiPersonMatch) {
    const prefixPart = multiPersonMatch[1];
    const restTitle = title.slice(multiPersonMatch[0].length).trim();

    // Split by " и " or ", " to get individual names
    const names = prefixPart.split(/\s+и\s+|,\s*/).map((n) => n.trim()).filter(Boolean);

    if (names.length > 1) {
      // Multiple persons - find all matching sub-calendars
      const matchedSubs = names.map((name) => findSubCalendarByPrefix(name)).filter(Boolean);

      if (matchedSubs.length > 0) {
        // Use first matched color, combine person names
        const personNames = matchedSubs.map((s) => s!.name);
        return {
          title: restTitle,
          color: matchedSubs[0]!.color,
          calendarId: matchedSubs.map((s) => s!.id).join(','),
          person: personNames.join(' '),
        };
      }
    }
  }

  // Single person matching with all prefix variations
  for (const sub of config.subCalendars) {
    for (const prefix of sub.prefixes) {
      const variations = getPrefixVariations(prefix);
      for (const variant of variations) {
        if (title.startsWith(variant)) {
          return {
            title: title.slice(variant.length).trim(),
            color: sub.color,
            calendarId: sub.id,
            person: sub.name,
          };
        }
      }
    }
  }

  return { title, color: defaultColor, calendarId: '' };
}

const app = express();

// Configure Pug as the view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Parse JSON bodies
app.use(express.json());

app.get('/health', (req, res) => {
  res.send({ status: 'ok' })
})

// Simple list view (default) - shows next 14 days
app.get('/', async (req: Request, res: Response) => {
  try {
    const today = toTz(new Date());
    const numDays = 14;

    const periodStart = new Date(today);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + numDays);

    // Check if ICS data is cached
    if (!fetcher.isCached()) {
      fetcher.startBackgroundFetch(periodStart, periodEnd);
      return res.render('loading');
    }

    // Fetch events
    const events = await fetcher.fetchEvents(periodStart, periodEnd);

    // Russian day names and month names
    const dayNames = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const monthNames = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];

    // Build days array with events grouped by day
    const days: Array<{
      dateTitle: string;
      isToday: boolean;
      events: Array<{ id: string; title: string; color: string; timeStr: string; location?: string }>;
    }> = [];
    const eventsData: SSRWeekData['eventsData'] = {};

    for (let i = 0; i < numDays; i++) {
      const date = new Date(periodStart);
      date.setDate(date.getDate() + i);
      const dayOfWeek = date.getDay();

      const dateTitle = `${dayNames[dayOfWeek]}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
      const isToday = date.toDateString() === today.toDateString();

      // Filter events for this day
      const dayEvents = events.filter((event) => {
        const eventStart = toTz(new Date(event.start));
        return eventStart.toDateString() === date.toDateString();
      });

      // Sort by start time (all-day first, then by time)
      dayEvents.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });

      const formattedEvents = dayEvents.map((e) => {
        const sub = applySubCalendar(e.title, e.color);
        const start = toTz(new Date(e.start));
        const end = toTz(new Date(e.end));

        let timeStr: string;
        let timeDisplay: string;
        if (e.allDay) {
          timeStr = 'Весь день';
          timeDisplay = `${date.getDate()} ${monthNames[date.getMonth()]} (Весь день)`;
        } else {
          const startTime = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
          const endTime = end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
          timeStr = `${startTime} - ${endTime}`;
          const dateStr = `${dayNames[dayOfWeek].slice(0, 2)}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
          timeDisplay = `${dateStr} ${startTime} - ${endTime}`;
        }

        // Store event data for modal
        eventsData[e.id] = {
          title: e.title,
          timeDisplay,
          location: e.extendedProps.location,
          description: e.extendedProps.description,
          calendarId: sub.calendarId || e.extendedProps.calendarId,
        };

        return {
          id: e.id,
          title: sub.title,
          color: sub.color,
          person: sub.person,
          timeStr,
          location: e.extendedProps.location,
        };
      });

      days.push({
        dateTitle,
        isToday,
        events: formattedEvents,
      });
    }

    // Combine calendars and sub-calendars for legend
    const allCalendars = [
      ...config.calendars.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      ...config.subCalendars.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    ];

    res.render('calendar-list', {
      title: 'Календарь',
      calendars: allCalendars,
      refreshInterval: config.cacheTtlMinutes * 60,
      days,
      eventsData,
    });
  } catch (error) {
    console.error('List calendar error:', error);
    res.status(500).send('Failed to load calendar');
  }
});

// Full calendar view (grid layout)
app.get('/full', async (req: Request, res: Response) => {
  try {
    // Parse week parameter or use current week
    const weekParam = req.query.week as string | undefined;
    // Parse days parameter (3 or 7, default 7)
    const daysParam = parseInt(req.query.days as string, 10);
    const numDays = daysParam === 3 ? 3 : 7;
    const today = toTz(new Date());

    let weekStart: Date;
    if (weekParam) {
      weekStart = new Date(weekParam);
      if (numDays === 7) {
        // Adjust to Monday if needed
        const dayOfWeek = weekStart.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        weekStart.setDate(weekStart.getDate() + diff);
      }
    } else {
      weekStart = new Date(today);
      if (numDays === 7) {
        // Get current week's Monday
        const dayOfWeek = weekStart.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        weekStart.setDate(weekStart.getDate() + diff);
      }
    }
    weekStart.setHours(0, 0, 0, 0);

    const weekKey = `${weekStart.toISOString().split('T')[0]}-${numDays}`;

    // Check cache first
    let weekData = ssrCache.get(weekKey);

    if (!weekData) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + numDays);

      // Check if ICS data is cached, if not show loading page
      if (!fetcher.isCached()) {
        fetcher.startBackgroundFetch(weekStart, weekEnd);
        return res.render('loading');
      }

      // Calculate prev/next period dates
      const prevWeekDate = new Date(weekStart);
      prevWeekDate.setDate(prevWeekDate.getDate() - numDays);
      const nextWeekDate = new Date(weekStart);
      nextWeekDate.setDate(nextWeekDate.getDate() + numDays);

      // Fetch events
      const events = await fetcher.fetchEvents(weekStart, weekEnd);

      // Russian day names and month names
      const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const monthNames = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
      ];

      // Build days array
      const days: SSRWeekData['days'] = [];
      const eventsData: SSRWeekData['eventsData'] = {};

      // Find earliest event start hour (default to 9)
      let earliestHour = 9;
      for (const event of events) {
        if (!event.allDay) {
          const eventStart = toTz(new Date(event.start));
          const hour = eventStart.getHours();
          if (hour < earliestHour) {
            earliestHour = hour;
          }
        }
      }
      const startHour = earliestHour;

      for (let i = 0; i < numDays; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);

        const dayOfWeek = date.getDay();

        // Filter events for this day
        const dayEvents = events.filter((event) => {
          const eventStart = toTz(new Date(event.start));
          return eventStart.toDateString() === date.toDateString();
        });

        const allDayEvents = dayEvents
          .filter((e) => e.allDay)
          .map((e) => {
            const sub = applySubCalendar(e.title, e.color);
            return {
              id: e.id,
              title: sub.title,
              color: sub.color,
            };
          });

        // First pass: calculate basic event data with hours
        const timedEventsRaw = dayEvents
          .filter((e) => !e.allDay)
          .map((e) => {
            const sub = applySubCalendar(e.title, e.color);
            const start = toTz(new Date(e.start));
            const end = toTz(new Date(e.end));

            const startHourDecimal = start.getHours() + start.getMinutes() / 60;
            const endHourDecimal = end.getHours() + end.getMinutes() / 60;
            const topPx = (startHourDecimal - startHour) * 40;
            const heightPx = Math.max((endHourDecimal - startHourDecimal) * 40, 20);

            const startTime = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
            const endTime = end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });

            return {
              id: e.id,
              title: sub.title,
              color: sub.color,
              topPx,
              heightPx,
              timeStr: `${startTime} - ${endTime}`,
              startHour: startHourDecimal,
              endHour: endHourDecimal,
            };
          });

        // Second pass: calculate columns for overlapping events
        const timedEventsWithColumns = calculateEventColumns(timedEventsRaw);

        const timedEvents = timedEventsWithColumns.map((e) => ({
          id: e.id,
          title: e.title,
          color: e.color,
          topPx: e.topPx,
          heightPx: e.heightPx,
          timeStr: e.timeStr,
          leftPercent: (e.column / e.totalColumns) * 100,
          widthPercent: (1 / e.totalColumns) * 100,
        }));

        // Store event data for modal (keep original title)
        for (const e of dayEvents) {
          const sub = applySubCalendar(e.title, e.color);
          const start = toTz(new Date(e.start));
          const end = toTz(new Date(e.end));

          let timeDisplay: string;
          if (e.allDay) {
            timeDisplay = `${date.getDate()} ${monthNames[date.getMonth()]} (Весь день)`;
          } else {
            const startTime = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
            const endTime = end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
            const dateStr = `${dayNames[dayOfWeek]}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
            timeDisplay = `${dateStr} ${startTime} - ${endTime}`;
          }

          eventsData[e.id] = {
            title: e.title, // Original title with prefix
            timeDisplay,
            location: e.extendedProps.location,
            description: e.extendedProps.description,
            calendarId: sub.calendarId || e.extendedProps.calendarId,
          };
        }

        days.push({
          dayName: dayNames[dayOfWeek],
          dayNum: date.getDate(),
          isToday: false, // Set dynamically below since it changes
          allDayEvents,
          timedEvents,
        });
      }

      // Format week title
      const weekEndDisplay = new Date(weekEnd);
      weekEndDisplay.setDate(weekEndDisplay.getDate() - 1);
      const weekTitle = `${weekStart.getDate()} - ${weekEndDisplay.getDate()} ${monthNames[weekEndDisplay.getMonth()]} ${weekEndDisplay.getFullYear()}`;

      weekData = {
        weekTitle,
        prevWeek: prevWeekDate.toISOString().split('T')[0],
        nextWeek: nextWeekDate.toISOString().split('T')[0],
        startHour,
        days,
        eventsData,
      };

      ssrCache.set(weekKey, weekData);
    }

    // Update isToday dynamically (not cached)
    const daysWithToday = weekData.days.map((day, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return {
        ...day,
        isToday: date.toDateString() === today.toDateString(),
      };
    });

    // Combine calendars and sub-calendars for legend
    const allCalendars = [
      ...config.calendars.map((c) => ({ id: c.id, name: c.name, color: c.color })),
      ...config.subCalendars.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    ];

    // Check if any day has all-day events
    const hasAllDayEvents = daysWithToday.some((day) => day.allDayEvents.length > 0);

    res.render('calendar-ssr', {
      title: 'Календарь',
      calendars: allCalendars,
      refreshInterval: config.cacheTtlMinutes * 60, // seconds for meta refresh
      weekTitle: weekData.weekTitle,
      prevWeek: weekData.prevWeek,
      nextWeek: weekData.nextWeek,
      startHour: weekData.startHour,
      days: daysWithToday,
      eventsData: weekData.eventsData,
      numDays,
      hasAllDayEvents,
    });
  } catch (error) {
    console.error('SSR calendar error:', error);
    res.status(500).send('Failed to load calendar');
  }
});

// API routes
app.use('/api', createApiRoutes(fetcher, config.timezone));

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(config.port, () => {
  console.log(`Calendar app running on http://localhost:${config.port}`);
  console.log(`Configured calendars: ${config.calendars.map((c) => c.name).join(', ') || 'none'}`);
  console.log(`Cache TTL: ${config.cacheTtlMinutes} minutes`);
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
