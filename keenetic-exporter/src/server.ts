import express from 'express';
import type { Request, Response } from 'express';
import { config } from './config.ts';
import { createLogger } from './logger.ts';
import { KeeneticApi } from './keenetic-api.ts';
import {
  register,
  cpuLoadGauge,
  memoryTotalGauge,
  memoryFreeGauge,
  memoryUsedGauge,
  uptimeGauge,
  interfaceRxBytesGauge,
  interfaceTxBytesGauge,
  interfaceRxSpeedGauge,
  interfaceTxSpeedGauge,
  interfaceRxErrorsGauge,
  interfaceTxErrorsGauge,
  interfaceRxPacketsGauge,
  interfaceTxPacketsGauge,
  scrapeSuccessGauge,
  scrapeDurationGauge,
} from './metrics.ts';

const logger = createLogger(config.logLevel);

// Validate config
if (!config.keeneticHost || !config.keeneticLogin || !config.keeneticPassword) {
  logger.error('Missing required environment variables: KEENETIC_HOST, KEENETIC_LOGIN, KEENETIC_PASSWORD');
  process.exit(1);
}

const keeneticApi = new KeeneticApi({
  host: config.keeneticHost,
  login: config.keeneticLogin,
  password: config.keeneticPassword,
  logger,
});

async function collectMetrics(): Promise<void> {
  const startTime = Date.now();
  let success = true;

  try {
    // Collect system info
    const systemInfo = await keeneticApi.getSystemInfo();
    if (systemInfo) {
      cpuLoadGauge.set(Number(systemInfo.cpuload));
      // Keenetic reports memory in KB, convert to bytes
      memoryTotalGauge.set(Number(systemInfo.memtotal) * 1024);
      memoryFreeGauge.set(Number(systemInfo.memfree) * 1024);
      const memUsed = Number(systemInfo.memtotal) - Number(systemInfo.memfree) - Number(systemInfo.memcache) - Number(systemInfo.membuffers);
      memoryUsedGauge.set(memUsed * 1024);
      uptimeGauge.set(Number(systemInfo.uptime));
      logger.debug(`System info collected: CPU ${systemInfo.cpuload}%, Memory ${Math.round(memUsed / Number(systemInfo.memtotal) * 100)}% used`);
    } else {
      success = false;
      logger.warn('Failed to collect system info');
    }

    // Collect interface stats
    const interfaceStats = await keeneticApi.getInterfaceStats(config.monitoredInterfaces);
    for (const stat of interfaceStats) {
      const labels = { interface: stat.name };
      interfaceRxBytesGauge.set(labels, Number(stat.rxbytes) || 0);
      interfaceTxBytesGauge.set(labels, Number(stat.txbytes) || 0);
      interfaceRxSpeedGauge.set(labels, Number(stat.rxspeed) || 0);
      interfaceTxSpeedGauge.set(labels, Number(stat.txspeed) || 0);
      interfaceRxErrorsGauge.set(labels, Number(stat.rxerrors) || 0);
      interfaceTxErrorsGauge.set(labels, Number(stat.txerrors) || 0);
      interfaceRxPacketsGauge.set(labels, Number(stat.rxpackets) || 0);
      interfaceTxPacketsGauge.set(labels, Number(stat.txpackets) || 0);
      logger.debug(`Interface ${stat.name}: RX ${stat.rxspeed} bps, TX ${stat.txspeed} bps`);
    }

    if (interfaceStats.length === 0 && config.monitoredInterfaces.length > 0) {
      logger.warn(`No interface stats returned for: ${config.monitoredInterfaces.join(', ')}`);
    }
  } catch (error) {
    logger.error('Error collecting metrics:', error);
    success = false;
  }

  const duration = (Date.now() - startTime) / 1000;
  scrapeSuccessGauge.set(success ? 1 : 0);
  scrapeDurationGauge.set(duration);
  logger.info(`Metrics collected in ${duration.toFixed(2)}s, success: ${success}`);
}

// Start periodic collection
setInterval(collectMetrics, config.scrapeIntervalMs);

// Initial collection
collectMetrics();

// Express server for /metrics endpoint
const app = express();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

app.listen(config.port, () => {
  logger.info(`Keenetic Exporter listening on port ${config.port}`);
  logger.info(`Monitoring interfaces: ${config.monitoredInterfaces.join(', ')}`);
  logger.info(`Scrape interval: ${config.scrapeIntervalMs}ms`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
