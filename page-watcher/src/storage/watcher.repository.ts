import { eq } from 'drizzle-orm';
import type { Database } from './db.ts';
import { watchersTable, type Watcher, type NewWatcher } from './db-schema.ts';

export function createWatcherRepository(db: Database) {
  return {
    async findAll(): Promise<Watcher[]> {
      return db.select().from(watchersTable).orderBy(watchersTable.createdAt);
    },

    async findActive(): Promise<Watcher[]> {
      return db.select().from(watchersTable).where(eq(watchersTable.isActive, true));
    },

    async findById(id: number): Promise<Watcher | undefined> {
      const results = await db.select().from(watchersTable).where(eq(watchersTable.id, id));
      return results[0];
    },

    async create(watcher: NewWatcher): Promise<Watcher> {
      const results = await db.insert(watchersTable).values(watcher).returning();
      return results[0];
    },

    async updateLastChecked(id: number): Promise<void> {
      await db
        .update(watchersTable)
        .set({ lastCheckedAt: new Date() })
        .where(eq(watchersTable.id, id));
    },

    async markFound(id: number): Promise<void> {
      await db
        .update(watchersTable)
        .set({
          isActive: false,
          foundAt: new Date(),
          lastCheckedAt: new Date(),
        })
        .where(eq(watchersTable.id, id));
    },

    async deactivate(id: number): Promise<void> {
      await db
        .update(watchersTable)
        .set({ isActive: false })
        .where(eq(watchersTable.id, id));
    },

    async activate(id: number): Promise<void> {
      await db
        .update(watchersTable)
        .set({ isActive: true, foundAt: null })
        .where(eq(watchersTable.id, id));
    },

    async delete(id: number): Promise<void> {
      await db.delete(watchersTable).where(eq(watchersTable.id, id));
    },
  };
}

export type WatcherRepository = ReturnType<typeof createWatcherRepository>;
