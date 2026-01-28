import { Router } from 'express';
import multer from 'multer';
import type { Logger } from '../logger.ts';
import type { QBittorrentService } from '../services/qbittorrent.service.ts';
import { mapTorrentState } from '../services/qbittorrent.service.ts';

const upload = multer({ storage: multer.memoryStorage() });

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

  return router;
}
