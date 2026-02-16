export function loadConfig() {
  const port = parseInt(process.env.PORT || '3009');
  const logLevel = process.env.LOG_LEVEL || 'info';
  const keeneticApiUrl = process.env.KEENETIC_API_URL || 'http://keenetic-api:3005';
  const homeUrl = process.env.HOME_URL || 'http://dom.internal';

  return {
    port,
    logLevel,
    keeneticApiUrl,
    homeUrl,
  };
}

export type Config = ReturnType<typeof loadConfig>;
