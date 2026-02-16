import { eq, isNull } from 'drizzle-orm';
import type { Database } from './db.ts';
import { devicesTable, usersTable, type Device, type NewDevice, type DeviceType } from './db-schema.ts';

export function createDeviceRepository(db: Database) {
  return {
    async findAll(): Promise<Device[]> {
      return db.select().from(devicesTable).orderBy(devicesTable.createdAt);
    },

    async findById(id: number): Promise<Device | undefined> {
      const results = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
      return results[0];
    },

    async findByMac(mac: string): Promise<Device | undefined> {
      const results = await db
        .select()
        .from(devicesTable)
        .where(eq(devicesTable.mac, mac.toUpperCase()));
      return results[0];
    },

    async findByUserId(userId: number): Promise<Device[]> {
      return db.select().from(devicesTable).where(eq(devicesTable.userId, userId));
    },

    async findUnassigned(): Promise<Device[]> {
      return db.select().from(devicesTable).where(isNull(devicesTable.userId));
    },

    async findAllWithUsers(): Promise<(Device & { user: { id: number; name: string; slug: string; isAdmin: boolean } | null })[]> {
      const results = await db
        .select({
          id: devicesTable.id,
          mac: devicesTable.mac,
          customName: devicesTable.customName,
          userId: devicesTable.userId,
          deviceType: devicesTable.deviceType,
          createdAt: devicesTable.createdAt,
          user: {
            id: usersTable.id,
            name: usersTable.name,
            slug: usersTable.slug,
            isAdmin: usersTable.isAdmin,
          },
        })
        .from(devicesTable)
        .leftJoin(usersTable, eq(devicesTable.userId, usersTable.id));
      return results;
    },

    async create(device: NewDevice): Promise<Device> {
      const results = await db
        .insert(devicesTable)
        .values({ ...device, mac: device.mac.toUpperCase() })
        .returning();
      return results[0];
    },

    async updateOwner(id: number, userId: number | null): Promise<Device | undefined> {
      const results = await db
        .update(devicesTable)
        .set({ userId })
        .where(eq(devicesTable.id, id))
        .returning();
      return results[0];
    },

    async updateType(id: number, deviceType: DeviceType): Promise<Device | undefined> {
      const results = await db
        .update(devicesTable)
        .set({ deviceType })
        .where(eq(devicesTable.id, id))
        .returning();
      return results[0];
    },

    async updateCustomName(id: number, customName: string | null): Promise<Device | undefined> {
      const results = await db
        .update(devicesTable)
        .set({ customName })
        .where(eq(devicesTable.id, id))
        .returning();
      return results[0];
    },

    async update(
      id: number,
      data: { customName?: string | null; deviceType?: DeviceType; userId?: number | null }
    ): Promise<Device | undefined> {
      const results = await db
        .update(devicesTable)
        .set(data)
        .where(eq(devicesTable.id, id))
        .returning();
      return results[0];
    },

    async delete(id: number): Promise<void> {
      await db.delete(devicesTable).where(eq(devicesTable.id, id));
    },
  };
}

export type DeviceRepository = ReturnType<typeof createDeviceRepository>;
