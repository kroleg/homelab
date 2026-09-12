export function loadConfig() {
  const port = parseInt(process.env.PORT || '3000');
  const logLevel = process.env.LOG_LEVEL || 'info';

  if (!process.env.KEENETIC_API_URL) {
    throw new Error('KEENETIC_API_URL environment variable is required');
  }

  return {
    port,
    logLevel,
    keeneticApiUrl: process.env.KEENETIC_API_URL,
    defaultVpnInterface: process.env.DEFAULT_VPN_INTERFACE,
  };
}

export type Config = ReturnType<typeof loadConfig>;
