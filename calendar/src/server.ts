import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { ICSFetcher } from './services/ics-fetcher.ts';
import { createApiRoutes } from './routes/api.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfig();
const fetcher = new ICSFetcher(config.calendars, config.cacheTtlMinutes);

const app = express();

// Configure Pug as the view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Parse JSON bodies
app.use(express.json());

// Main calendar page
app.get('/', (_req: Request, res: Response) => {
  res.render('calendar', {
    title: 'Календарь',
    calendars: config.calendars.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    refreshInterval: config.cacheTtlMinutes * 60 * 1000, // Convert to ms
  });
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
