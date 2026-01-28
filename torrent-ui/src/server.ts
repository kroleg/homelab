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

function trimDisplayName(name: string): string {
  // Remove [SERIAL] or similar tags at the start
  let trimmed = name.replace(/^\[.*?\]\s*/, '');

  // Remove author in parentheses after series info
  trimmed = trimmed.replace(/\s*\([^)]+\/[^)]+\)/, '');

  // Remove complete series info (e.g., "/ Серии: 1-25 из 25" where range equals total)
  trimmed = trimmed.replace(/\s*\/\s*Серии:\s*(\d+)-(\d+)\s+из\s+(\d+)/g, (match, start, end, total) => {
    const rangeCount = parseInt(end) - parseInt(start) + 1;
    if (rangeCount === parseInt(total)) {
      return ''; // Complete season, hide it
    }
    return match; // Incomplete, keep it
  });

  // Remove everything after remaining content (starting with " (" for directors or " [" for year)
  trimmed = trimmed.replace(/\s+\([^)]*(?:,|\.)[^)]*\).*$/, '');
  trimmed = trimmed.replace(/\s+\[\d{4}.*$/, '');

  return trimmed.trim();
}

const BASE_PATH = '/media/downloads';

app.get('/', async (req, res) => {
  try {
    const [torrents, freeSpace] = await Promise.all([
      qbt.listTorrents(),
      qbt.getFreeSpace(),
    ]);

    // Fetch content folder names in parallel
    const filesPromises = torrents.map(t =>
      qbt.getTorrentFiles(t.hash).catch(() => [])
    );
    const allFiles = await Promise.all(filesPromises);

    const mappedTorrents = torrents.map((t, i) => {
      const inBasePath = t.save_path === BASE_PATH;
      const isSerial = t.name.includes('SERIAL');
      // Get relative path (remove base path prefix)
      let relativePath = t.save_path;
      if (relativePath.startsWith(BASE_PATH)) {
        relativePath = relativePath.slice(BASE_PATH.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
      }

      // Get content folder name from files
      const files = allFiles[i];
      let contentFolder = '';
      if (files.length > 0) {
        const firstFilePath = files[0].name;
        const rootFolder = firstFilePath.split('/')[0];
        if (rootFolder && rootFolder !== firstFilePath) {
          // Check for subfolders (files at depth 3+ means root/subfolder/file)
          const subfolders = new Set<string>();
          for (const file of files) {
            const parts = file.name.split('/');
            if (parts.length >= 3) {
              subfolders.add(parts[1]);
            }
          }
          if (subfolders.size > 0) {
            // Multi-season: show root folder + subfolders
            contentFolder = `${rootFolder} / ${Array.from(subfolders).sort().join(', ')}`;
          } else {
            contentFolder = rootFolder;
          }
        }
      }
      // Generate Jellyfin link based on category
      let jellyfinLink = '';
      if (relativePath.startsWith('tv-shows')) {
        jellyfinLink = 'http://media.internal/web/index.html#!/tv.html';
      } else if (relativePath.startsWith('movies')) {
        jellyfinLink = 'http://media.internal/web/index.html#!/movies.html';
      }

      return {
        ...t,
        displayName: trimDisplayName(t.name),
        displayState: mapTorrentState(t.state),
        progressPercent: Math.round(t.progress * 100),
        showMoveButtons: inBasePath && t.progress === 1,
        suggestTvShows: isSerial,
        relativePath: relativePath || '/',
        contentFolder,
        jellyfinLink,
      };
    });
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
