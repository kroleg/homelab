import { and, sql, gte, inArray } from 'drizzle-orm';
import type { Database } from './db.ts';
import { hourlyTrafficTable } from './db-schema.ts';

export function createTrafficRepository(db: Database) {
  return {
    async upsertHourly(rows: Array<{ date: string; hour: number; mac: string; rx: number; tx: number }>): Promise<void> {
      if (rows.length === 0) return;

      await db.insert(hourlyTrafficTable)
        .values(rows.map(r => ({
          date: r.date,
          hour: r.hour,
          mac: r.mac,
          rx: r.rx,
          tx: r.tx,
          updatedAt: new Date(),
        })))
        .onConflictDoUpdate({
          target: [hourlyTrafficTable.date, hourlyTrafficTable.hour, hourlyTrafficTable.mac],
          set: {
            rx: sql`excluded.rx`,
            tx: sql`excluded.tx`,
            updatedAt: new Date(),
          },
        });
    },

    async getDailyTotals(macs: string[], days: number): Promise<Array<{ date: string; mac: string; rx: number; tx: number }>> {
      if (macs.length === 0) return [];

      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().slice(0, 10);

      const rows = await db.select({
        date: hourlyTrafficTable.date,
        mac: hourlyTrafficTable.mac,
        rx: sql<number>`sum(${hourlyTrafficTable.rx})`,
        tx: sql<number>`sum(${hourlyTrafficTable.tx})`,
      })
        .from(hourlyTrafficTable)
        .where(and(
          gte(hourlyTrafficTable.date, sinceStr),
          inArray(hourlyTrafficTable.mac, macs),
        ))
        .groupBy(hourlyTrafficTable.date, hourlyTrafficTable.mac);

      return rows.map(r => ({
        date: r.date,
        mac: r.mac,
        rx: Number(r.rx),
        tx: Number(r.tx),
      }));
    },
  };
}

export type TrafficRepository = ReturnType<typeof createTrafficRepository>;
