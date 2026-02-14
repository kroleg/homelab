import type { Logger } from '../logger.ts';
import type { TelegramService } from './telegram.service.ts';
import type { CommandHandler } from './command-handler.ts';

export function createPollerService(
  telegram: TelegramService,
  commandHandler: CommandHandler,
  logger: Logger
) {
  let offset = 0;
  let running = false;
  let abortController: AbortController | null = null;

  async function poll(): Promise<void> {
    while (running) {
      try {
        const updates = await telegram.getUpdates(offset, 30, abortController?.signal);

        for (const update of updates) {
          offset = update.update_id + 1;

          if (update.message) {
            await commandHandler.handleCommand(update.message);
          }

          if (update.callback_query) {
            await commandHandler.handleCallbackQuery(update.callback_query);
          }
        }
      } catch (error) {
        logger.error('Polling error', { error });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  function start(): void {
    if (running) return;

    running = true;
    abortController = new AbortController();
    logger.info('Starting Telegram polling');
    poll();
  }

  function stop(): void {
    if (!running) return;

    running = false;
    abortController?.abort();
    abortController = null;
    logger.info('Stopped Telegram polling');
  }

  return {
    start,
    stop,
  };
}

export type PollerService = ReturnType<typeof createPollerService>;
