import type { Logger } from '../logger.ts';
import type { TelegramService, TelegramMessage } from './telegram.service.ts';
import type { HardwareService } from './hardware.service.ts';

export function createCommandHandler(
  telegram: TelegramService,
  hardware: HardwareService,
  logger: Logger
) {
  async function handleCommand(message: TelegramMessage): Promise<void> {
    const text = message.text?.trim() || '';
    const chatId = message.chat.id.toString();

    if (!text.startsWith('/')) {
      return;
    }

    const command = text.split(' ')[0].split('@')[0].toLowerCase();

    logger.info('Received command', { command, chatId, from: message.from?.username });

    switch (command) {
      case '/start':
        await telegram.sendMessage(
          'Hello! I am the homelab bot. Use /help to see available commands.',
          chatId
        );
        break;

      case '/help':
        await telegram.sendMessage(
          '*Available Commands*\n\n' +
          '/hwstatus - Show CPU temp, disk temps, and load average\n' +
          '/help - Show this help message',
          chatId,
          'Markdown'
        );
        break;

      case '/hwstatus':
        try {
          const metrics = await hardware.getMetrics();
          const formatted = hardware.formatMetrics(metrics);
          await telegram.sendMessage(formatted, chatId, 'Markdown');
        } catch (error) {
          logger.error('Failed to get hardware metrics', { error });
          await telegram.sendMessage('Failed to get hardware metrics', chatId);
        }
        break;

      default:
        logger.debug('Unknown command', { command });
        break;
    }
  }

  return {
    handleCommand,
  };
}

export type CommandHandler = ReturnType<typeof createCommandHandler>;
