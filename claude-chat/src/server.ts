import express from 'express';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3005;

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());

app.get('/', (_req, res) => {
  res.render('index');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/chat', (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // Build prompt with history
  let prompt = '';
  if (Array.isArray(history) && history.length > 0) {
    for (const msg of history) {
      if (msg.role === 'user') {
        prompt += `User: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        prompt += `Assistant: ${msg.content}\n\n`;
      }
    }
  }
  prompt += `User: ${message}\n\nAssistant:`;

  try {
    const result = execSync(`claude -p "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" --output-format text`, {
      encoding: 'utf-8',
      cwd: '/tmp',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    res.json({ response: result.trim() });
  } catch (err) {
    console.error('Claude error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`Claude Chat server running on port ${PORT}`);
});
