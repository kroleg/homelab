import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApiRoutes } from './routes/api.ts';
import { createQBittorrentService, mapTorrentState, type TorrentInfo } from './services/qbittorrent.service.ts';
import { createRutrackerService } from './services/rutracker.service.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const logger = createLogger(config.logLevel);
const qbt = createQBittorrentService(config.qbittorrentUrl, logger);
const rutracker = createRutrackerService(config.rutrackerCookie, logger);

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

interface UserProfile {
  id: string;
  name: string;
  isAdmin: boolean;
}

function getUserTag(profile: UserProfile): string {
  return `user-${profile.id.toLowerCase()}`;
}

async function getUserProfile(ip: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(`${config.keeneticApiUrl}/api/client?ip=${encodeURIComponent(ip)}`);
    if (response.ok) {
      const data = await response.json() as { name: string; profile: UserProfile | null };
      return data.profile;
    }
  } catch (error) {
    logger.debug(`Failed to get user profile for IP ${ip}:`, error);
  }
  return null;
}

async function getAllProfiles(): Promise<UserProfile[]> {
  try {
    const response = await fetch(`${config.keeneticApiUrl}/api/profiles`);
    if (response.ok) {
      return await response.json() as UserProfile[];
    }
  } catch (error) {
    logger.debug('Failed to get profiles:', error);
  }
  return [];
}

interface MappedTorrent {
  hash: string;
  name: string;
  tags: string;
  displayName: string;
  displayState: string;
  progressPercent: number;
  showMoveButtons: boolean;
  suggestTvShows: boolean;
  relativePath: string;
  contentFolder: string;
  jellyfinLink: string;
}

interface TorrentSection {
  title: string;
  torrents: MappedTorrent[];
  collapsed: boolean;
}

function mapTorrent(t: TorrentInfo, files: { name: string }[]): MappedTorrent {
  const inBasePath = t.save_path === BASE_PATH;
  const isSerial = t.name.includes('SERIAL');

  let relativePath = t.save_path;
  if (relativePath.startsWith(BASE_PATH)) {
    relativePath = relativePath.slice(BASE_PATH.length);
    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
  }

  let contentFolder = '';
  if (files.length > 0) {
    const firstFilePath = files[0].name;
    const rootFolder = firstFilePath.split('/')[0];
    if (rootFolder && rootFolder !== firstFilePath) {
      const subfolders = new Set<string>();
      for (const file of files) {
        const parts = file.name.split('/');
        if (parts.length >= 3) {
          subfolders.add(parts[1]);
        }
      }
      if (subfolders.size > 0) {
        contentFolder = `${rootFolder} / ${Array.from(subfolders).sort().join(', ')}`;
      } else {
        contentFolder = rootFolder;
      }
    }
  }

  let jellyfinLink = '';
  if (relativePath.startsWith('tv-shows')) {
    jellyfinLink = 'http://media.internal/web/index.html#!/tv.html';
  } else if (relativePath.startsWith('movies')) {
    jellyfinLink = 'http://media.internal/web/index.html#!/movies.html';
  }

  return {
    hash: t.hash,
    name: t.name,
    tags: t.tags,
    displayName: trimDisplayName(t.name),
    displayState: mapTorrentState(t.state),
    progressPercent: Math.round(t.progress * 100),
    showMoveButtons: inBasePath && t.progress === 1,
    suggestTvShows: isSerial,
    relativePath: relativePath || '/',
    contentFolder,
    jellyfinLink,
  };
}

app.get('/upload', async (req, res) => {
  try {
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip || '';

    const [freeSpace, userProfile] = await Promise.all([
      qbt.getFreeSpace(),
      getUserProfile(clientIp),
    ]);

    if (!userProfile) {
      res.render('access-denied', { clientIp });
      return;
    }

    res.render('upload', { freeSpace: formatBytes(freeSpace), userProfile, backLink: '/', pageTitle: 'Вручную' });
  } catch (error) {
    logger.error('Failed to load upload page', { error });
    res.render('upload', { freeSpace: null, userProfile: null, backLink: '/', pageTitle: 'Вручную' });
  }
});

