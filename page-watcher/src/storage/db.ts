import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './db-schema.ts';
import { logger } from '../logger.ts';

const { Pool } = pg;

let pool: pg.Pool;

export function initDatabase(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}) {
  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof initDatabase>;

export async function runMigrations(db: Database) {
  await migrate(db, { migrationsFolder: './migrations' });
  logger.info('Migrations run successfully');
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
}
