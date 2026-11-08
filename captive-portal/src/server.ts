import { loadConfig } from './config.ts';
import { createLogger } from './logger.ts';
import { createRegistrationLookup } from './services/registration.ts';
import { createApp } from './app.ts';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const app = createApp({
  lookup: createRegistrationLookup(config.apiUrl),
  portalUrl: config.portalUrl,
  trustedProxies: config.trustedProxies,
  log: (message, fields) => logger.info(message, fields),
});
const server = app.listen(config.port, () => logger.info('Captive portal listening', { port: config.port }));
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
