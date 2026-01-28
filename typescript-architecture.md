# TypeScript Service Architecture Guidelines

Instructions for Claude to replicate the homelab TypeScript architecture in new projects.

## Quick Start Template

**npm:**
```bash
mkdir my-service && cd my-service
npm init -y
npm pkg set type=module
npm i express@5 winston
npm i -D typescript @types/express @types/node
```

**pnpm:**
```bash
mkdir my-service && cd my-service
pnpm init
npm pkg set type=module
pnpm add express@5 winston
pnpm add -D typescript @types/express @types/node
```

## Project Structure

```
my-service/
├── src/
│   ├── server.ts          # Entry point
│   ├── config.ts          # Environment loading
│   ├── logger.ts          # Winston setup
│   ├── routes/            # Express routers
│   │   └── api.ts
│   ├── services/          # Business logic
│   │   └── *.service.ts
│   └── storage/           # Database layer (if needed)
│       ├── db.ts
│       ├── db-schema.ts
│       └── *.repository.ts
├── migrations/            # Drizzle migrations (if DB)
├── views/                 # Pug templates (if UI)
├── package.json
├── tsconfig.json
├── drizzle.config.ts      # If using database
└── Dockerfile
```

## Core Files

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "noUncheckedSideEffectImports": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Key options:**
- `noEmit: true` - TypeScript only checks types, no compilation
- `allowImportingTsExtensions: true` - allows importing `.ts` files directly
- `erasableSyntaxOnly: true` - ensures only syntax that Node can strip is used

### TypeScript Syntax Restrictions

With `erasableSyntaxOnly`, certain TypeScript-specific syntax is not allowed because Node only strips types (doesn't transform code).

**Not Supported:**

Enums - use const objects instead:
```typescript
// Don't use
enum Status { Active, Inactive }

// Use instead
const Status = {
  Active: 'active',
  Inactive: 'inactive'
} as const;
type Status = typeof Status[keyof typeof Status];
```

Parameter Properties - expand manually:
```typescript
// Don't use
class Service {
  constructor(private config: Config) {}
}

// Use instead
class Service {
  private config: Config;
  constructor(config: Config) {
    this.config = config;
  }
}
```

Namespaces - use ES modules instead.

**Supported:** Type annotations, interfaces, type aliases, generics, type assertions (`as`), access modifiers (on properties, not constructor params), abstract classes.

**Alternative:** If you need full TypeScript syntax (enums, parameter properties), use transform mode:
```bash
node --experimental-transform-types src/main.ts
```

### package.json scripts

```json
{
  "type": "module",
  "scripts": {
    "start": "node --env-file-if-exists=.env --watch src/server.ts",
    "start:prod": "node src/server.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

Add for database services:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

Add for testing:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### src/config.ts

```typescript
export function loadConfig() {
  const port = parseInt(process.env.PORT || '3000');
  const logLevel = process.env.LOG_LEVEL || 'info';

  // Validate required vars
  if (!process.env.REQUIRED_VAR) {
    throw new Error('REQUIRED_VAR environment variable is required');
  }

  return {
    port,
    logLevel,
    requiredVar: process.env.REQUIRED_VAR,
  };
}

export type Config = ReturnType<typeof loadConfig>;
```

### src/logger.ts

```typescript
import winston from 'winston';

export function createLogger(level: string) {
  return winston.createLogger({
    level,
    format: winston.format.json(),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  });
}

export type Logger = ReturnType<typeof createLogger>;
```

### src/server.ts (Entry Point)

```typescript
import express from 'express';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createApiRoutes } from './routes/api.ts';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const app = express();
app.use(express.json());

// Health check (required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount routes
app.use('/api', createApiRoutes(logger));

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

// Graceful shutdown (required)
function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### src/routes/api.ts (Factory Pattern)

```typescript
import { Router } from 'express';
import type { Logger } from '../logger.ts';

export function createApiRoutes(logger: Logger): Router {
  const router = Router();

  router.get('/example', async (req, res) => {
    logger.info('Example endpoint called');
    res.json({ message: 'Hello' });
  });

  return router;
}
```

## Database Layer (Drizzle + PostgreSQL)

### Dependencies

```bash
npm i drizzle-orm pg
npm i -D drizzle-kit @types/pg
```

### drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/storage/db-schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'mydb',
    user: process.env.POSTGRES_USER || 'user',
    password: process.env.POSTGRES_PASSWORD || 'pass',
  },
});
```

### src/storage/db-schema.ts

```typescript
import { pgTable, serial, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const itemsTable = pgTable('items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Item = typeof itemsTable.$inferSelect;
export type NewItem = typeof itemsTable.$inferInsert;
```

### src/storage/db.ts

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './db-schema.ts';

const { Pool } = pg;

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  return {
    db,
    async runMigrations() {
      await migrate(db, { migrationsFolder: './migrations' });
    },
    async close() {
      await pool.end();
    },
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];
```

### src/storage/item.repository.ts

```typescript
import { eq } from 'drizzle-orm';
import type { Database } from './db.ts';
import { itemsTable, type Item, type NewItem } from './db-schema.ts';

export function createItemRepository(db: Database) {
  return {
    async findAll(): Promise<Item[]> {
      return db.select().from(itemsTable).orderBy(itemsTable.createdAt);
    },

    async findById(id: number): Promise<Item | undefined> {
      const results = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
      return results[0];
    },

    async create(item: NewItem): Promise<Item> {
      const results = await db.insert(itemsTable).values(item).returning();
      return results[0];
    },

    async delete(id: number): Promise<void> {
      await db.delete(itemsTable).where(eq(itemsTable.id, id));
    },
  };
}

export type ItemRepository = ReturnType<typeof createItemRepository>;
```

## UI Layer (Pug Templates)

### Dependencies

```bash
npm i pug
```

### Server setup

```typescript
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  res.render('index', { title: 'My Service', items: [] });
});
```

### src/views/index.pug

```pug
doctype html
html(lang="en")
  head
    meta(charset="UTF-8")
    meta(name="viewport" content="width=device-width, initial-scale=1.0")
    title= title
    style.
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, sans-serif; padding: 2rem; background: #1a1a2e; color: #eee; }
      .container { max-width: 800px; margin: 0 auto; }
      h1 { margin-bottom: 1rem; }
  body
    .container
      h1= title
      block content
```

## Dockerfile

**npm:**
```dockerfile
FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src

RUN npm run typecheck
RUN npm prune --omit=dev

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.ts"]
```

**pnpm:**
```dockerfile
FROM node:24-alpine
WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src

RUN pnpm typecheck
RUN pnpm prune --prod

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "src/server.ts"]
```

With migrations, add before CMD:
```dockerfile
COPY migrations ./migrations
```

## Prometheus Metrics (Optional)

### Dependencies

```bash
npm i prom-client
```

### src/metrics.ts

```typescript
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });

  return { registry, httpRequests };
}
```

### Add /metrics endpoint

```typescript
import { createMetrics } from './metrics.ts';

const { registry, httpRequests } = createMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});
```

## Key Conventions

### Always include:
- `/health` endpoint returning `{ status: 'ok' }`
- Graceful shutdown on SIGTERM/SIGINT
- Error handling middleware
- Config validation in loadConfig()

### Module system:
- Use ES modules (`"type": "module"`)
- Import with `.ts` extension
- No build step - Node 24 runs TypeScript natively

### Dependency injection:
- Use factory functions that accept dependencies
- Return typed objects from factories
- Wire dependencies in server.ts

### Error responses:
```typescript
res.status(400).json({ error: 'Validation failed' });
res.status(404).json({ error: 'Not found' });
res.status(500).json({ error: 'Internal server error' });
```

### Environment variables:
```env
PORT=3000
LOG_LEVEL=info
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mydb
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
```

## Testing

### Dependencies

```bash
npm i -D vitest
```

### src/example.test.ts

```typescript
import { describe, it, expect } from 'vitest';

describe('example', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

## Checklist for New Services

- [ ] Create folder structure with src/
- [ ] Set up package.json with type: module
- [ ] Create tsconfig.json with noEmit: true
- [ ] Implement config.ts with validation
- [ ] Implement logger.ts with Winston
- [ ] Create server.ts with Express
- [ ] Add /health endpoint
- [ ] Add graceful shutdown handlers
- [ ] Add error handling middleware
- [ ] Create Dockerfile with health check
- [ ] Add tests with vitest
