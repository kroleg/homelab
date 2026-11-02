import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRoutes } from '../src/routes/api.ts';
import { createLogger } from '../src/logger.ts';
import type { KeeneticService } from '../src/services/keenetic.service.ts';

test('updating a DNS rule accepts an empty list and retains its route; creation still requires domains', async () => {
  const writes: unknown[] = [];
  const api = {
    setDnsDomainList: async (...args: unknown[]) => { writes.push(args); return true; },
    resolveInterfaceId: async (id: string) => id,
    getDnsRoutes: async () => [{ index: '7', group: 'source' }],
    updateDnsRoute: async (...args: unknown[]) => { writes.push(args); return true; },
  } as unknown as KeeneticService;
  const app = express();
  app.use(express.json());
  app.use('/api', createApiRoutes(createLogger('error'), api));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/dns-rules`;
  const body = { name: 'source', addresses: [], interface: 'Proxy0', enabled: false };
  try {
    const updated = await fetch(`${url}/source`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(updated.status, 200);
    assert.deepEqual(writes, [['source', 'source', []], ['7', 'source', 'Proxy0', true, false]]);
    const created = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(created.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
