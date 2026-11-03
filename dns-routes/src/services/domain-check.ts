import { isIP } from 'node:net';
import type { KeeneticClient } from './keenetic-client.ts';

export const normalizeDomain = (value: string) => value.trim().toLowerCase().replace(/\.$/, '');

export async function checkDomain(api: KeeneticClient, domain: string, group?: string) {
  const [lists, learned, routes] = await Promise.all([
    api.getDnsDomainLists(), api.getDnsLearnedIps(), api.getDnsRoutes(),
  ]);
  const matches = (value: string) => {
    const normalized = normalizeDomain(value);
    return domain === normalized || domain.endsWith(`.${normalized}`);
  };
  const expected = lists.filter(list => group !== undefined
    ? list.id === group : list.addresses.some(matches));
  const entries = learned.flatMap(item => (item.entry ?? []).map(entry => ({ group: item, entry })));
  const relevant = entries.filter(({ entry }) => normalizeDomain(entry.fqdn) === domain
    || (entry.parent !== undefined && normalizeDomain(entry.parent) === domain));
  const addresses = [...new Set(relevant.flatMap(({ entry }) =>
    [...(entry.ipv4 ?? []), ...(entry.ipv6 ?? [])].map(ip => ip.address)))];
  const expectedIds = new Set(expected.map(list => list.id));
  const ips = addresses.map(address => {
    const groups = learned.filter(item => (item.entry ?? []).some(entry =>
      [...(entry.ipv4 ?? []), ...(entry.ipv6 ?? [])].some(ip => ip.address === address)))
      .map(item => item['group-name']);
    return { address, family: isIP(address), groups,
      missingGroups: [...expectedIds].filter(id => !groups.includes(id)),
      unexpectedGroups: groups.filter(id => !expectedIds.has(id)) };
  });
  return {
    domain,
    expectedGroups: expected.map(list => ({ id: list.id, name: list.description,
      learnedEnabled: learned.find(item => item['group-name'] === list.id)?.enabled ?? null,
      routes: routes.filter(route => route.group === list.id) })),
    hasLearnedIps: ips.length > 0,
    correctGroup: expected.length > 0 && ips.length > 0
      && ips.every(ip => ip.missingGroups.length === 0 && ip.unexpectedGroups.length === 0),
    ips,
    entries: relevant.map(({ group: item, entry }) => ({ group: item['group-name'], ...entry })),
  };
}
