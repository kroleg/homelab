import { pgTable, serial, text, boolean, timestamp, integer, bigint, date, unique } from 'drizzle-orm/pg-core';

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

export const UserRole = {
  parent: 'parent',
  child: 'child',
  group: 'group',
  guest: 'guest',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserRoleLabel: Record<UserRole, string> = {
  parent: 'Родитель',
  child: 'Ребенок',
  group: 'Группа',
  guest: 'Гость',
};

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  isAdmin: boolean('is_admin').notNull().default(false),
  role: text('role').notNull().default('parent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const devicesTable = pgTable('devices', {
  id: serial('id').primaryKey(),
  mac: text('mac').notNull().unique(),
  customName: text('custom_name'),
  userId: integer('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
  deviceType: text('device_type').notNull().default('other'),
  tailscaleIp: text('tailscale_ip').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hourlyTrafficTable = pgTable('hourly_traffic', {
  id: serial('id').primaryKey(),
  date: date('date', { mode: 'string' }).notNull(),
  hour: integer('hour').notNull(),
  mac: text('mac').notNull(),
  rx: bigint('rx', { mode: 'number' }).notNull().default(0),
  tx: bigint('tx', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.date, table.hour, table.mac),
]);

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Device = typeof devicesTable.$inferSelect;
export type NewDevice = typeof devicesTable.$inferInsert;
export type HourlyTraffic = typeof hourlyTrafficTable.$inferSelect;
