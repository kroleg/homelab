export function loadConfig() {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
  }
  if (!telegramChatId) {
    throw new Error('TELEGRAM_CHAT_ID environment variable is required');
  }

  return {
    port: parseInt(process.env.PORT || '3004'),
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'pagewatcher',
      user: process.env.POSTGRES_USER || 'pagewatcher',
      password: process.env.POSTGRES_PASSWORD || 'pagewatcher',
    },
    telegram: {
      botToken: telegramBotToken,
      chatId: telegramChatId,
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
