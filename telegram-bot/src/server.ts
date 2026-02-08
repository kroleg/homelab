import express from 'express';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApiRoutes } from './routes/api.ts';
import { createTelegramService } from './services/telegram.service.ts';
import { createHardwareService } from './services/hardware.service.ts';
import { createCommandHandler } from './services/command-handler.ts';
import { createPollerService } from './services/poller.service.ts';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const telegram = createTelegramService(
  config.telegramBotToken,
  config.telegramChatId,
  logger
);

const hardware = createHardwareService(
  config.sysPath,
  config.procPath,
  config.rootfsPath,
  logger
);

const commandHandler = createCommandHandler(telegram, hardware, logger);
const poller = createPollerService(telegram, commandHandler, logger);

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createApiRoutes(telegram, logger));

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
  poller.start();
});

function shutdown() {
  logger.info('Shutting down...');
  poller.stop();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
