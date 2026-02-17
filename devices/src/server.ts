import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createKeeneticService } from './services/keenetic.service.ts';
import { createDeviceService } from './services/device.service.ts';
import { initDatabase, runMigrations, closeDatabase } from './storage/db.ts';
import { createUserRepository } from './storage/user.repository.ts';
import { createDeviceRepository } from './storage/device.repository.ts';
import { DeviceType } from './storage/db-schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const logger = createLogger(config.logLevel);
const keenetic = createKeeneticService(config.keeneticApiUrl, logger);

// Initialize database
const db = initDatabase(config.postgres, logger);
await runMigrations(db, logger);

const userRepo = createUserRepository(db);
const deviceRepo = createDeviceRepository(db);
const deviceService = createDeviceService(keenetic, userRepo, deviceRepo, logger);

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helper to check if IP is in Tailscale CGNAT range (100.64.0.0/10)
function isTailscaleIp(ip: string): boolean {
  if (!ip.startsWith('100.')) return false;
  const second = parseInt(ip.split('.')[1]);
  return second >= 64 && second <= 127;
}

// Lookup device and user by IP (handles both Tailscale and local IPs)
async function lookupByIp(ip: string): Promise<{
  mac: string | null;
  device: { id: number; customName: string | null; deviceType: string } | null;
  user: { id: number; name: string; slug: string; isAdmin: boolean } | null;
  tailscale: boolean;
}> {
  // Normalize IP (strip IPv6 prefix)
  const normalizedIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (isTailscaleIp(normalizedIp)) {
    const device = await deviceRepo.findByTailscaleIp(normalizedIp);
    let user = null;
    if (device?.userId) {
      user = await userRepo.findById(device.userId);
    }
    logger.debug(`Tailscale lookup: ${normalizedIp} -> device: ${device?.mac ?? 'none'}, user: ${user?.name ?? 'none'}`);
    return {
      mac: device?.mac ?? null,
      device: device ? { id: device.id, customName: device.customName, deviceType: device.deviceType } : null,
      user: user ? { id: user.id, name: user.name, slug: user.slug, isAdmin: user.isAdmin } : null,
      tailscale: true,
    };
  }

  // Local IP - lookup via Keenetic
  const client = await keenetic.getClientByIp(normalizedIp);
  if (!client?.mac) {
    return { mac: null, device: null, user: null, tailscale: false };
  }

  const mac = client.mac.toUpperCase();
  const device = await deviceRepo.findByMac(mac);
  let user = null;
  if (device?.userId) {
    user = await userRepo.findById(device.userId);
  }

  return {
    mac,
    device: device ? { id: device.id, customName: device.customName, deviceType: device.deviceType } : null,
    user: user ? { id: user.id, name: user.name, slug: user.slug, isAdmin: user.isAdmin } : null,
    tailscale: false,
  };
}

async function isAdmin(req: express.Request): Promise<boolean> {
  const clientIp = req.ip || '';
  logger.debug(`Checking admin status for IP: ${clientIp}`);

  const lookup = await lookupByIp(clientIp);

  if (!lookup.mac) {
    logger.warn(`Access denied: no device found for IP ${clientIp}`);
    return false;
  }

  // Check bootstrap admin MACs (env-based fallback)
  if (config.adminMacs.includes(lookup.mac)) {
    logger.debug(`MAC ${lookup.mac} is in ADMIN_MACS`);
    return true;
  }

  // Check if user is admin
  if (lookup.user?.isAdmin) {
    logger.debug(`IP ${clientIp} belongs to admin user ${lookup.user.name}`);
    return true;
  }

  logger.warn(`Access denied: ${clientIp} (MAC ${lookup.mac}) is not an admin`);
  return false;
}

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
      homeUrl: config.homeUrl,
    });
  }
}

// VPN policy helpers (via keenetic-api)
interface VpnPolicy {
  id: string;
  name: string;
}

async function getVpnPolicies(): Promise<VpnPolicy[]> {
  try {
    const response = await fetch(`${config.keeneticApiUrl}/api/policies`);
    if (response.ok) {
      return await response.json() as VpnPolicy[];
    }
  } catch (error) {
    logger.error('Failed to fetch VPN policies:', error);
  }
  return [];
}

