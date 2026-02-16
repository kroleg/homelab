export function loadConfig() {
  const port = parseInt(process.env.PORT || '3009');
  const logLevel = process.env.LOG_LEVEL || 'info';
  const keeneticApiUrl = process.env.KEENETIC_API_URL || 'http://keenetic-api:3005';
  const homeUrl = process.env.HOME_URL || 'http://dom.internal';

  // Bootstrap admin MACs - always treated as admin (comma-separated, uppercase)
  const adminMacs = (process.env.ADMIN_MACS || '')
    .split(',')
    .map(mac => mac.trim().toUpperCase())
    .filter(Boolean);

  const postgres = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'devices',
    user: process.env.POSTGRES_USER || 'devices',
    password: process.env.POSTGRES_PASSWORD || 'devices',
  };

  return {
    port,
    logLevel,
    keeneticApiUrl,
    homeUrl,
    adminMacs,
    postgres,
  };
}

export type Config = ReturnType<typeof loadConfig>;
