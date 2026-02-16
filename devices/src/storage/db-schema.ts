import { pgTable, serial, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const DeviceType = {
  phone: 'phone',
  tablet: 'tablet',
  laptop: 'laptop',
  desktop: 'desktop',
  watch: 'watch',
  tv: 'tv',
  other: 'other',
} as const;
export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const devicesTable = pgTable('devices', {
  id: serial('id').primaryKey(),
  mac: text('mac').notNull().unique(),
  customName: text('custom_name'),
  userId: integer('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  deviceType: text('device_type').notNull().default('other'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Device = typeof devicesTable.$inferSelect;
export type NewDevice = typeof devicesTable.$inferInsert;
