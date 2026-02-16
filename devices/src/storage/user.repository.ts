import { eq, desc } from 'drizzle-orm';
import type { Database } from './db.ts';
import { usersTable, type User, type NewUser } from './db-schema.ts';

export function createUserRepository(db: Database) {
  return {
    async findAll(): Promise<User[]> {
      return db.select().from(usersTable).orderBy(desc(usersTable.isAdmin), usersTable.name);
    },

    async findById(id: number): Promise<User | undefined> {
      const results = await db.select().from(usersTable).where(eq(usersTable.id, id));
      return results[0];
    },

    async findBySlug(slug: string): Promise<User | undefined> {
      const results = await db.select().from(usersTable).where(eq(usersTable.slug, slug));
      return results[0];
    },

    async create(user: NewUser): Promise<User> {
      const results = await db.insert(usersTable).values(user).returning();
      return results[0];
    },

    async update(id: number, data: Partial<Omit<NewUser, 'id'>>): Promise<User | undefined> {
      const results = await db.update(usersTable).set(data).where(eq(usersTable.id, id)).returning();
      return results[0];
    },

    async delete(id: number): Promise<void> {
      await db.delete(usersTable).where(eq(usersTable.id, id));
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
