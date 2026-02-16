import { Router } from 'express';
import type { Logger } from '../logger.ts';
import type { KeeneticService } from '../services/keenetic.service.ts';

export function createApiRoutes(logger: Logger, keenetic: KeeneticService): Router {
  const router = Router();

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
