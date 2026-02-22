import { Router } from 'express';
import type { Logger } from '../logger.ts';
import type { KeeneticService } from '../services/keenetic.service.ts';

export function createApiRoutes(logger: Logger, keenetic: KeeneticService, defaultInterface?: string): Router {
  const router = Router();

  // Routes endpoints
  router.get('/routes', async (_req, res) => {
    logger.debug('Listing all routes');
    const routes = await keenetic.getRoutes();
    res.json(routes);
  });

  router.post('/routes', async (req, res) => {
    const { hosts, network, mask, interfaces, comment } = req.body;

    if (!interfaces || !Array.isArray(interfaces) || interfaces.length === 0) {
      res.status(400).json({ error: 'interfaces array is required' });
      return;
    }

    if (!comment || typeof comment !== 'string') {
      res.status(400).json({ error: 'comment is required' });
      return;
    }

    // Resolve interface names to IDs
    const resolvedInterfaces = await Promise.all(
      interfaces.map((iface: string) => keenetic.resolveInterfaceId(iface, defaultInterface))
    );

    logger.debug(`Adding routes with interfaces: ${resolvedInterfaces.join(', ')}`);

    const messages = await keenetic.addRoutes({
      hosts,
      network,
      mask,
      interfaces: resolvedInterfaces,
      comment,
    });

    res.json({ success: true, messages });
  });

  router.delete('/routes', async (req, res) => {
    const { commentPrefix } = req.body;

    if (!commentPrefix || typeof commentPrefix !== 'string') {
      res.status(400).json({ error: 'commentPrefix is required' });
      return;
    }

    logger.debug(`Removing routes with comment prefix: ${commentPrefix}`);
    const removedCount = await keenetic.removeRoutesByCommentPrefix(commentPrefix);
    res.json({ success: true, removedCount });
  });

  // Interfaces endpoints
  router.get('/interfaces', async (req, res) => {
    const types = req.query.types
      ? (req.query.types as string).split(',')
      : ['Wireguard'];

    logger.debug(`Listing interfaces with types: ${types.join(', ')}`);
    const interfaces = await keenetic.getInterfaces(types);
    res.json(interfaces);
  });

  router.get('/interfaces/resolve', async (req, res) => {
    const name = req.query.name as string;

    if (!name) {
      res.status(400).json({ error: 'name query parameter is required' });
      return;
    }

    logger.debug(`Resolving interface: ${name}`);
    const id = await keenetic.resolveInterfaceId(name, defaultInterface);
    res.json({ id });
  });

  router.get('/client', async (req, res) => {
    const ip = req.query.ip as string;
    if (!ip) {
      res.status(400).json({ error: 'ip query parameter is required' });
      return;
    }

    logger.debug(`Looking up client for IP: ${ip}`);
    const client = await keenetic.getClientByIp(ip);
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json(client);
  });

  router.get('/clients', async (req, res) => {
    logger.debug('Listing all clients');
    const clients = await keenetic.getClients();
    res.json(clients);
  });

  router.get('/policies', async (_req, res) => {
    logger.debug('Listing all policies');
    const policies = await keenetic.getPolicies();
    res.json(policies);
  });

  router.post('/clients/:mac/policy', async (req, res) => {
    const { mac } = req.params;
    const { policyId } = req.body;

    if (!mac) {
      res.status(400).json({ error: 'MAC address is required' });
      return;
    }

    logger.debug(`Setting policy ${policyId || 'none'} for MAC: ${mac}`);
    const success = await keenetic.setClientPolicy(mac, policyId || null);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to set policy' });
    }
  });

  return router;
}
