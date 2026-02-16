import { Router } from 'express';
import multer from 'multer';
import type { Logger } from '../logger.ts';
import type { QBittorrentService } from '../services/qbittorrent.service.ts';
import { mapTorrentState } from '../services/qbittorrent.service.ts';
import type { RutrackerService } from '../services/rutracker.service.ts';
import { createPlacementService, determinePlacement, applyPlacement } from '../services/placement.service.ts';

const upload = multer({ storage: multer.memoryStorage() });

const DOWNLOADS_PATH = '/media/downloads';  // staging area
const CATEGORIES = ['tv-shows', 'movies'] as const;

interface UserProfile {
  id: number;
  name: string;
  slug: string;
  isAdmin: boolean;
}

function getUserTag(profile: UserProfile): string {
  return `user-${profile.slug}`;
}

interface WhoamiResponse {
  mac: string | null;
  device: { id: number; customName: string | null; deviceType: string } | null;
  user: UserProfile | null;
  isAdmin: boolean;
}

async function getUserProfile(devicesApiUrl: string, ip: string): Promise<UserProfile | null> {
  try {
    const response = await fetch(`${devicesApiUrl}/api/whoami?ip=${encodeURIComponent(ip)}`);
    if (response.ok) {
      const data = await response.json() as WhoamiResponse;
      if (data.user) {
        return { ...data.user, isAdmin: data.isAdmin };
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  return typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : req.ip || '';
}

interface CategoryDetection {
  category: 'tv-shows' | 'movies';
  confidence: 'high' | 'low';
}

function detectCategory(name: string): CategoryDetection {
  // High-confidence TV patterns (very reliable indicators)
  const highConfidenceTvPatterns = [
    /\bs\d{1,2}e\d{1,2}\b/i,     // S01E01
    /\bserial\b/i,               // [SERIAL] tag
    /\bсерии:\s*\d/i,            // "Серии: 1-10"
    /\bсезон:\s*\d/i,            // "Сезон: 1"
    /[._-]S\d{1,2}[._-]/i,       // .S02. season pattern
  ];

  for (const pattern of highConfidenceTvPatterns) {
    if (pattern.test(name)) {
      return { category: 'tv-shows', confidence: 'high' };
    }
  }

  // Low confidence - default to movies but require manual selection
  return { category: 'movies', confidence: 'low' };
}

export function createApiRoutes(logger: Logger, qbt: QBittorrentService, devicesApiUrl: string, rutracker: RutrackerService): Router {
  const router = Router();
  const placementService = createPlacementService(qbt, logger);

  // Helper to tag torrent with user's tag
  async function tagTorrentForUser(hash: string, clientIp: string): Promise<void> {
    const profile = await getUserProfile(devicesApiUrl, clientIp);
    if (profile) {
      const tag = getUserTag(profile);
      await qbt.createTags([tag]);
      await qbt.addTags(hash, [tag]);
      logger.info(`Tagged torrent ${hash} with ${tag}`);
    }
  }

  router.post('/upload', upload.single('torrent'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No torrent file provided' });
        return;
      }

      const clientIp = getClientIp(req);
      const existingTorrents = await qbt.listTorrents();
      const existingHashes = new Set(existingTorrents.map(t => t.hash));

      await qbt.addTorrent(file.buffer, file.originalname);

      setTimeout(async () => {
        try {
          const torrents = await qbt.listTorrents();
          const newTorrent = torrents.find(t => !existingHashes.has(t.hash));
          if (newTorrent) {
            await tagTorrentForUser(newTorrent.hash, clientIp);
          }
        } catch (e) {
          logger.warn('Failed to tag uploaded torrent', { error: e });
        }
      }, 1000);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to upload torrent', { error });
      res.status(500).json({ error: 'Failed to upload torrent' });
    }
  });

  router.post('/magnet', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || !url.startsWith('magnet:')) {
        res.status(400).json({ error: 'Invalid magnet link' });
        return;
      }

      const clientIp = getClientIp(req);
      const existingTorrents = await qbt.listTorrents();
      const existingHashes = new Set(existingTorrents.map(t => t.hash));

      await qbt.addMagnet(url);

      setTimeout(async () => {
        try {
          const torrents = await qbt.listTorrents();
          const newTorrent = torrents.find(t => !existingHashes.has(t.hash));
          if (newTorrent) {
            await tagTorrentForUser(newTorrent.hash, clientIp);
          }
        } catch (e) {
          logger.warn('Failed to tag magnet torrent', { error: e });
        }
      }, 2000);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to add magnet link', { error });
      res.status(500).json({ error: 'Failed to add magnet link' });
    }
  });

  router.post('/delete/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      const deleteFiles = req.query.deleteFiles === 'true';
      await qbt.deleteTorrent(hash, deleteFiles);
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete torrent', { error });
      res.status(500).json({ error: 'Failed to delete torrent' });
    }
  });

  router.post('/rename/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      await qbt.renameTorrent(hash, name.trim());
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to rename torrent', { error });
      res.status(500).json({ error: 'Failed to rename torrent' });
    }
  });

  router.get('/torrents', async (req, res) => {
    try {
      const torrents = await qbt.listTorrents();
      const mapped = torrents.map(t => ({
        hash: t.hash,
        name: t.name,
        progress: Math.round(t.progress * 100),
        state: mapTorrentState(t.state),
      }));
      res.json(mapped);
    } catch (error) {
      logger.error('Failed to list torrents', { error });
      res.status(500).json({ error: 'Failed to list torrents' });
    }
  });

  // Move torrent to category (manual categorization from UI)
  router.post('/move/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      const { category, name } = req.body;

      if (!category || !CATEGORIES.includes(category)) {
        res.status(400).json({ error: 'Invalid category' });
        return;
      }

      const files = await qbt.getTorrentFiles(hash);
      const placement = determinePlacement(name || '', category, files);

      if (!placement) {
        res.status(400).json({ error: 'Could not determine folder name' });
        return;
      }

      await applyPlacement(qbt, logger, hash, files, placement);
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to move torrent', { error });
      res.status(500).json({ error: 'Failed to move torrent' });
    }
  });

  // Fix all torrents in tv-shows/movies folders
  router.post('/fix-paths', async (req, res) => {
    try {
      const torrents = await qbt.listTorrents();
      const results: { hash: string; name: string; status: string; error?: string }[] = [];

      for (const torrent of torrents) {
        // Determine category from current path
        let category: 'tv-shows' | 'movies' | null = null;
        if (torrent.save_path.includes('/tv-shows')) {
          category = 'tv-shows';
        } else if (torrent.save_path.includes('/movies')) {
          category = 'movies';
        }

        if (!category) {
          results.push({ hash: torrent.hash, name: torrent.name, status: 'skipped', error: 'Not in tv-shows or movies' });
          continue;
        }

        try {
          const files = await qbt.getTorrentFiles(torrent.hash);
          const placement = determinePlacement(torrent.name, category, files);

          if (!placement) {
            results.push({ hash: torrent.hash, name: torrent.name, status: 'skipped', error: 'Could not determine placement' });
            continue;
          }

          await applyPlacement(qbt, logger, torrent.hash, files, placement);
          results.push({ hash: torrent.hash, name: torrent.name, status: 'fixed' });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          results.push({ hash: torrent.hash, name: torrent.name, status: 'error', error: errMsg });
        }
      }

      logger.info('Fix paths completed', { results });
      res.json({ success: true, results });
    } catch (error) {
      logger.error('Failed to fix paths', { error });
      res.status(500).json({ error: 'Failed to fix paths' });
    }
  });

  // Auto-move on torrent completion (called by qBittorrent hook)
  router.post('/complete/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      logger.info(`Torrent completed: ${hash}`);

      const torrent = await qbt.getTorrentInfo(hash);
      if (!torrent) {
        logger.warn(`Torrent not found: ${hash}`);
        res.status(404).json({ error: 'Torrent not found' });
        return;
      }

      // Only process torrents in staging download path
      if (torrent.save_path !== DOWNLOADS_PATH) {
        logger.info(`Skipping already moved torrent: ${torrent.name}`);
        res.json({ success: true, skipped: true, reason: 'Already moved' });
        return;
      }

      const detection = detectCategory(torrent.name);

      // Skip auto-move for low confidence - let user manually select category
      if (detection.confidence !== 'high') {
        logger.info(`Low confidence detection for "${torrent.name}", leaving for manual categorization`);
        res.json({ success: true, skipped: true, reason: 'Awaiting manual categorization' });
        return;
      }

      const files = await qbt.getTorrentFiles(hash);
      const placement = determinePlacement(torrent.name, detection.category, files);

      if (!placement) {
        logger.warn(`Could not determine placement: ${torrent.name}`);
        res.json({ success: true, skipped: true, reason: 'Could not determine placement' });
        return;
      }

      await applyPlacement(qbt, logger, hash, files, placement);
      logger.info(`Auto-moved torrent to ${detection.category}: ${torrent.name}`);
      res.json({ success: true, category: detection.category, showName: placement.showName });
    } catch (error) {
      logger.error('Failed to process completed torrent', { error });
      res.status(500).json({ error: 'Failed to process completed torrent' });
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const query = req.query.q;
      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Missing search query' });
        return;
      }

      const results = await rutracker.search(query);
      res.json(results);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Search failed: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.get('/search/details/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Missing torrent id' });
        return;
      }

      const details = await rutracker.getTopicDetails(id);
      res.json(details);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Get topic details failed: ${msg}`);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/search/download', async (req, res) => {
    try {
      const { id, name } = req.body;
      if (!id) {
        res.status(400).json({ error: 'Missing torrent id' });
        return;
      }

      const clientIp = getClientIp(req);
      const existingTorrents = await qbt.listTorrents();
      const existingHashes = new Set(existingTorrents.map(t => t.hash));

      const { buffer, filename } = await rutracker.downloadTorrent(id);
      logger.info(`Downloaded torrent from RuTracker: ${name || filename}`);

      await qbt.addTorrent(buffer, filename);

      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        try {
          const torrents = await qbt.listTorrents();
          const newTorrent = torrents.find(t => !existingHashes.has(t.hash));
          if (newTorrent) {
            await tagTorrentForUser(newTorrent.hash, clientIp);
            break;
          }
        } catch (e) {
          logger.warn('Failed to tag search-downloaded torrent', { error: e });
        }
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Search download failed', { error });
      res.status(500).json({ error: 'Failed to download torrent' });
    }
  });

  // Analyze torrent placements - returns both misplaced and correct
  router.get('/placement', async (req, res) => {
    try {
      const placements = await placementService.getAllPlacements();
      res.json(placements);
    } catch (error) {
      logger.error('Failed to analyze placement', { error });
      res.status(500).json({ error: 'Failed to analyze placement' });
    }
  });

  // Fix a single misplaced torrent
  router.post('/placement/fix/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      await placementService.fixPlacement(hash);
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to fix placement', { error });
      const msg = error instanceof Error ? error.message : 'Failed to fix placement';
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
