import type { Watcher } from '../../storage/db-schema.ts';

export interface Notifier {
  notify(watcher: Watcher, message: string): Promise<void>;
}
