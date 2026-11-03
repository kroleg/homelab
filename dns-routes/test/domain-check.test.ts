import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDomain } from '../src/services/domain-check.ts';
import type { KeeneticClient, DnsLearnedGroup } from '../src/services/keenetic-client.ts';

const entry = (fqdn: string, address: string, parent?: string) => ({ fqdn, parent,
  ipv4: [{ address, ttl: 200 }], ipv6: [{ address: '2001:db8::1' }] });

test('checks parent entries, ancestor configuration, shared addresses, wrong and empty groups', async () => {
  let learned: DnsLearnedGroup[] = [{ 'group-name': 'a', enabled: false,
    entry: [entry('video.example.com', '192.0.2.1', 'example.com')] }];
  const api = {
    getDnsDomainLists: async () => [{ id: 'a', description: 'proxy', addresses: ['Example.COM.'] }],
    getDnsLearnedIps: async () => learned,
    getDnsRoutes: async () => [{ index: '1', group: 'a', interface: 'Proxy0', enabled: true, auto: true, comment: '' },
      { index: '2', group: 'b', interface: 'Unknown0', enabled: true, auto: true, comment: '' }],
    getInterfaces: async () => [{ id: 'Proxy0', name: 'Home proxy', type: 'Proxy', connected: true }],
  } as unknown as KeeneticClient;
  const result = await checkDomain(api, 'example.com');
  assert.equal(result.correctGroup, true);
  assert.equal(result.ips.length, 2);
  assert.equal(result.expectedGroups[0].learnedEnabled, false);
  assert.equal(result.expectedGroups[0].routes[0].interfaceName, 'Home proxy');
  assert.equal(result.expectedGroups[0].routes[0].groupName, 'proxy');
  assert.deepEqual(result.ips[0].groupNames, ['proxy']);
  assert.equal(result.entries[0].groupName, 'proxy');
  assert.equal((await checkDomain(api, 'video.example.com')).correctGroup, true);
  learned.push({ 'group-name': 'b', enabled: true, entry: [entry('other.org', '192.0.2.1')] });
  const conflict = await checkDomain(api, 'example.com');
  assert.equal(conflict.correctGroup, false);
  assert.deepEqual(conflict.ips[0].unexpectedGroups, ['b']);
  assert.deepEqual(conflict.ips[0].unexpectedGroupNames, ['b']);
  assert.equal(conflict.groups.find(item => item.id === 'b')?.routes[0].interfaceName, 'Unknown0');
  learned = [{ 'group-name': 'b', enabled: true, entry: [entry('example.com', '192.0.2.1')] }];
  assert.deepEqual((await checkDomain(api, 'example.com')).ips[0].missingGroups, ['a']);
  assert.equal((await checkDomain(api, 'example.com', 'unknown')).correctGroup, false);
  learned = [];
  assert.equal((await checkDomain(api, 'example.com')).hasLearnedIps, false);
  api.getDnsLearnedIps = async () => { throw new Error('offline'); };
  await assert.rejects(checkDomain(api, 'example.com'), /offline/);
});

test('HTTP query validation, normalization, no-store and upstream errors', async () => {
  const { default: express } = await import('express');
  const { createRulesRouter } = await import('../src/routes/rules.routes.ts');
  const { createLogger } = await import('../src/logger.ts');
  let fail = false;
  const api = {
    getDnsDomainLists: async () => [], getDnsRoutes: async () => [],
    getInterfaces: async () => [],
    getDnsLearnedIps: async () => { if (fail) throw new Error('offline'); return []; },
  } as unknown as KeeneticClient;
  const logger = createLogger('error');
  logger.silent = true;
  const app = express();
  app.use('/rules', createRulesRouter(api, logger));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/rules/domain-check`;
  try {
    for (const query of ['', '?domain=', '?domain=https://example.com', '?domain=a&domain=b', '?domain=a&group=', '?domain=a&group=x&group=y']) {
      assert.equal((await fetch(url + query)).status, 400);
    }
    const response = await fetch(url + '?domain=Example.COM.');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).domain, 'example.com');
    fail = true;
    assert.equal((await fetch(url + '?domain=example.com')).status, 502);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
