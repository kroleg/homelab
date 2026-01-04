import { pgTable, serial, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const watchersTable = pgTable('watchers', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  searchText: text('search_text').notNull(),
  intervalMinutes: integer('interval_minutes').notNull().default(1440), // daily
  isActive: boolean('is_active').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  foundAt: timestamp('found_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Watcher = typeof watchersTable.$inferSelect;
export type NewWatcher = typeof watchersTable.$inferInsert;
