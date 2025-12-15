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
  days: Array<{
    dayName: string;
    dayNum: number;
    isToday: boolean;
    allDayEvents: Array<{ id: string; title: string; color: string }>;
    timedEvents: Array<{ id: string; title: string; color: string; topPx: number; heightPx: number; timeStr: string }>;
  }>;
  eventsData: Record<string, { title: string; timeDisplay: string; location?: string; description?: string; calendarId: string }>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const fetcher = new ICSFetcher(config.calendars, config.cacheTtlMinutes);
const ssrCache = new Cache<SSRWeekData>(config.cacheTtlMinutes);

// Helper to apply sub-calendar prefix matching
// Matches prefix with variations: "Вася: ", "Вася:", "Вася " for prefix "Вася"
function applySubCalendar(title: string, defaultColor: string): { title: string; color: string; calendarId: string } {
  for (const sub of config.subCalendars) {
    // Try variations: "prefix: ", "prefix:", "prefix "
    const variations = [
      sub.prefix + ': ',
      sub.prefix + ':',
      sub.prefix + ' ',
    ];
    for (const variant of variations) {
      if (title.startsWith(variant)) {
        return {
          title: title.slice(variant.length).trim(),
          color: sub.color,
          calendarId: sub.id,
        };
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

// Main calendar page (server-side rendered)
app.get('/', async (req: Request, res: Response) => {
  try {
    // Parse week parameter or use current week
    const weekParam = req.query.week as string | undefined;
    const today = new Date();

    let weekStart: Date;
    if (weekParam) {
      weekStart = new Date(weekParam);
      // Adjust to Monday if needed
      const dayOfWeek = weekStart.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(weekStart.getDate() + diff);
    } else {
      // Get current week's Monday
      weekStart = new Date(today);
      const dayOfWeek = weekStart.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setDate(weekStart.getDate() + diff);
    }
    weekStart.setHours(0, 0, 0, 0);

    const weekKey = weekStart.toISOString().split('T')[0];

    // Check cache first
    let weekData = ssrCache.get(weekKey);

    if (!weekData) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      // Calculate prev/next week dates
      const prevWeekDate = new Date(weekStart);
      prevWeekDate.setDate(prevWeekDate.getDate() - 7);
      const nextWeekDate = new Date(weekStart);
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);

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

      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);

        const dayOfWeek = date.getDay();

        // Filter events for this day
        const dayEvents = events.filter((event) => {
          const eventStart = new Date(event.start);
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

        const timedEvents = dayEvents
          .filter((e) => !e.allDay)
          .map((e) => {
            const sub = applySubCalendar(e.title, e.color);
            const start = new Date(e.start);
            const end = new Date(e.end);

            // Calculate position (top) based on start time
            // 6:00 is row 1, each hour is 40px
            const startHour = start.getHours() + start.getMinutes() / 60;
            const endHour = end.getHours() + end.getMinutes() / 60;
            const topPx = (startHour - 6) * 40;
            const heightPx = Math.max((endHour - startHour) * 40, 20);

            // Format time string
            const startTime = start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
            const endTime = end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });

            return {
              id: e.id,
              title: sub.title,
              color: sub.color,
              topPx,
              heightPx,
              timeStr: `${startTime} - ${endTime}`,
            };
          });

        // Store event data for modal (keep original title)
        for (const e of dayEvents) {
          const sub = applySubCalendar(e.title, e.color);
          const start = new Date(e.start);
          const end = new Date(e.end);

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

    res.render('calendar-ssr', {
      title: 'Календарь',
      calendars: allCalendars,
      refreshInterval: config.cacheTtlMinutes * 60, // seconds for meta refresh
      weekTitle: weekData.weekTitle,
      prevWeek: weekData.prevWeek,
      nextWeek: weekData.nextWeek,
      days: daysWithToday,
      eventsData: weekData.eventsData,
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
