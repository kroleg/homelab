import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp, probes } from '../src/app.ts';
import { createRegistrationLookup, type Lookup } from '../src/services/registration.ts';

async function fixture(lookup: Lookup, trustedProxies = ['loopback']) {
  const app = createApp({ lookup, trustedProxies, portalUrl: 'http://portal.internal/', log: () => {} });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    request: (path: string, host: string, forwarded = '192.168.1.45') => new Promise<Response>((resolve, reject) => {
      const outgoing = request(url + path, { headers: { Host: host, 'X-Forwarded-For': forwarded } }, incoming => {
        const chunks: Buffer[] = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          resolve(new Response(incoming.statusCode === 204 ? null : Buffer.concat(chunks), { status: incoming.statusCode, headers }));
        });
      });
      outgoing.on('error', reject);
      outgoing.end();
    }),
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

test('registered clients get exact success responses for every probe, regardless of private MAC', async () => {
  const f = await fixture(async ip => ({ ip, mac: '02:11:22:33:44:55', name: 'Phone', registered: true }));
  try {
    for (const probe of probes) {
      const response = await f.request(probe.path, probe.host);
      assert.equal(response.status, probe.status);
      assert.equal(await response.text(), probe.body);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  } finally { await f.close(); }
});

test('unregistered and unknown clients see instructions directly on probe URLs and root', async () => {
  for (const registered of [false, null]) {
    const f = await fixture(async ip => registered === null ? null : ({ ip, mac: 'aa:bb:cc:dd:ee:ff', name: '<script>', registered }));
    try {
      for (const probe of probes) {
        for (const path of [probe.path, '/']) {
          const response = await f.request(path, probe.host);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('location'), null);
          assert.match(await response.text(), /Отключите приватный MAC-адрес/);
        }
      }
      const page = await f.request('/', 'portal.internal');
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /MAC-адрес/);
      assert.doesNotMatch(html, /<script>/);
      const status = await f.request('/api/status', 'portal.internal');
      assert.equal((await status.json()).registered, false);
    } finally { await f.close(); }
  }
});

test('router outage does not produce a successful probe or pretend the client is unregistered', async () => {
  const f = await fixture(async () => { throw new Error('Router unavailable'); });
  try {
    const response = await f.request('/generate_204', 'connectivitycheck.gstatic.com');
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Не удалось проверить/);
    const status = await f.request('/api/status', 'portal.internal');
    assert.equal(status.status, 503);
    assert.equal((await status.json()).error, 'Проверка регистрации временно недоступна');
  } finally { await f.close(); }
});

test('untrusted direct callers cannot forge their source address with forwarding headers', async () => {
  let observed = '';
  const f = await fixture(async ip => { observed = ip; return null; }, ['192.0.2.1']);
  try {
    await f.request('/', 'portal.internal', '192.168.1.99');
    assert.equal(observed, '127.0.0.1');
  } finally { await f.close(); }
});

test('trusted Traefik uses nearest untrusted address, ignoring client-prepended spoofed addresses', async () => {
  let observed = '';
  const f = await fixture(async ip => { observed = ip; return null; });
  try {
    await f.request('/', 'portal.internal', '192.168.1.99, 192.168.1.45');
    assert.equal(observed, '192.168.1.45');
  } finally { await f.close(); }
});

test('unknown paths do not trigger router lookups or become an open redirect', async () => {
  const f = await fixture(async () => { throw new Error('Must not be called'); });
  try {
    assert.equal((await f.request('/anything', 'connectivitycheck.gstatic.com')).status, 404);
    const missing = await f.request('/anything', 'portal.internal');
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'Страница не найдена');
  } finally { await f.close(); }
});

test('registration cache refreshes after registration and never caches upstream failures', async () => {
  let calls = 0;
  let time = 0;
  const lookup = createRegistrationLookup('http://keenetic-api:3000/api/', async () => {
    calls++;
    return Response.json({ ip: '192.168.1.45', mac: 'aa:bb:cc:dd:ee:ff', name: '', registered: calls > 1 });
  }, () => time);
  assert.equal((await lookup('192.168.1.45'))?.registered, false);
  assert.equal((await lookup('192.168.1.45'))?.registered, false);
  assert.equal(calls, 1);
  time = 2001;
  assert.equal((await lookup('192.168.1.45'))?.registered, true);
  let failures = 0;
  const failing = createRegistrationLookup('http://keenetic-api:3000/api/', async () => { failures++; return new Response('', { status: 502 }); });
  await assert.rejects(failing('192.168.1.45'));
  await assert.rejects(failing('192.168.1.45'));
  assert.equal(failures, 2);
});
