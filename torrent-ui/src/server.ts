import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApiRoutes } from './routes/api.ts';
import { createQBittorrentService, mapTorrentState } from './services/qbittorrent.service.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const logger = createLogger(config.logLevel);
const qbt = createQBittorrentService(config.qbittorrentUrl, logger);

const app = express();
app.use(express.json());

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, '..', 'views'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  const gb = mb / 1024;
  return gb.toFixed(1) + ' GB';
}

app.get('/', async (req, res) => {
  try {
    const [torrents, freeSpace] = await Promise.all([
      qbt.listTorrents(),
      qbt.getFreeSpace(),
    ]);
    const mappedTorrents = torrents.map(t => ({
      ...t,
      displayState: mapTorrentState(t.state),
      progressPercent: Math.round(t.progress * 100),
    }));
    res.render('index', { torrents: mappedTorrents, freeSpace: formatBytes(freeSpace) });
  } catch (error) {
    logger.error('Failed to load torrents', { error });
    res.render('index', { torrents: [], error: 'Failed to load torrents' });
  }
});

app.use('/api', createApiRoutes(logger, qbt));

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
