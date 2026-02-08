import { Router } from 'express';
import type { Logger } from '../logger.ts';
import type { TelegramService } from '../services/telegram.service.ts';

interface SendMessageBody {
  text: string;
  chatId?: string;
  parseMode?: 'HTML' | 'Markdown';
}

export function createApiRoutes(telegram: TelegramService, logger: Logger): Router {
  const router = Router();

  router.post('/send', async (req, res) => {
    const body = req.body as SendMessageBody;

    if (!body.text || typeof body.text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    logger.info('Sending message via API', {
      chatId: body.chatId || 'default',
      textLength: body.text.length
    });

    const success = await telegram.sendMessage(
      body.text,
      body.chatId,
      body.parseMode
    );

    if (success) {
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  return router;
}
