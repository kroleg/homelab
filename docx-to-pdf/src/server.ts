import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createConverterService } from './services/converter.service.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const logger = createLogger(config.logLevel);
const converter = createConverterService(logger);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.docx?$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .doc and .docx files are allowed'));
    }
  },
});

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, '..', 'views'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (_req, res) => {
  res.render('index');
});

app.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const { pdf, filename } = await converter.convertDocxToPdf(req.file.buffer, req.file.originalname);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  } catch (err) {
    logger.error('Conversion failed:', err);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.message === 'Only .doc and .docx files are allowed') {
    res.status(400).json({ error: err.message });
    return;
  }
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

function shutdown() {
  logger.info('Shutting down...');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
