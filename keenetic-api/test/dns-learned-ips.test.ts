import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createApiRoutes } from '../src/routes/api.ts';
import { createLogger } from '../src/logger.ts';
import { createKeeneticService, type KeeneticService } from '../src/services/keenetic.service.ts';

const groups = [{
  'group-name': 'domain-list2', enabled: true,
  entry: [{ fqdn: 'video.example', type: 'runtime', parent: 'example',
    ipv4: [{ address: '192.0.2.10', ttl: 300, 'last-updated': 5 }],
    ipv6: [{ address: '2001:db8::10', ttl: 200, 'last-updated': 9 }],
    'fail-counter4': 0 }],
  'excluded-fqdns': [{ address: 'skip.example' }],
}, { 'group-name': 'domain-list3', enabled: false, entry: [] }];

test('reads the authenticated runtime snapshot with GET only and preserves diagnostics', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(init.method, 'GET');
    calls.push(url);
    return new Response(JSON.stringify(url.endsWith('/auth') ? {} : { group: groups }));
  });
  const service = createKeeneticService({ host: 'http://router', login: 'test', password: 'test', logger: createLogger('error') });
  assert.deepEqual(await service.getDnsLearnedIps(), groups);
  assert.deepEqual(calls, ['http://router/auth', 'http://router/rci/show/object-group/fqdn']);
});

test('distinguishes empty snapshots from router errors or malformed data', async t => {
  let body: unknown = { group: [] };
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (url: string) =>
    new Response(JSON.stringify(url.endsWith('/auth') ? {} : body), { status: url.endsWith('/auth') ? 200 : status }));
  const service = createKeeneticService({ host: 'http://router', login: 'test', password: 'test', logger: createLogger('error') });
  assert.deepEqual(await service.getDnsLearnedIps(), []);
  for (const invalid of [null, {}, { group: {} }, { group: [null] }, { group: [{ enabled: true }] }]) {
    body = invalid;
    await assert.rejects(service.getDnsLearnedIps(), /Invalid learned DNS IP response/);
  }
  body = { group: groups };
  status = 503;
  await assert.rejects(service.getDnsLearnedIps(), /HTTP 503/);
});

test('endpoint lists/filters groups, validates query shape and reports upstream failure', async () => {
  let calls = 0;
  let fail = false;
  const service = { getDnsLearnedIps: async () => {
    calls++;
    if (fail) throw new Error('router offline');
    return groups;
  } } as unknown as KeeneticService;
  const app = express();
  app.use('/api', createApiRoutes(createLogger('error'), service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/dns-learned-ips`;
  try {
    const all = await fetch(url);
    assert.equal(all.status, 200);
    assert.equal(all.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await all.json(), groups);
    assert.deepEqual(await (await fetch(url + '?group=domain-list2')).json(), [groups[0]]);
    assert.deepEqual(await (await fetch(url + '?group=missing')).json(), []);
    const previousCalls = calls;
    for (const query of ['?group=', '?group=%20', '?group=a&group=b']) {
      assert.equal((await fetch(url + query)).status, 400);
    }
    assert.equal(calls, previousCalls);
    fail = true;
    const failed = await fetch(url);
    assert.equal(failed.status, 502);
    assert.deepEqual(await failed.json(), { error: 'Failed to fetch learned DNS IPs from router' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
