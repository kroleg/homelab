import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig } from './config.ts';
import { logger } from './logger.ts';
import { initDatabase, runMigrations, closeDatabase } from './storage/db.ts';
import { createWatcherRepository } from './storage/watcher.repository.ts';
import { createTelegramNotifier } from './services/notifier/telegram.notifier.ts';
import { createScheduler } from './services/scheduler.service.ts';
import { createApiRouter } from './api/watchers.api.ts';
import { createUiRouter } from './ui/watchers.routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const config = loadConfig();

  // Initialize database
  const db = initDatabase(config.postgres);
  await runMigrations(db);

  // Create repositories and services
  const repository = createWatcherRepository(db);
  const notifier = createTelegramNotifier(config.telegram.botToken, config.telegram.chatId);
  const scheduler = createScheduler(repository, notifier);

  // Load active watchers
  await scheduler.loadActiveWatchers();

  // Create Express app
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Set up Pug templates
  app.set('view engine', 'pug');
  app.set('views', join(__dirname, 'ui/views'));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Routes
  app.use('/api', createApiRouter(repository, scheduler));
  app.use('/', createUiRouter(repository, scheduler));

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  const server = app.listen(config.port, () => {
    logger.info(`Page Watcher running on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    scheduler.stopAll();
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  logger.error('Failed to start:', error);
  process.exit(1);
});
