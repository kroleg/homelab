import { DnsProxy } from './dns-proxy.ts';
import { DnsLogsApi } from './api.ts';
import { defaultConfig } from './config.ts';
import { createLogger } from './logger.ts';

async function main() {
  const logger = createLogger(defaultConfig.logLevel);
  const dnsServer = new DnsProxy(defaultConfig);
  let apiServer: DnsLogsApi | null = null;

  try {
    await dnsServer.start();

    // Optionally start the HTTP API
    if (defaultConfig.enableApi) {
      apiServer = new DnsLogsApi(logger);
      await apiServer.start(defaultConfig.apiPort);
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => shutdown(dnsServer, apiServer));
    process.on('SIGTERM', () => shutdown(dnsServer, apiServer));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown(dnsServer: DnsProxy, apiServer: DnsLogsApi | null) {
  console.log('\nShutting down...');
  await dnsServer.stop();
  if (apiServer) {
    await apiServer.stop();
  }
  process.exit(0);
}


main().catch(console.error);
