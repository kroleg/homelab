import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3006;

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

interface ServiceLink {
  name: string;
  url: string;
  description: string;
  icon: string;
  color: string;
}

const services: ServiceLink[] = [
  {
    name: 'VPN',
    url: 'http://vpn.internal',
    description: 'Включить/выключить VPN',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    color: 'bg-blue-500'
  },
  {
    name: 'Календарь',
    url: 'http://calendar.internal',
    description: 'Семейный календарь',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    color: 'bg-red-500'
  },
  {
    name: 'Чат с Claude',
    url: 'http://chat.internal',
    description: 'Общение с ИИ-ассистентом',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    color: 'bg-orange-500'
  }
];

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Семейная панель',
    services
  });
});

app.get('/health', (req, res) => {
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
