import { Router } from 'express';
import type { WatcherRepository } from '../storage/watcher.repository.ts';
import type { Scheduler } from '../services/scheduler.service.ts';
import { checkPage } from '../services/checker.service.ts';
import { logger } from '../logger.ts';

export function createUiRouter(repository: WatcherRepository, scheduler: Scheduler): Router {
  const router = Router();

  // List watchers
  router.get('/', async (_req, res) => {
    const watchers = await repository.findAll();
    res.render('list', { watchers });
  });

  // Create form
  router.get('/create', (_req, res) => {
    res.render('create', {});
  });

  // Create watcher
  router.post('/create', async (req, res) => {
    const { url, searchText, intervalMinutes = '1440' } = req.body;

    // Validate URL
    try {
      new URL(url);
    } catch {
      res.render('create', { error: 'Invalid URL', url, searchText, intervalMinutes });
      return;
    }

    // Check that text is NOT already present
    const check = await checkPage(url, searchText);
    if (check.error) {
      res.render('create', { error: `Failed to fetch page: ${check.error}`, url, searchText, intervalMinutes });
      return;
    }
    if (check.found) {
      res.render('create', { error: 'Text is already present on the page', url, searchText, intervalMinutes });
      return;
    }

    try {
      const watcher = await repository.create({
        url,
        searchText,
        intervalMinutes: parseInt(intervalMinutes),
      });

      scheduler.startWatcher(watcher);

      res.redirect('/');
    } catch (error) {
      logger.error('Failed to create watcher', { error });
      res.render('create', { error: 'Failed to create watcher', url, searchText, intervalMinutes });
    }
  });

  // Manual check
  router.post('/watchers/:id/check', async (req, res) => {
    const id = parseInt(req.params.id);
    const watcher = await repository.findById(id);
    if (watcher) {
      await scheduler.performCheck(watcher);
    }
    res.redirect('/');
  });

  // Pause watcher
  router.post('/watchers/:id/pause', async (req, res) => {
    const id = parseInt(req.params.id);
    await repository.deactivate(id);
    scheduler.stopWatcher(id);
    res.redirect('/');
  });

  // Resume watcher
  router.post('/watchers/:id/resume', async (req, res) => {
    const id = parseInt(req.params.id);
    await repository.activate(id);
    const watcher = await repository.findById(id);
    if (watcher) {
      scheduler.startWatcher(watcher);
    }
    res.redirect('/');
  });

  // Delete watcher
  router.post('/watchers/:id/delete', async (req, res) => {
    const id = parseInt(req.params.id);
    scheduler.stopWatcher(id);
    await repository.delete(id);
    res.redirect('/');
  });

  return router;
}
