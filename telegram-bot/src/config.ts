export function loadConfig() {
  const port = parseInt(process.env.PORT || '3008');
  const logLevel = process.env.LOG_LEVEL || 'info';

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  }

  if (!process.env.TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_CHAT_ID environment variable is required');
  }

  return {
    port,
    logLevel,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    sysPath: process.env.SYS_PATH || '/sys',
    procPath: process.env.PROC_PATH || '/proc',
    rootfsPath: process.env.ROOTFS_PATH || '/',
    dockerSocketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock',
  };
}

export type Config = ReturnType<typeof loadConfig>;
