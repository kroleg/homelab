import type { Watcher } from '../storage/db-schema.ts';
import type { WatcherRepository } from '../storage/watcher.repository.ts';
import type { Notifier } from './notifier/notifier.interface.ts';
import { checkPage } from './checker.service.ts';
import { logger } from '../logger.ts';

type IntervalId = ReturnType<typeof setInterval>;

export function createScheduler(repository: WatcherRepository, notifier: Notifier) {
  const intervals = new Map<number, IntervalId>();

  async function performCheck(watcher: Watcher): Promise<void> {
    logger.info('Checking watcher', { id: watcher.id, url: watcher.url });

    const result = await checkPage(watcher.url, watcher.searchText);

    if (result.error) {
      logger.warn('Check failed', { id: watcher.id, error: result.error });
      await repository.updateLastChecked(watcher.id);
      return;
    }

    if (result.found) {
      logger.info('Text found!', { id: watcher.id, url: watcher.url });

      await notifier.notify(watcher, 'Text found on page!');
      await repository.markFound(watcher.id);

      // Stop checking this watcher
      stopWatcher(watcher.id);
    } else {
      await repository.updateLastChecked(watcher.id);
    }
  }

  function startWatcher(watcher: Watcher): void {
    if (intervals.has(watcher.id)) {
      logger.warn('Watcher already scheduled', { id: watcher.id });
      return;
    }

    const intervalMs = watcher.intervalMinutes * 60 * 1000;

    // Run immediately, then at interval
    performCheck(watcher);

    const intervalId = setInterval(() => {
      // Re-fetch watcher to get latest state
      repository.findById(watcher.id).then((current) => {
        if (current && current.isActive) {
          performCheck(current);
        } else {
          stopWatcher(watcher.id);
        }
      });
    }, intervalMs);

    intervals.set(watcher.id, intervalId);
    logger.info('Watcher scheduled', { id: watcher.id, intervalMinutes: watcher.intervalMinutes });
  }

  function stopWatcher(id: number): void {
    const intervalId = intervals.get(id);
    if (intervalId) {
      clearInterval(intervalId);
      intervals.delete(id);
      logger.info('Watcher stopped', { id });
    }
  }

  async function loadActiveWatchers(): Promise<void> {
    const watchers = await repository.findActive();
    logger.info('Loading active watchers', { count: watchers.length });

    for (const watcher of watchers) {
      startWatcher(watcher);
    }
  }

  function stopAll(): void {
    for (const [id] of intervals) {
      stopWatcher(id);
    }
  }

  return {
    startWatcher,
    stopWatcher,
    loadActiveWatchers,
    stopAll,
    performCheck,
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
