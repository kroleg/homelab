export function loadConfig() {
  const port = parseInt(process.env.PORT || '3000');
  const logLevel = process.env.LOG_LEVEL || 'info';

  if (!process.env.KEENETIC_HOST) {
    throw new Error('KEENETIC_HOST environment variable is required');
  }
  if (!process.env.KEENETIC_LOGIN) {
    throw new Error('KEENETIC_LOGIN environment variable is required');
  }
  if (!process.env.KEENETIC_PASSWORD) {
    throw new Error('KEENETIC_PASSWORD environment variable is required');
  }

  return {
    port,
    logLevel,
    keeneticHost: process.env.KEENETIC_HOST,
    keeneticLogin: process.env.KEENETIC_LOGIN,
    keeneticPassword: process.env.KEENETIC_PASSWORD,
  };
}

export type Config = ReturnType<typeof loadConfig>;
