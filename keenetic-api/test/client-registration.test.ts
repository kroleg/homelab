import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRoutes } from '../src/routes/api.ts';
import { createLogger } from '../src/logger.ts';
import { createKeeneticService, type KeeneticService } from '../src/services/keenetic.service.ts';

test('registration lookup includes unregistered hosts and distinguishes absence from router failure', async t => {
  let body: unknown = [{ ip: '192.168.1.45', mac: 'aa:bb:cc:dd:ee:ff', hostname: 'Phone', registered: false }];
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(init.method, 'GET');
    return Response.json(url.endsWith('/auth') ? {} : body, { status: url.endsWith('/auth') ? 200 : status });
  });
  const service = createKeeneticService({ host: 'http://router', login: 'test', password: 'test', logger: createLogger('error') });
  assert.deepEqual(await service.getClientRegistration('192.168.1.45'), {
    ip: '192.168.1.45', mac: 'aa:bb:cc:dd:ee:ff', name: 'Phone', registered: false,
  });
  assert.equal(await service.getClientRegistration('192.168.1.46'), null);
  body = [{ ip: '192.168.1.45', mac: 'aa:bb:cc:dd:ee:ff' }];
  await assert.rejects(service.getClientRegistration('192.168.1.45'), /Invalid host registration fields/);
  status = 503;
  await assert.rejects(service.getClientRegistration('192.168.1.45'), /HTTP 503/);
});

test('registration endpoint validates IP, returns 404 for absent hosts and 502 for unavailable router', async () => {
  let fail = false;
  const api = { getClientRegistration: async (ip: string) => {
    if (fail) throw new Error('offline');
    return ip === '192.168.1.45' ? { ip, mac: 'aa:bb:cc:dd:ee:ff', name: '', registered: false } : null;
  } } as unknown as KeeneticService;
  const app = express();
  app.use('/api', createApiRoutes(createLogger('error'), api));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/client-registration`;
  try {
    for (const query of ['', '?ip=bad', '?ip=192.168.1.45&ip=192.168.1.46']) {
      assert.equal((await fetch(url + query)).status, 400);
    }
    const response = await fetch(url + '?ip=192.168.1.45');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).registered, false);
    assert.equal((await fetch(url + '?ip=192.168.1.46')).status, 404);
    fail = true;
    assert.equal((await fetch(url + '?ip=192.168.1.45')).status, 502);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
