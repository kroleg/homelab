import type { KeeneticClient, DnsDomainListInfo, DnsRouteInfo } from './keenetic-client.ts';

export class QuickAddError extends Error {
  status: number;
  groups: string[];
  constructor(message: string, status: number, groups: string[] = []) {
    super(message);
    this.status = status;
    this.groups = groups;
  }
}

function normalize(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

export function createQuickAdd(api: KeeneticClient) {
  let pending: Promise<unknown> = Promise.resolve();

  async function add(domainInput: string, group: string, move: boolean) {
    const domain = normalize(domainInput);
    if (!domain || /[\s/:]/.test(domain)) throw new QuickAddError('Enter a domain without a URL scheme, path or spaces.', 400);
    if (!['_default', 'zapret_default'].includes(group)) throw new QuickAddError('Unknown target group.', 400);

    const [lists, routes] = await Promise.all([api.getDnsDomainLists(), api.getDnsRoutes()]);
    const target = lists.find(list => list.description === group);
    const existing = lists.filter(list => list.addresses.some(address => normalize(address) === domain));
    if (existing.length && !move) {
      const groups = existing.map(list => list.description);
      throw new QuickAddError(`Domain ${domain} already exists in: ${groups.join(', ')}`, 409, groups);
    }
    if (!target && group === 'zapret_default') throw new QuickAddError('Create zapret_default with its connection before adding domains.', 400);

    async function update(list: DnsDomainListInfo, addresses: string[], route?: DnsRouteInfo) {
      await api.updateRule(list.id, {
        name: list.description, addresses,
        interface: route?.interface ?? 'default', enabled: route?.enabled ?? true,
      });
    }

    // Save the destination first so a failed removal cannot lose the domain.
    const targetAddresses = target?.addresses.filter(address => normalize(address) !== domain) ?? [];
    if (target) {
      await update(target, [...targetAddresses, domain], routes.find(route => route.group === target.id));
    } else {
      await api.createRule({ name: group, addresses: [domain], interface: 'default', enabled: true });
    }
    const movedFrom: string[] = [];
    for (const list of existing.filter(list => list.id !== target?.id)) {
      try {
        const addresses = list.addresses.filter(address => normalize(address) !== domain);
        await update(list, addresses, routes.find(route => route.group === list.id));
        movedFrom.push(list.description);
      } catch (error) {
        throw new QuickAddError(`Domain saved in ${group}, but removal from ${list.description} failed. Retry with move=true. ${(error as Error).message}`, 502);
      }
    }
    return { success: true, domain, group, movedFrom };
  }

  return (domain: string, group: string, move: boolean) => {
    const result = pending.then(() => add(domain, group, move));
    pending = result.catch(() => undefined);
    return result;
  };
}
