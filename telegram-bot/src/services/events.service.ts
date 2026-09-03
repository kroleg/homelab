import http from 'http';
import type { Logger } from '../logger.ts';
import type { TelegramService } from './telegram.service.ts';

interface DockerDieEvent {
  Type: string;
  Action: string;
  Actor: {
    Attributes: {
      name?: string;
      exitCode?: string;
    };
  };
}

const RECONNECT_DELAY_MS = 5000;

export function createEventsService(
  socketPath: string,
  telegram: TelegramService,
  logger: Logger
) {
  let req: http.ClientRequest | null = null;
  let stopped = true;

  function handleEvent(line: string): void {
    let event: DockerDieEvent;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    const name = event.Actor?.Attributes?.name;
    const exitCode = event.Actor?.Attributes?.exitCode;

    if (!name || exitCode === undefined || exitCode === '0') {
      return;
    }

    logger.warn('Container exited unexpectedly', { name, exitCode });
    telegram.sendMessage(
      `🔴 Container \`${name}\` exited unexpectedly (code ${exitCode})`,
      undefined,
      'Markdown'
    );
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    req = null;
    setTimeout(connect, RECONNECT_DELAY_MS);
  }

  function connect(): void {
    if (stopped) return;

    const filters = encodeURIComponent(JSON.stringify({ type: ['container'], event: ['die'] }));
    const options: http.RequestOptions = {
      socketPath,
      path: `/events?filters=${filters}`,
      method: 'GET',
    };

    logger.info('Connecting to Docker events stream');

    req = http.request(options, (res) => {
      let buffer = '';

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) handleEvent(line);
        }
      });

      res.on('end', () => {
        logger.warn('Docker events stream ended, reconnecting');
        scheduleReconnect();
      });

      res.on('error', (error) => {
        logger.error('Docker events stream error', { error });
        scheduleReconnect();
      });
    });

    req.on('error', (error) => {
      logger.error('Docker events connection error', { error });
      scheduleReconnect();
    });

    req.end();
  }

  function start(): void {
    if (!stopped) return;
    stopped = false;
    connect();
  }

  function stop(): void {
    stopped = true;
    req?.destroy();
    req = null;
  }

  return { start, stop };
}

export type EventsService = ReturnType<typeof createEventsService>;
