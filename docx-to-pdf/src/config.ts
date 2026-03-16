export function loadConfig() {
  const port = parseInt(process.env.PORT || '3010');
  const logLevel = process.env.LOG_LEVEL || 'info';

  return {
    port,
    logLevel,
  };
}

export type Config = ReturnType<typeof loadConfig>;
