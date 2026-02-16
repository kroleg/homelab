import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createKeeneticService } from './services/keenetic.service.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const logger = createLogger(config.logLevel);
const keenetic = createKeeneticService(config.keeneticApiUrl, logger);

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('trust proxy', 1);

async function isAdmin(req: express.Request): Promise<boolean> {
  let clientIp = req.ip || '';
  // Strip IPv4-mapped IPv6 prefix
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.slice(7);
  }
  logger.debug(`Checking admin status for IP: ${clientIp}`);
  const client = await keenetic.getClientByIp(clientIp);
  return client?.profile?.isAdmin ?? false;
}

// Admin check middleware
async function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (await isAdmin(req)) {
    next();
  } else {
    res.status(403).render('error', {
      title: 'Доступ запрещен',
      message: 'Доступ только для администраторов',
    });
  }
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Index page - list all devices grouped by owner
app.get('/', requireAdmin, async (_req, res) => {
  try {
    const children = await keenetic.getChildren();
    const clients = await keenetic.getClients();

    const sortDevices = (devices: typeof clients) =>
      devices.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    const childrenWithDevices = children.map(child => {
      const devices = sortDevices(clients.filter(c => c.profile?.id === child.id));
      const onlineCount = devices.filter(d => d.online).length;
      return {
        ...child,
        devices,
        onlineCount,
      };
    });

    // Unowned devices (no profile assigned)
    const unownedDevices = sortDevices(clients.filter(c => c.profile === null));
    const unownedOnlineCount = unownedDevices.filter(d => d.online).length;

    res.render('index', {
      title: 'Устройства',
      children: childrenWithDevices,
      unowned: {
        name: 'Без владельца',
        devices: unownedDevices,
        onlineCount: unownedOnlineCount,
      },
      homeUrl: config.homeUrl,
    });
  } catch (error) {
    logger.error('Error loading children:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось загрузить данные',
    });
  }
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).render('error', {
    title: 'Ошибка',
    message: 'Внутренняя ошибка сервера',
  });
});

const server = app.listen(config.port, () => {
  logger.info(`Devices running on http://localhost:${config.port}`);
});

function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