app.get('/', async (req, res) => {
  try {
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip || '';

    const [freeSpace, userProfile] = await Promise.all([
      qbt.getFreeSpace(),
      getUserProfile(clientIp),
    ]);

    if (!userProfile) {
      res.render('access-denied', { clientIp });
      return;
    }

    const torrents = await qbt.listTorrents();

    const filesPromises = torrents.map(t =>
      qbt.getTorrentFiles(t.hash).catch(() => [])
    );
    const allFiles = await Promise.all(filesPromises);

    const mappedTorrents = torrents.map((t, i) => mapTorrent(t, allFiles[i]));

    if (userProfile.isAdmin) {
      // Admin view: group by user
      const profiles = await getAllProfiles();
      const myTag = getUserTag(userProfile);

      // Build tag -> profile name map
      const tagToName: Record<string, string> = {};
      for (const p of profiles) {
        tagToName[getUserTag(p)] = p.name;
      }

      // Group torrents
      const myTorrents: MappedTorrent[] = [];
      const otherUserTorrents: Record<string, MappedTorrent[]> = {};
      const untaggedTorrents: MappedTorrent[] = [];

      for (const t of mappedTorrents) {
        const torrentTags = t.tags ? t.tags.split(',').map(s => s.trim()) : [];
        const userTags = torrentTags.filter(tag => tag.startsWith('user-'));

        if (userTags.length === 0) {
          untaggedTorrents.push(t);
        } else if (userTags.includes(myTag)) {
          myTorrents.push(t);
        } else {
          // Find the first user tag and group by it
          const tag = userTags[0];
          if (!otherUserTorrents[tag]) {
            otherUserTorrents[tag] = [];
          }
          otherUserTorrents[tag].push(t);
        }
      }

      // Build sections
      const sections: TorrentSection[] = [];

      // My torrents (not collapsed, no title needed - shown directly)
      // Other users' torrents
      for (const tag of Object.keys(otherUserTorrents).sort()) {
        const name = tagToName[tag] || tag.replace('user-', '');
        sections.push({
          title: `${name} (${otherUserTorrents[tag].length})`,
          torrents: otherUserTorrents[tag],
          collapsed: true,
        });
      }

      // Untagged torrents
      if (untaggedTorrents.length > 0) {
        sections.push({
          title: `Без владельца (${untaggedTorrents.length})`,
          torrents: untaggedTorrents,
          collapsed: true,
        });
      }

      res.render('index', {
        torrents: myTorrents,
        sections,
        freeSpace: formatBytes(freeSpace),
        userProfile,
      });
    } else {
      // Regular user: only show their torrents
      const userTag = getUserTag(userProfile);
      const userTorrents = mappedTorrents.filter(t => {
        const torrentTags = t.tags ? t.tags.split(',').map(s => s.trim()) : [];
        return torrentTags.includes(userTag);
      });

      res.render('index', {
        torrents: userTorrents,
        sections: [],
        freeSpace: formatBytes(freeSpace),
        userProfile,
      });
    }
  } catch (error) {
    logger.error('Failed to load torrents', { error });
    res.render('index', { torrents: [], sections: [], error: 'Failed to load torrents', userProfile: null });
  }
});

app.get('/search', async (req, res) => {
  try {
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip || '';

    const userProfile = await getUserProfile(clientIp);

    if (!userProfile) {
      res.render('access-denied', { clientIp });
      return;
    }

    res.render('search', { userProfile, backLink: '/', pageTitle: 'Поиск' });
  } catch (error) {
    logger.error('Failed to load search page', { error });
    res.render('search', { userProfile: null, backLink: '/', pageTitle: 'Поиск' });
  }
});

app.use('/api', createApiRoutes(logger, qbt, config.keeneticApiUrl, rutracker));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, async () => {
  logger.info(`Server running on port ${config.port}`);

  // Configure qBittorrent to call us when a torrent completes
  try {
    await qbt.setAutorunHook(`${config.selfUrl}/api/complete`);
  } catch (error) {
    logger.error('Failed to configure qBittorrent autorun hook', { error });
  }
});

function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
