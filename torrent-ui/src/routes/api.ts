import { Router } from 'express';
import multer from 'multer';
import type { Logger } from '../logger.ts';
import type { QBittorrentService } from '../services/qbittorrent.service.ts';
import { mapTorrentState } from '../services/qbittorrent.service.ts';
import { extractShowDisplayName, extractSeasonFolder, isMultiSeason, normalizeSeasonFolder } from '../utils/folder-path.ts';

const upload = multer({ storage: multer.memoryStorage() });

const BASE_PATH = '/media/downloads';
const CATEGORIES = ['tv-shows', 'movies'] as const;

function detectCategory(name: string): 'tv-shows' | 'movies' {
  // Check for TV show indicators
  const tvPatterns = [
    /\bserial\b/i,
    /\bseason\b/i,
    /\bs\d{1,2}\b/i,         // S01, S1, etc.
    /\bs\d{1,2}e\d{1,2}\b/i, // S01E01
    /сезон/i,
    /серия/i,
    /серии/i,
    /\bсерии:\s*\d/i,
  ];

  for (const pattern of tvPatterns) {
    if (pattern.test(name)) {
      return 'tv-shows';
    }
  }

  return 'movies';
}

export function createApiRoutes(logger: Logger, qbt: QBittorrentService): Router {
  const router = Router();

  router.post('/upload', upload.single('torrent'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No torrent file provided' });
        return;
      }

      await qbt.addTorrent(file.buffer, file.originalname);
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

      await qbt.addMagnet(url);
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

  router.post('/move/:hash', async (req, res) => {
    try {
      const { hash } = req.params;
      const { category, name } = req.body;

      if (!category || !CATEGORIES.includes(category)) {
        res.status(400).json({ error: 'Invalid category' });
        return;
      }

      const showName = extractShowDisplayName(name || '');
      if (!showName) {
        res.status(400).json({ error: 'Could not determine folder name' });
        return;
      }

      const files = await qbt.getTorrentFiles(hash);
      const rootFolder = files.length > 0 ? files[0].name.split('/')[0] : null;
      const hasFolder = rootFolder && rootFolder !== files[0]?.name;

      if (isMultiSeason(name || '')) {
        // Multi-season: move to category root, rename main folder to show name
        const location = `${BASE_PATH}/${category}`;
        await qbt.moveTorrent(hash, location);

        if (hasFolder && rootFolder !== showName) {
          await qbt.renameTorrentFolder(hash, rootFolder, showName);
        }

        // Find and rename season subfolders
        const subfolders = new Set<string>();
        for (const file of files) {
          const parts = file.name.split('/');
          if (parts.length >= 2) {
            subfolders.add(parts[1]);
          }
        }

        for (const subfolder of subfolders) {
          const normalized = normalizeSeasonFolder(subfolder);
          if (normalized && normalized !== subfolder) {
            const oldPath = `${showName}/${subfolder}`;
            const newPath = `${showName}/${normalized}`;
            try {
              await qbt.renameTorrentFolder(hash, oldPath, newPath);
            } catch (e) {
              logger.warn(`Failed to rename subfolder ${oldPath}`, { error: e });
            }
          }
        }
      } else {
        // Single season or movie: move to show folder
        const location = `${BASE_PATH}/${category}/${showName}`;
        await qbt.moveTorrent(hash, location);

        // Rename content folder to "Season XX" if single season
        const seasonFolder = extractSeasonFolder(name || '');
        if (seasonFolder && hasFolder) {
          await qbt.renameTorrentFolder(hash, rootFolder, seasonFolder);
        }
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to move torrent', { error });
      res.status(500).json({ error: 'Failed to move torrent' });
    }
  });

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

        const showName = extractShowDisplayName(torrent.name);
        if (!showName) {
          results.push({ hash: torrent.hash, name: torrent.name, status: 'skipped', error: 'Could not extract show name' });
          continue;
        }

        try {
          const files = await qbt.getTorrentFiles(torrent.hash);
          const rootFolder = files.length > 0 ? files[0].name.split('/')[0] : null;
          const hasFolder = rootFolder && rootFolder !== files[0]?.name;

          if (isMultiSeason(torrent.name)) {
            // Multi-season: move to category root, rename main folder to show name
            const location = `${BASE_PATH}/${category}`;
            await qbt.moveTorrent(torrent.hash, location);

            if (hasFolder && rootFolder !== showName) {
              await qbt.renameTorrentFolder(torrent.hash, rootFolder, showName);
            }

            // Find and rename season subfolders
            const subfolders = new Set<string>();
            for (const file of files) {
              const parts = file.name.split('/');
              if (parts.length >= 2) {
                subfolders.add(parts[1]);
              }
            }

            for (const subfolder of subfolders) {
              const normalized = normalizeSeasonFolder(subfolder);
              if (normalized && normalized !== subfolder) {
                const oldPath = `${showName}/${subfolder}`;
                const newPath = `${showName}/${normalized}`;
                try {
                  await qbt.renameTorrentFolder(torrent.hash, oldPath, newPath);
                } catch (e) {
                  logger.warn(`Failed to rename subfolder ${oldPath}`, { error: e });
                }
              }
            }
          } else {
            // Single season or movie: move to show folder
            const location = `${BASE_PATH}/${category}/${showName}`;
            await qbt.moveTorrent(torrent.hash, location);

            // Rename content folder to "Season XX" if single season
            const seasonFolder = extractSeasonFolder(torrent.name);
            if (seasonFolder && hasFolder && rootFolder !== seasonFolder) {
              await qbt.renameTorrentFolder(torrent.hash, rootFolder, seasonFolder);
            }
          }

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

      // Only process torrents in base download path
      if (torrent.save_path !== BASE_PATH) {
        logger.info(`Skipping already moved torrent: ${torrent.name}`);
        res.json({ success: true, skipped: true, reason: 'Already moved' });
        return;
      }

      const category = detectCategory(torrent.name);
      const showName = extractShowDisplayName(torrent.name);

      if (!showName) {
        logger.warn(`Could not extract show name: ${torrent.name}`);
        res.json({ success: true, skipped: true, reason: 'Could not extract show name' });
        return;
      }

      const files = await qbt.getTorrentFiles(hash);
      const rootFolder = files.length > 0 ? files[0].name.split('/')[0] : null;
      const hasFolder = rootFolder && rootFolder !== files[0]?.name;

      if (isMultiSeason(torrent.name)) {
        const location = `${BASE_PATH}/${category}`;
        await qbt.moveTorrent(hash, location);

        if (hasFolder && rootFolder !== showName) {
          await qbt.renameTorrentFolder(hash, rootFolder, showName);
        }

        const subfolders = new Set<string>();
        for (const file of files) {
          const parts = file.name.split('/');
          if (parts.length >= 2) {
            subfolders.add(parts[1]);
          }
        }

        for (const subfolder of subfolders) {
          const normalized = normalizeSeasonFolder(subfolder);
          if (normalized && normalized !== subfolder) {
            const oldPath = `${showName}/${subfolder}`;
            const newPath = `${showName}/${normalized}`;
            try {
              await qbt.renameTorrentFolder(hash, oldPath, newPath);
            } catch (e) {
              logger.warn(`Failed to rename subfolder ${oldPath}`, { error: e });
            }
          }
        }
      } else {
        const location = `${BASE_PATH}/${category}/${showName}`;
        await qbt.moveTorrent(hash, location);

        const seasonFolder = extractSeasonFolder(torrent.name);
        if (seasonFolder && hasFolder) {
          await qbt.renameTorrentFolder(hash, rootFolder, seasonFolder);
        }
      }

      logger.info(`Auto-moved torrent to ${category}: ${torrent.name}`);
      res.json({ success: true, category, showName });
    } catch (error) {
      logger.error('Failed to process completed torrent', { error });
      res.status(500).json({ error: 'Failed to process completed torrent' });
    }
  });

  return router;
}
