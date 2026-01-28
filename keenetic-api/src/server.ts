import express from 'express';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApiRoutes } from './routes/api.ts';
import { createKeeneticService } from './services/keenetic.service.ts';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const keenetic = createKeeneticService({
  host: config.keeneticHost,
  login: config.keeneticLogin,
  password: config.keeneticPassword,
  profiles: config.profiles,
  logger,
});

logger.info(`Loaded ${config.profiles.length} profiles: ${config.profiles.map(p => p.name).join(', ')}`);

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createApiRoutes(logger, keenetic));

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Keenetic API running on port ${config.port}`);
});

function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
