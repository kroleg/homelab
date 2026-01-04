import type { Notifier } from './notifier.interface.ts';
import type { Watcher } from '../../storage/db-schema.ts';
import { logger } from '../../logger.ts';

export function createTelegramNotifier(botToken: string, chatId: string): Notifier {
  const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  return {
    async notify(watcher: Watcher, message: string): Promise<void> {
      const text = `🔔 Page Watcher Alert\n\n${message}\n\nURL: ${watcher.url}\nSearch text: "${watcher.searchText}"`;

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Telegram API error: ${error}`);
        }

        logger.info('Telegram notification sent', { watcherId: watcher.id });
      } catch (error) {
        logger.error('Failed to send Telegram notification', { error, watcherId: watcher.id });
        throw error;
      }
    },
  };
}
