import { eq, sql } from 'drizzle-orm';
import type { Database } from './db.ts';
import { schedulesTable, usersTable, type Schedule } from './db-schema.ts';

export interface ScheduleWithUser extends Schedule {
  userName: string;
  userRole: string;
}

export function createScheduleRepository(db: Database) {
  return {
    async findAll(): Promise<ScheduleWithUser[]> {
      const rows = await db.select({
        schedule: schedulesTable,
        userName: usersTable.name,
        userRole: usersTable.role,
      })
        .from(schedulesTable)
        .innerJoin(usersTable, eq(schedulesTable.userId, usersTable.id));

      return rows.map(r => ({
        ...r.schedule,
        userName: r.userName,
        userRole: r.userRole,
      }));
    },

    async findByUserId(userId: number): Promise<Schedule | undefined> {
      const rows = await db.select()
        .from(schedulesTable)
        .where(eq(schedulesTable.userId, userId));
      return rows[0];
    },

    async upsert(userId: number, data: {
      fromHour: number;
      fromMinute: number;
      toHour: number;
      toMinute: number;
      enabled: boolean;
    }): Promise<Schedule> {
      const rows = await db.insert(schedulesTable)
        .values({ userId, ...data })
        .onConflictDoUpdate({
          target: schedulesTable.userId,
          set: {
            fromHour: sql`excluded.from_hour`,
            fromMinute: sql`excluded.from_minute`,
            toHour: sql`excluded.to_hour`,
            toMinute: sql`excluded.to_minute`,
            enabled: sql`excluded.enabled`,
          },
        })
        .returning();
      return rows[0];
    },

    async setOverride(userId: number, until: Date | null): Promise<void> {
      await db.update(schedulesTable)
        .set({ overrideUntil: until })
        .where(eq(schedulesTable.userId, userId));
    },

    async delete(userId: number): Promise<void> {
      await db.delete(schedulesTable)
        .where(eq(schedulesTable.userId, userId));
    },
  };
}

export type ScheduleRepository = ReturnType<typeof createScheduleRepository>;
