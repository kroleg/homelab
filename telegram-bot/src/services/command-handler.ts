import type { Logger } from '../logger.ts';
import type { TelegramService, TelegramMessage, TelegramCallbackQuery } from './telegram.service.ts';
import type { HardwareService } from './hardware.service.ts';
import type { DockerService } from './docker.service.ts';

const SELF_CONTAINER_NAME = 'telegram-bot';

export function createCommandHandler(
  telegram: TelegramService,
  hardware: HardwareService,
  docker: DockerService,
  authorizedChatId: string,
  logger: Logger
) {
  function isAuthorized(userId: number): boolean {
    return userId.toString() === authorizedChatId;
  }

  async function handleCommand(message: TelegramMessage): Promise<void> {
    const text = message.text?.trim() || '';
    const chatId = message.chat.id.toString();

    if (!text.startsWith('/')) {
      return;
    }

    const parts = text.split(' ');
    const command = parts[0].split('@')[0].toLowerCase();
    const args = parts.slice(1).join(' ').trim();

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
          '/docker\\_ps - List all containers\n' +
          '/docker\\_start \\[name\\] - Start a container\n' +
          '/docker\\_stop \\[name\\] - Stop a container\n' +
          '/docker\\_restart \\[name\\] - Restart a container\n' +
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

      case '/docker_ps':
        await handleContainersList(chatId, message.from?.id);
        break;

      case '/docker_start':
        await handleContainerAction('start', args, chatId, message.from?.id);
        break;

      case '/docker_stop':
        await handleContainerAction('stop', args, chatId, message.from?.id);
        break;

      case '/docker_restart':
        await handleContainerAction('restart', args, chatId, message.from?.id);
        break;

      default:
        logger.debug('Unknown command', { command });
        break;
    }
  }

  async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const data = query.data || '';
    const chatId = query.message?.chat.id.toString();
    const userId = query.from.id;

    logger.info('Received callback query', { data, from: query.from.username });

    if (!chatId) {
      await telegram.answerCallbackQuery(query.id, 'Error: no chat context');
      return;
    }

    if (!isAuthorized(userId)) {
      logger.warn('Unauthorized callback query attempt', { userId, username: query.from.username });
      await telegram.answerCallbackQuery(query.id, 'Unauthorized');
      return;
    }

    if (data === 'noop') {
      await telegram.answerCallbackQuery(query.id);
      return;
    }

    const [action, containerName] = data.split(':');

    if (!action || !containerName) {
      await telegram.answerCallbackQuery(query.id, 'Invalid callback data');
      return;
    }

    if (containerName === SELF_CONTAINER_NAME && (action === 'stop' || action === 'restart')) {
      await telegram.answerCallbackQuery(query.id, 'Cannot stop/restart the bot itself');
      return;
    }

    try {
      switch (action) {
        case 'start':
          await docker.startContainer(containerName);
          await telegram.answerCallbackQuery(query.id, `Started ${containerName}`);
          await telegram.sendMessage(`✅ Started \`${containerName}\``, chatId, 'Markdown');
          break;

        case 'stop':
          await docker.stopContainer(containerName);
          await telegram.answerCallbackQuery(query.id, `Stopped ${containerName}`);
          await telegram.sendMessage(`✅ Stopped \`${containerName}\``, chatId, 'Markdown');
          break;

        case 'restart':
          await docker.restartContainer(containerName);
          await telegram.answerCallbackQuery(query.id, `Restarted ${containerName}`);
          await telegram.sendMessage(`✅ Restarted \`${containerName}\``, chatId, 'Markdown');
          break;

        default:
          await telegram.answerCallbackQuery(query.id, 'Unknown action');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Callback action failed', { action, containerName, error });
      await telegram.answerCallbackQuery(query.id, `Error: ${errorMessage}`);
    }
  }

  async function handleContainersList(chatId: string, userId?: number): Promise<void> {
    if (!userId || !isAuthorized(userId)) {
      logger.warn('Unauthorized containers list attempt', { userId });
      await telegram.sendMessage('Unauthorized', chatId);
      return;
    }

    try {
      const containers = await docker.listContainers(true);
      const text = docker.formatContainerList(containers);
      await telegram.sendMessage(text, chatId);
    } catch (error) {
      logger.error('Failed to list containers', { error });
      await telegram.sendMessage('Failed to list containers', chatId);
    }
  }

  async function handleContainerAction(
    action: 'start' | 'stop' | 'restart',
    args: string,
    chatId: string,
    userId?: number
  ): Promise<void> {
    if (!userId || !isAuthorized(userId)) {
      logger.warn(`Unauthorized ${action} attempt`, { userId });
      await telegram.sendMessage('Unauthorized', chatId);
      return;
    }

    try {
      if (!args) {
        // Show buttons for container selection
        const running = action === 'start' ? false : true;
        const containers = await docker.listContainers(true);
        const filtered = containers.filter((c) => {
          if (c.name === SELF_CONTAINER_NAME && action !== 'start') {
            return false;
          }
          return running ? c.state === 'running' : c.state !== 'running';
        });

        if (filtered.length === 0) {
          const state = running ? 'running' : 'stopped';
          await telegram.sendMessage(`No ${state} containers found`, chatId);
          return;
        }

        const buttons = filtered.map((c) => [{
          text: c.name,
          callback_data: `${action}:${c.name}`,
        }]);

        const actionText = action.charAt(0).toUpperCase() + action.slice(1);
        await telegram.sendMessageWithKeyboard(
          `Select container to ${action}:`,
          buttons,
          chatId
        );
        return;
      }

      // Find containers matching the partial name
      const running = action === 'start' ? false : undefined;
      const matches = await docker.findContainers(args, running);

      // Filter out self for stop/restart
      const filtered = matches.filter((c) => {
        if (c.name === SELF_CONTAINER_NAME && action !== 'start') {
          return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        await telegram.sendMessage(`No containers matching '${args}'`, chatId);
        return;
      }

      if (filtered.length === 1) {
        const container = filtered[0];

        // Check if action is valid for current state
        if (action === 'start' && container.state === 'running') {
          await telegram.sendMessage(`Container \`${container.name}\` is already running`, chatId, 'Markdown');
          return;
        }

        switch (action) {
          case 'start':
            await docker.startContainer(container.name);
            break;
          case 'stop':
            await docker.stopContainer(container.name);
            break;
          case 'restart':
            await docker.restartContainer(container.name);
            break;
        }

        const pastTense = action === 'stop' ? 'Stopped' : action === 'start' ? 'Started' : 'Restarted';
        await telegram.sendMessage(`✅ ${pastTense} \`${container.name}\``, chatId, 'Markdown');
        return;
      }

      // Multiple matches - show buttons
      const buttons = filtered.map((c) => [{
        text: `${c.name} (${c.state})`,
        callback_data: `${action}:${c.name}`,
      }]);

      await telegram.sendMessageWithKeyboard(
        `Multiple containers match '${args}'. Select one:`,
        buttons,
        chatId
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to ${action} container`, { error });
      await telegram.sendMessage(`Failed to ${action} container: ${errorMessage}`, chatId);
    }
  }

  return {
    handleCommand,
    handleCallbackQuery,
  };
}

export type CommandHandler = ReturnType<typeof createCommandHandler>;
