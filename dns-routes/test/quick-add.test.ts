import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createQuickAdd } from '../src/services/quick-add.ts';
import { createRulesRouter } from '../src/routes/rules.routes.ts';
import type { KeeneticClient, DnsDomainListInfo } from '../src/services/keenetic-client.ts';
import { createLogger } from '../src/logger.ts';

function fixture(initial: DnsDomainListInfo[]) {
  const lists = structuredClone(initial);
  const writes: unknown[] = [];
  const api: KeeneticClient = {
    getDnsDomainLists: async () => structuredClone(lists),
    getDnsRoutes: async () => lists.map(list => ({ index: list.id, group: list.id, interface: list.id === 'z' ? 'Proxy0' : 'Wireguard0', enabled: false, auto: true, comment: '' })),
    getInterfaces: async () => [],
    updateRule: async (id, params) => {
      writes.push({ id, ...params });
      lists.find(list => list.id === id)!.addresses = params.addresses;
      return { success: true };
    },
    createRule: async params => {
      writes.push(params);
      lists.push({ id: 'new', description: params.name, addresses: params.addresses });
      return { success: true, id: 'new' };
    },
    deleteRule: async id => {
      writes.push({ delete: id });
      lists.splice(lists.findIndex(list => list.id === id), 1);
      return { success: true };
    },
  };
  return { api, lists, writes, add: createQuickAdd(api) };
}

const defaults = [
  { id: 'd', description: '_default', addresses: ['keep.org'] },
  { id: 'z', description: 'zapret_default', addresses: ['proxy.org'] },
];

test('duplicates in any group, including target, fail without writes', async () => {
  const f = fixture([...defaults, { id: 'a', description: 'another', addresses: ['Example.COM.'] }]);
  await assert.rejects(f.add('example.com', '_default', false), { status: 409, groups: ['another'] });
  await assert.rejects(f.add('KEEP.ORG.', '_default', false), { status: 409, groups: ['_default'] });
  assert.deepEqual(f.writes, []);
});

test('adds to both targets and preserves connection and enabled status', async () => {
  const f = fixture(defaults);
  await f.add('EXAMPLE.com.', 'zapret_default', false);
  await f.add('direct.org', '_default', false);
  assert.deepEqual(f.writes[0], { id: 'z', name: 'zapret_default', addresses: ['proxy.org', 'example.com'], interface: 'Proxy0', enabled: false });
  assert.deepEqual(f.lists[0].addresses, ['keep.org', 'direct.org']);
});

test('move removes all copies, retains unrelated domains and empty source groups', async () => {
  const f = fixture([...defaults,
    { id: 'a', description: 'source', addresses: ['Example.com', 'stay.org'] },
    { id: 'b', description: 'empty-after-move', addresses: ['example.com.'] },
  ]);
  const result = await f.add('example.com', 'zapret_default', true);
  assert.deepEqual(result.movedFrom, ['source', 'empty-after-move']);
  assert.deepEqual(f.lists.find(list => list.id === 'a')!.addresses, ['stay.org']);
  assert.deepEqual(f.lists.find(list => list.id === 'b')!.addresses, []);
  assert.deepEqual(f.lists.find(list => list.id === 'z')!.addresses, ['proxy.org', 'example.com']);
});

test('move to current target is safe and deduplicates normalized copies', async () => {
  const f = fixture([{ id: 'd', description: '_default', addresses: ['Example.com', 'example.com.'] }]);
  await f.add('example.com', '_default', true);
  assert.deepEqual(f.lists[0].addresses, ['example.com']);
});

test('missing proxy group and invalid inputs cannot trigger writes', async () => {
  const f = fixture([]);
  for (const [domain, group] of [['x.org', 'zapret_default'], ['x.org', 'other'], ['', '_default'], ['https://x.org', '_default']]) {
    await assert.rejects(f.add(domain, group, false), { status: 400 });
  }
  assert.deepEqual(f.writes, []);
  await f.add('x.org', '_default', false);
  assert.equal(f.lists[0].description, '_default');
});

test('simultaneous quick-add requests cannot introduce duplicates', async () => {
  const f = fixture(defaults);
  const results = await Promise.allSettled([f.add('x.org', '_default', false), f.add('x.org', 'zapret_default', false)]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(f.writes.length, 1);
});

test('failure saving destination leaves sources untouched; failed removal reports partial move', async () => {
  const f = fixture(defaults);
  f.api.updateRule = async () => { throw new Error('unavailable'); };
  await assert.rejects(f.add('keep.org', 'zapret_default', true), /unavailable/);
  assert.deepEqual(f.lists, defaults);
  const g = fixture(defaults);
  const update = g.api.updateRule;
  g.api.updateRule = async (id, params) => {
    if (id === 'd') throw new Error('unavailable');
    return update(id, params);
  };
  await assert.rejects(g.add('keep.org', 'zapret_default', true), { status: 502 });
  assert(g.lists[1].addresses.includes('keep.org'));
  assert(g.lists[0].addresses.includes('keep.org'));
});

test('HTTP endpoint returns JSON 409, accepts explicit move, and offers HTML move form', async () => {
  const f = fixture(defaults);
  const app = express();
  app.set('views', 'src/views');
  app.set('view engine', 'pug');
  const logger = createLogger('error');
  logger.silent = true;
  app.use('/rules', createRulesRouter(f.api, logger));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/rules/quick-add`;
  try {
    const conflict = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ domain: 'keep.org' }) });
    assert.equal(conflict.status, 409);
    assert.deepEqual((await conflict.json()).groups, ['_default']);
    const html = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'domain=keep.org&group=zapret_default' });
    assert.equal(html.status, 409);
    assert.match(await html.text(), /Move to zapret_default/);
    const moved = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ domain: 'keep.org', group: 'zapret_default', move: true }) });
    assert.equal(moved.status, 200);
    assert.deepEqual((await moved.json()).movedFrom, ['_default']);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