async function setDevicePolicy(mac: string, policyId: string | null): Promise<boolean> {
  try {
    const response = await fetch(`${config.keeneticApiUrl}/api/clients/${encodeURIComponent(mac)}/policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyId }),
    });
    return response.ok;
  } catch (error) {
    logger.error('Failed to set device policy:', error);
    return false;
  }
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Main page - users with devices + unassigned + unregistered
app.get('/', requireAdmin, async (_req, res) => {
  try {
    const [usersWithDevices, unassignedDevices, unregisteredDevices, allUsers] = await Promise.all([
      deviceService.getUsersWithDevices(),
      deviceService.getUnassignedDevices(),
      deviceService.getUnregisteredDevices(),
      deviceService.getAllUsers(),
    ]);

    const unassignedOnlineCount = unassignedDevices.filter(d => d.online).length;
    const unregisteredOnlineCount = unregisteredDevices.filter(d => d.online).length;

    res.render('index', {
      title: 'Устройства',
      users: usersWithDevices,
      unassigned: {
        name: 'Без владельца',
        devices: unassignedDevices,
        onlineCount: unassignedOnlineCount,
      },
      unregistered: {
        name: 'Не зарегистрированы',
        devices: unregisteredDevices,
        onlineCount: unregisteredOnlineCount,
      },
      allUsers,
      deviceTypes: Object.values(DeviceType),
      homeUrl: config.homeUrl,
    });
  } catch (error) {
    logger.error('Error loading data:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось загрузить данные',
      homeUrl: config.homeUrl,
    });
  }
});

// Create user
app.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, slug, isAdmin: isAdminStr } = req.body;
    if (!name || !slug) {
      return res.status(400).render('error', {
        title: 'Ошибка',
        message: 'Имя и slug обязательны',
        homeUrl: config.homeUrl,
      });
    }
    await deviceService.createUser(name, slug.toLowerCase(), isAdminStr === 'on');
    res.redirect('/');
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось создать пользователя',
      homeUrl: config.homeUrl,
    });
  }
});

// Delete user
app.post('/users/:id/delete', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id as string);
    await deviceService.deleteUser(userId);
    res.redirect('/');
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось удалить пользователя',
      homeUrl: config.homeUrl,
    });
  }
});

// Toggle admin status
app.post('/users/:id/toggle-admin', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id as string);
    await deviceService.toggleAdmin(userId);
    res.redirect('/');
  } catch (error) {
    logger.error('Error toggling admin:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось изменить статус администратора',
      homeUrl: config.homeUrl,
    });
  }
});

// Update user
app.post('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id as string);
    const { name, slug, isAdmin: isAdminStr } = req.body;

    const updateData: { name?: string; slug?: string; isAdmin?: boolean } = {};

    if (name?.trim()) {
      updateData.name = name.trim();
    }
    if (slug?.trim()) {
      updateData.slug = slug.trim().toLowerCase();
    }
    updateData.isAdmin = isAdminStr === 'on';

    await deviceService.updateUser(userId, updateData);
    res.redirect('/');
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось обновить пользователя',
      homeUrl: config.homeUrl,
    });
  }
});

// Register device
app.post('/devices/register', requireAdmin, async (req, res) => {
  try {
    const { mac, userId, deviceType, customName } = req.body;
    if (!mac) {
      return res.status(400).render('error', {
        title: 'Ошибка',
        message: 'MAC адрес обязателен',
        homeUrl: config.homeUrl,
      });
    }
    await deviceService.registerDevice(
      mac,
      userId ? parseInt(userId) : null,
      deviceType || 'other',
      customName || undefined
    );
    res.redirect('/');
  } catch (error) {
    logger.error('Error registering device:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось зарегистрировать устройство',
      homeUrl: config.homeUrl,
    });
  }
});

// Change device owner
app.post('/devices/:id/owner', requireAdmin, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id as string);
    const { userId } = req.body;
    await deviceService.changeOwner(deviceId, userId ? parseInt(userId) : null);
    res.redirect('/');
  } catch (error) {
    logger.error('Error changing owner:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось изменить владельца',
      homeUrl: config.homeUrl,
    });
  }
});

// Change device type
app.post('/devices/:id/type', requireAdmin, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id as string);
    const { deviceType } = req.body;
    if (!Object.values(DeviceType).includes(deviceType)) {
      return res.status(400).render('error', {
        title: 'Ошибка',
        message: 'Неверный тип устройства',
        homeUrl: config.homeUrl,
      });
    }
    await deviceService.updateDeviceType(deviceId, deviceType);
    res.redirect('/');
  } catch (error) {
    logger.error('Error changing device type:', error);
    res.status(500).render('error', {
      title: 'Ошибка',
      message: 'Не удалось изменить тип устройства',
      homeUrl: config.homeUrl,
    });
  }
});

// Get device for editing (AJAX)
app.get('/devices/:id', requireAdmin, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id as string);
    const [device, allUsers, vpnPolicies] = await Promise.all([
      deviceRepo.findById(deviceId),
      userRepo.findAll(),
      getVpnPolicies(),
    ]);

    if (!device) {
      res.status(404).json({ error: 'Устройство не найдено' });
      return;
    }

    // Get keenetic name from online devices
    const clients = await keenetic.getClients();
    const client = clients.find(c => c.mac.toUpperCase() === device.mac.toUpperCase());

    res.json({
      device: {
        id: device.id,
        mac: device.mac,
        customName: device.customName,
        deviceType: device.deviceType,
        userId: device.userId,
        tailscaleIp: device.tailscaleIp,
        keeneticName: client?.name || null,
        policy: client?.policy || null,
      },
      users: allUsers.map(u => ({ id: u.id, name: u.name })),
      deviceTypes: Object.values(DeviceType),
      vpnPolicies,
    });
  } catch (error) {
    logger.error('Error fetching device:', error);
    res.status(500).json({ error: 'Не удалось загрузить устройство' });
  }
});

// Update device (AJAX)
app.post('/devices/:id', requireAdmin, async (req, res) => {
  try {
    const deviceId = parseInt(req.params.id as string);
    const { customName, deviceType, userId, vpnPolicy, tailscaleIp } = req.body;

    // Get device first (need MAC for policy)
    const device = await deviceRepo.findById(deviceId);
    if (!device) {
      res.status(404).json({ error: 'Устройство не найдено' });
      return;
    }

    const updateData: {
      customName?: string | null;
      deviceType?: (typeof DeviceType)[keyof typeof DeviceType];
      userId?: number | null;
      tailscaleIp?: string | null;
    } = {};

    if (customName !== undefined) {
      updateData.customName = customName.trim() || null;
    }
    if (deviceType && Object.values(DeviceType).includes(deviceType)) {
      updateData.deviceType = deviceType as (typeof DeviceType)[keyof typeof DeviceType];
    }
    if (userId !== undefined) {
      updateData.userId = userId ? parseInt(userId) : null;
    }
    if (tailscaleIp !== undefined) {
      updateData.tailscaleIp = tailscaleIp.trim() || null;
    }

    await deviceService.updateDevice(deviceId, updateData);

    // Set VPN policy if provided
    if (vpnPolicy !== undefined) {
      const policyId = vpnPolicy || null;
      const success = await setDevicePolicy(device.mac, policyId);
      if (!success) {
        res.status(500).json({ error: 'Не удалось изменить VPN политику' });
        return;
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating device:', error);
    res.status(500).json({ error: 'Не удалось обновить устройство' });
  }
});

// API endpoints
app.get('/api/users', requireAdmin, async (_req, res) => {
  try {
    const users = await deviceService.getUsersWithDevices();
    res.json(users);
  } catch (error) {
    logger.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/devices', requireAdmin, async (_req, res) => {
  try {
    const [assigned, unassigned] = await Promise.all([
      deviceService.getUsersWithDevices(),
      deviceService.getUnassignedDevices(),
    ]);
    const allDevices = [
      ...assigned.flatMap(u => u.devices),
      ...unassigned,
    ];
    res.json(allDevices);
  } catch (error) {
    logger.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/discovered', requireAdmin, async (_req, res) => {
  try {
    const devices = await deviceService.getUnregisteredDevices();
    res.json(devices);
  } catch (error) {
    logger.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public API endpoint to list all users (used by torrent-ui for admin view)
app.get('/api/users', async (_req, res) => {
  try {
    const users = await userRepo.findAll();
    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      slug: u.slug,
      isAdmin: u.isAdmin,
    })));
  } catch (error) {
    logger.error('API error in /api/users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public API endpoint to get user's devices (used by family-dashboard)
app.get('/api/users/:id/devices', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const devices = await deviceService.getUserDevices(userId);
    res.json(devices);
  } catch (error) {
    logger.error('API error in /api/users/:id/devices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public API endpoint for admin status lookup (used by other services)
app.get('/api/whoami', async (req, res) => {
  try {
    const ip = req.query.ip as string;
    if (!ip) {
      res.status(400).json({ error: 'ip query parameter required' });
      return;
    }

    const lookup = await lookupByIp(ip);

    // Compute isAdmin: ADMIN_MACS.includes(mac) || user?.isAdmin
    const isAdmin = (lookup.mac && config.adminMacs.includes(lookup.mac)) || lookup.user?.isAdmin === true;

    res.json({
      ...lookup,
      isAdmin,
    });
  } catch (error) {
    logger.error('API error in /api/whoami:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Server error:', err);
  res.status(500).render('error', {
    title: 'Ошибка',
    message: 'Внутренняя ошибка сервера',
    homeUrl: config.homeUrl,
  });
});

const server = app.listen(config.port, () => {
  logger.info(`Devices running on http://localhost:${config.port}`);
});

async function shutdown() {
  logger.info('Shutting down...');
  server.close(async () => {
    await closeDatabase(logger);
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
