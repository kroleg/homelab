import express from 'express';
import type { Logger } from '../logger.ts';
import type { KeeneticClient } from '../services/keenetic-client.ts';

export function createRulesRouter(api: KeeneticClient, logger: Logger, defaultVpnInterface?: string): express.Router {
  const router = express.Router();
  router.use(express.urlencoded({ extended: true }));

  router.get('/', async (_req, res) => {
    const [lists, routes, interfaces] = await Promise.all([
      api.getDnsDomainLists(),
      api.getDnsRoutes(),
      api.getInterfaces(),
    ]);

    const interfaceNameById = new Map(interfaces.map(i => [i.id, i.name]));
    const routeByGroup = new Map(routes.map(r => [r.group, r]));

    const rules = lists.map(list => {
      const route = routeByGroup.get(list.id);
      return {
        id: list.id,
        name: list.description,
        addresses: list.addresses,
        interfaceName: route ? (interfaceNameById.get(route.interface) ?? route.interface) : null,
        enabled: route ? route.enabled : null,
      };
    });

    rules.sort((a, b) => a.name.localeCompare(b.name));

    const NO_INTERFACE = 'No interface';
    const groups = new Map<string, typeof rules>();
    for (const rule of rules) {
      const key = rule.interfaceName ?? NO_INTERFACE;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(rule);
    }

    const groupNames = [...groups.keys()].sort((a, b) => {
      if (a === NO_INTERFACE) return -1;
      if (b === NO_INTERFACE) return 1;
      return a.localeCompare(b);
    });

    const sections = groupNames.map(name => ({
      name,
      isNoInterface: name === NO_INTERFACE,
      rules: groups.get(name)!,
    }));

    res.render('rules/list', { title: 'DNS Routes', sections });
  });

  router.get('/create', async (_req, res) => {
    const interfaces = await api.getInterfaces();
    res.render('rules/create', {
      title: 'New Rule',
      rule: { name: '', addresses: [], interfaceId: '', enabled: true },
      interfaces,
      defaultVpnInterface,
      error: null,
    });
  });

  router.post('/create', async (req, res) => {
    const { name, addresses, interfaceId, enabled } = req.body;
    const addressList = parseAddresses(addresses);
    const isEnabled = enabled === 'on';

    try {
      await api.createRule({ name, addresses: addressList, interface: interfaceId, enabled: isEnabled });
      res.redirect('/rules');
    } catch (error) {
      logger.error('Error creating rule:', error);
      const interfaces = await api.getInterfaces();
      res.render('rules/create', {
        title: 'New Rule',
        rule: { name, addresses: addressList, interfaceId, enabled: isEnabled },
        interfaces,
        defaultVpnInterface,
        error: (error as Error).message,
      });
    }
  });

  router.get('/:id/edit', async (req, res) => {
    const { id } = req.params;
    const [lists, routes, interfaces] = await Promise.all([
      api.getDnsDomainLists(),
      api.getDnsRoutes(),
      api.getInterfaces(),
    ]);

    const list = lists.find(l => l.id === id);
    if (!list) {
      res.status(404).send('Rule not found');
      return;
    }
    const route = routes.find(r => r.group === id);

    res.render('rules/update', {
      title: 'Edit Rule',
      rule: {
        id: list.id,
        name: list.description,
        addresses: list.addresses,
        interfaceId: route?.interface ?? '',
        enabled: route ? route.enabled : true,
      },
      interfaces,
      defaultVpnInterface,
      error: null,
    });
  });

  router.post('/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { name, addresses, interfaceId, enabled } = req.body;
    const addressList = parseAddresses(addresses);
    const isEnabled = enabled === 'on';

    try {
      await api.updateRule(id, { name, addresses: addressList, interface: interfaceId, enabled: isEnabled });
      res.redirect('/rules');
    } catch (error) {
      logger.error(`Error updating rule ${id}:`, error);
      const interfaces = await api.getInterfaces();
      res.render('rules/update', {
        title: 'Edit Rule',
        rule: { id, name, addresses: addressList, interfaceId, enabled: isEnabled },
        interfaces,
        defaultVpnInterface,
        error: (error as Error).message,
      });
    }
  });

  router.post('/:id/delete', async (req, res) => {
    const { id } = req.params;
    await api.deleteRule(id);
    res.redirect('/rules');
  });

  router.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('[Rules UI Error]:', err);
    res.status(500).send('Something broke in the rules UI! Check server logs.');
  });

  return router;
}

function parseAddresses(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return [];
}
