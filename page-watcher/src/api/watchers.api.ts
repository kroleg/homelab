import { Router } from 'express';
import type { WatcherRepository } from '../storage/watcher.repository.ts';
import type { Scheduler } from '../services/scheduler.service.ts';
import { checkPage } from '../services/checker.service.ts';
import { logger } from '../logger.ts';

export function createApiRouter(repository: WatcherRepository, scheduler: Scheduler): Router {
  const router = Router();

  // List all watchers
  router.get('/watchers', async (_req, res) => {
    try {
      const watchers = await repository.findAll();
      res.json(watchers);
    } catch (error) {
      logger.error('Failed to list watchers', { error });
      res.status(500).json({ error: 'Failed to list watchers' });
    }
  });

  // Get single watcher
  router.get('/watchers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const watcher = await repository.findById(id);
      if (!watcher) {
        res.status(404).json({ error: 'Watcher not found' });
        return;
      }
      res.json(watcher);
    } catch (error) {
      logger.error('Failed to get watcher', { error });
      res.status(500).json({ error: 'Failed to get watcher' });
    }
  });

  // Create watcher
  router.post('/watchers', async (req, res) => {
    try {
      const { url, searchText, intervalMinutes = 1440 } = req.body;

      if (!url || !searchText) {
        res.status(400).json({ error: 'url and searchText are required' });
        return;
      }

      // Validate URL
      try {
        new URL(url);
      } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
      }

      // Check that text is NOT already present
      const check = await checkPage(url, searchText);
      if (check.error) {
        res.status(400).json({ error: `Failed to fetch page: ${check.error}` });
        return;
      }
      if (check.found) {
        res.status(400).json({ error: 'Text is already present on the page' });
        return;
      }

      const watcher = await repository.create({
        url,
        searchText,
        intervalMinutes: parseInt(intervalMinutes),
      });

      scheduler.startWatcher(watcher);

      res.status(201).json(watcher);
    } catch (error) {
      logger.error('Failed to create watcher', { error });
      res.status(500).json({ error: 'Failed to create watcher' });
    }
  });

  // Manual check
  router.post('/watchers/:id/check', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const watcher = await repository.findById(id);
      if (!watcher) {
        res.status(404).json({ error: 'Watcher not found' });
        return;
      }

      await scheduler.performCheck(watcher);

      // Return updated watcher
      const updated = await repository.findById(id);
      res.json(updated);
    } catch (error) {
      logger.error('Failed to check watcher', { error });
      res.status(500).json({ error: 'Failed to check watcher' });
    }
  });

  // Pause watcher
  router.post('/watchers/:id/pause', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const watcher = await repository.findById(id);
      if (!watcher) {
        res.status(404).json({ error: 'Watcher not found' });
        return;
      }

      await repository.deactivate(id);
      scheduler.stopWatcher(id);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to pause watcher', { error });
      res.status(500).json({ error: 'Failed to pause watcher' });
    }
  });

  // Resume watcher
  router.post('/watchers/:id/resume', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const watcher = await repository.findById(id);
      if (!watcher) {
        res.status(404).json({ error: 'Watcher not found' });
        return;
      }

      await repository.activate(id);
      const updated = await repository.findById(id);
      if (updated) {
        scheduler.startWatcher(updated);
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to resume watcher', { error });
      res.status(500).json({ error: 'Failed to resume watcher' });
    }
  });

  // Delete watcher
  router.delete('/watchers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      scheduler.stopWatcher(id);
      await repository.delete(id);
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete watcher', { error });
      res.status(500).json({ error: 'Failed to delete watcher' });
    }
  });

  return router;
}
