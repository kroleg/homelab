import { Router, type Request, type Response } from 'express';
import type { ICSFetcher } from '../services/ics-fetcher.ts';

export function createApiRoutes(fetcher: ICSFetcher, timezone: string): Router {
  const router = Router();

  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  // Get events for date range (FullCalendar compatible)
  // Accepts dates in YYYY-MM-DD format, applies configured timezone
  router.get('/events', async (req: Request, res: Response) => {
    try {
      const { start, end } = req.query;

      if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
        res.status(400).json({ error: 'start and end query parameters are required' });
        return;
      }

      if (!DATE_REGEX.test(start) || !DATE_REGEX.test(end)) {
        res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
        return;
      }

      // Parse date-only format (YYYY-MM-DD) with configured timezone
      const startDate = new Date(`${start}T00:00:00${timezone}`);
      const endDate = new Date(`${end}T23:59:59${timezone}`);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({ error: 'Invalid date' });
        return;
      }

      const events = await fetcher.fetchEvents(startDate, endDate);
      res.json(events);
    } catch (error) {
      console.error('Error fetching events:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // Get list of configured calendars
  router.get('/calendars', (_req: Request, res: Response) => {
    const calendars = fetcher.getCalendars().map((cal) => ({
      id: cal.id,
      name: cal.name,
      color: cal.color,
    }));
    res.json(calendars);
  });

  // Force cache refresh
  router.post('/refresh', (_req: Request, res: Response) => {
    fetcher.invalidateCache();
    res.json({ success: true, message: 'Cache invalidated' });
  });

  // Health check
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      calendars: fetcher.getCalendars().length,
      timestamp: new Date().toISOString(),
    });
  });

  // Cache status check for loading page polling
  router.get('/cache-status', (_req: Request, res: Response) => {
    res.json({ ready: fetcher.isCached() });
  });

  return router;
}
