import type { Logger } from '../logger.ts';

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface GetUpdatesResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

interface SendMessageResponse {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
}

export function createTelegramService(token: string, defaultChatId: string, logger: Logger) {
  const baseUrl = `https://api.telegram.org/bot${token}`;

  async function sendMessage(
    text: string,
    chatId?: string,
    parseMode?: 'HTML' | 'Markdown'
  ): Promise<boolean> {
    const targetChatId = chatId || defaultChatId;

    const body: Record<string, string> = {
      chat_id: targetChatId,
      text,
    };

    if (parseMode) {
      body.parse_mode = parseMode;
    }

    try {
      const response = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json() as SendMessageResponse;

      if (!data.ok) {
        logger.error('Telegram sendMessage failed', { description: data.description });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Telegram sendMessage error', { error });
      return false;
    }
  }

  async function getUpdates(
    offset: number,
    timeout: number,
    signal?: AbortSignal
  ): Promise<TelegramUpdate[]> {
    try {
      const response = await fetch(
        `${baseUrl}/getUpdates?offset=${offset}&timeout=${timeout}`,
        { signal }
      );

      const data = await response.json() as GetUpdatesResponse;

      if (!data.ok) {
        logger.error('Telegram getUpdates failed');
        return [];
      }

      return data.result;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.debug('getUpdates aborted');
        return [];
      }
      logger.error('Telegram getUpdates error', { error });
      return [];
    }
  }

  interface InlineKeyboardButton {
    text: string;
    callback_data: string;
  }

  async function sendMessageWithKeyboard(
    text: string,
    buttons: InlineKeyboardButton[][],
    chatId?: string,
    parseMode?: 'HTML' | 'Markdown'
  ): Promise<boolean> {
    const targetChatId = chatId || defaultChatId;

    const body: Record<string, unknown> = {
      chat_id: targetChatId,
      text,
      reply_markup: {
        inline_keyboard: buttons,
      },
    };

    if (parseMode) {
      body.parse_mode = parseMode;
    }

    try {
      const response = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json() as SendMessageResponse;

      if (!data.ok) {
        logger.error('Telegram sendMessageWithKeyboard failed', { description: data.description });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Telegram sendMessageWithKeyboard error', { error });
      return false;
    }
  }

  async function answerCallbackQuery(
    callbackQueryId: string,
    text?: string
  ): Promise<boolean> {
    const body: Record<string, string> = {
      callback_query_id: callbackQueryId,
    };

    if (text) {
      body.text = text;
    }

    try {
      const response = await fetch(`${baseUrl}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json() as { ok: boolean };
      return data.ok;
    } catch (error) {
      logger.error('Telegram answerCallbackQuery error', { error });
      return false;
    }
  }

  return {
    sendMessage,
    sendMessageWithKeyboard,
    answerCallbackQuery,
    getUpdates,
  };
}

export type TelegramService = ReturnType<typeof createTelegramService>;
export type { TelegramUpdate, TelegramMessage, TelegramCallbackQuery };
