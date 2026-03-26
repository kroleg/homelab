import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DEVICES_API_URL = process.env.DEVICES_API_URL || 'http://devices:3000';

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('trust proxy', true);

interface ServiceLink {
  name: string;
  url: string;
  description?: string;
  icon: string;
}

interface WhoamiResponse {
  mac: string | null;
  device: { id: number; customName: string | null; deviceType: string } | null;
  user: { id: number; name: string; slug: string; isAdmin: boolean; role: string } | null;
  isAdmin: boolean;
}

async function getWhoami(ip: string): Promise<WhoamiResponse | null> {
  try {
    const response = await fetch(`${DEVICES_API_URL}/api/whoami?ip=${encodeURIComponent(ip)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function getClientIp(req: express.Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '';
}

const services: ServiceLink[] = [
  {
    name: 'VPN',
    url: 'http://vpn.internal',
    description: 'Включить/выключить VPN',
    icon: 'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418'
  },
  {
    name: 'Календарь',
    url: 'http://calendar.internal',
    description: 'Семейный',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
  },
  {
    name: 'Загрузки',
    url: 'http://dl.internal',
    description: 'Скачать торренты',
    icon: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3'
  },
  {
    name: 'Кино',
    url: 'http://media.internal',
    description: 'Фильмы и сериалы',
    icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m14.25 0h1.5'
  },
  {
    name: 'DOCX → PDF',
    url: 'http://pdf.internal',
    description: 'Конвертация документов',
    icon: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z'
  }
];

const parentServices: ServiceLink[] = [
  {
    name: 'M-Shop',
    url: 'http://mshop.internal',
    description: 'Магазин',
    icon: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
  },
];

const adminServices: ServiceLink[] = [
  {
    name: 'Home Assistant',
    url: 'http://hass.internal',
    icon: 'M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3Z',
  },
  {
    name: 'Zigbee2MQTT',
    url: 'http://z2m.internal',
    icon: 'M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z',
  },
  {
    name: 'Устройства и профили',
    url: 'http://devices.internal',
    icon: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z'
  },
  {
    name: 'Grafana',
    url: 'http://grafana.internal',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z'
  },
  {
    name: 'DNS2VPN',
    url: 'http://admin.internal',
    icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75'
  },
  {
    name: 'Здоровье HDD/SSD',
    url: 'http://disk-monitor.internal',
    icon: 'M21.75 17.25v-.228a4.5 4.5 0 0 0-.12-1.03l-2.268-9.64a3.375 3.375 0 0 0-3.285-2.602H7.923a3.375 3.375 0 0 0-3.285 2.602l-2.268 9.64a4.5 4.5 0 0 0-.12 1.03v.228m19.5 0a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3m19.5 0a3 3 0 0 0-3-3H5.25a3 3 0 0 0-3 3m16.5 0h.008v.008h-.008v-.008Zm-3 0h.008v.008h-.008v-.008Z'
  },
  {
    name: 'qBittorrent',
    url: 'http://torrent.internal',
    icon: 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5'
  },
  {
    name: 'Page Watcher',
    url: 'http://page-watcher.internal',
    description: 'Мониторинг страниц',
    icon: 'M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
  },
];

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

interface TrafficDevice {
  mac: string;
  name: string;
  today: number;
  weekly: number;
}

interface UserTraffic {
  today: number;
  weekly: number;
  devices: TrafficDevice[];
}

async function getUserTraffic(userId: number): Promise<UserTraffic> {
  try {
    const response = await fetch(`${DEVICES_API_URL}/api/users/${userId}/traffic`);
    if (response.ok) return await response.json();
  } catch {
    // ignore
  }
  return { today: 0, weekly: 0, devices: [] };
}

app.get('/', async (req, res) => {
  const clientIp = getClientIp(req);
  const whoami = await getWhoami(clientIp);
  const admin = whoami?.isAdmin ?? false;
  const isParent = whoami?.user?.role === 'parent';

  let traffic: UserTraffic | null = null;
  if (whoami?.user) {
    traffic = await getUserTraffic(whoami.user.id);
  }

  res.render('index', {
    title: 'Семейная панель',
    services,
    parentServices: isParent ? parentServices : [],
    adminServices: admin ? adminServices : [],
    isAdmin: admin,
    currentUser: whoami?.user ?? null,
    traffic,
    formatBytes,
  });
});

app.get('/me', async (req, res) => {
  const clientIp = getClientIp(req);
  const whoami = await getWhoami(clientIp);

  if (!whoami?.user) {
    res.render('error', {
      title: 'Не найден',
      message: 'Ваше устройство не привязано к пользователю',
    });
    return;
  }

  // Fetch user's devices from devices API
  let devices: Array<{ customName: string | null; mac: string; ip: string | null; online: boolean; deviceType: string }> = [];
  try {
    const response = await fetch(`${DEVICES_API_URL}/api/users/${whoami.user.id}/devices`);
    if (response.ok) {
      devices = await response.json();
    }
  } catch {
    // ignore
  }

  res.render('me', {
    title: whoami.user.name,
    user: whoami.user,
    devices,
  });
});

app.get('/my-traffic', async (req, res) => {
  const clientIp = getClientIp(req);
  const whoami = await getWhoami(clientIp);

  if (!whoami?.user) {
    res.render('error', {
      title: 'Не найден',
      message: 'Ваше устройство не привязано к пользователю',
    });
    return;
  }

  const traffic = await getUserTraffic(whoami.user.id);

  res.render('my-traffic', {
    title: 'Мой трафик',
    user: whoami.user,
    traffic,
    formatBytes,
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(PORT, () => {
  console.log(`Family Dashboard running on http://localhost:${PORT}`);
});

function shutdown() {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
