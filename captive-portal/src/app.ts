import express from 'express';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { Lookup } from './services/registration.ts';

// Keep DNS overrides and Traefik's explicit Host rules in sync with this table.
export const probes = [
  { host: 'captive.apple.com', path: '/hotspot-detect.html', status: 200, type: 'html', body: '<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>' },
  { host: 'connectivitycheck.gstatic.com', path: '/generate_204', status: 204, type: 'text', body: '' },
  { host: 'connectivitycheck.android.com', path: '/generate_204', status: 204, type: 'text', body: '' },
  { host: 'www.msftconnecttest.com', path: '/connecttest.txt', status: 200, type: 'text', body: 'Microsoft Connect Test' },
  { host: 'ipv6.msftconnecttest.com', path: '/connecttest.txt', status: 200, type: 'text', body: 'Microsoft Connect Test' },
] as const;

export function createApp(options: {
  lookup: Lookup;
  portalUrl: string;
  trustedProxies: string[];
  log: (message: string, fields: Record<string, unknown>) => void;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustedProxies);
  app.set('view engine', 'pug');
  app.set('views', fileURLToPath(new URL('./views/', import.meta.url)));
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  app.use((req, res, next) => {
    if (req.path !== '/health') {
      res.on('finish', () => options.log('portal_response', {
        ip: (req.ip || '').replace(/^::ffff:/, ''), host: req.hostname,
        path: req.path, status: res.statusCode, bytes: res.getHeader('content-length') || null,
      }));
    }
    next();
  });
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

  app.use(async (req, res) => {
    const ip = (req.ip || '').replace(/^::ffff:/, '');
    const probeHost = probes.some(p => p.host === req.hostname.toLowerCase());
    const probe = probes.find(p => p.host === req.hostname.toLowerCase() && p.path === req.path);
    // The captive browser may revisit the probe host at its root after detection.
    // Render instructions directly there too, without a second DNS/redirect hop.
    if (probeHost && !probe && !['/', '/redirect'].includes(req.path)) { res.status(404).type('text').send('Страница не найдена'); return; }
    if (!probeHost && !['/', '/api/status'].includes(req.path)) { res.status(404).type('text').send('Страница не найдена'); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.status(405).type('text').send('Метод запроса не поддерживается'); return; }
    try {
      if (!isIP(ip)) throw new Error('Client address unavailable');
      const client = await options.lookup(ip);
      const registered = client?.registered === true;
      options.log('portal_request', { ip, registered, host: req.hostname, path: req.path });
      if (probe && registered) {
        res.status(probe.status).type(probe.type).send(probe.body);
        return;
      }
      if (probeHost) {
        res.render('index', { ip, client, registered, unavailable: false });
        return;
      }
      if (req.path === '/api/status') {
        res.json({ ip, mac: client?.mac || null, name: client?.name || null, registered });
        return;
      }
      res.render('index', { ip, client, registered, unavailable: false });
    } catch (error) {
      options.log('registration_unavailable', { ip, error: (error as Error).message });
      // Never turn a router failure into a claim that a device is registered.
      if (req.path === '/api/status') {
        res.status(503).json({ error: 'Проверка регистрации временно недоступна' });
      } else {
        res.status(503).render('index', { ip, client: null, registered: false, unavailable: true });
      }
    }
  });
  return app;
}
