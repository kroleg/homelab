import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createKeeneticClient } from './services/keenetic-client.ts';
import { createRulesRouter } from './routes/rules.routes.ts';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const api = createKeeneticClient(config.keeneticApiUrl, logger);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/rules', createRulesRouter(api, logger, config.defaultVpnInterface));

app.get('/', (_req: Request, res: Response) => {
  res.redirect('/rules');
});

const server = app.listen(config.port, () => {
  logger.info(`DNS Routes UI running on port ${config.port}`);
});

function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
