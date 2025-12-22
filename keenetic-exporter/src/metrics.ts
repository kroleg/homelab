import { Gauge, Registry, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register });

// System metrics
export const cpuLoadGauge = new Gauge({
  name: 'keenetic_cpu_load_percent',
  help: 'Keenetic router CPU load percentage',
  registers: [register]
});

export const memoryTotalGauge = new Gauge({
  name: 'keenetic_memory_total_bytes',
  help: 'Keenetic router total memory in bytes',
  registers: [register]
});

export const memoryFreeGauge = new Gauge({
  name: 'keenetic_memory_free_bytes',
  help: 'Keenetic router free memory in bytes',
  registers: [register]
});

export const memoryUsedGauge = new Gauge({
  name: 'keenetic_memory_used_bytes',
  help: 'Keenetic router used memory in bytes',
  registers: [register]
});

export const uptimeGauge = new Gauge({
  name: 'keenetic_uptime_seconds',
  help: 'Keenetic router uptime in seconds',
  registers: [register]
});

// Interface metrics (labeled by interface name)
export const interfaceRxBytesGauge = new Gauge({
  name: 'keenetic_interface_rx_bytes_total',
  help: 'Total received bytes on interface',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceTxBytesGauge = new Gauge({
  name: 'keenetic_interface_tx_bytes_total',
  help: 'Total transmitted bytes on interface',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceRxSpeedGauge = new Gauge({
  name: 'keenetic_interface_rx_speed_bps',
  help: 'Current receive speed in bits per second',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceTxSpeedGauge = new Gauge({
  name: 'keenetic_interface_tx_speed_bps',
  help: 'Current transmit speed in bits per second',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceRxErrorsGauge = new Gauge({
  name: 'keenetic_interface_rx_errors_total',
  help: 'Total receive errors on interface',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceTxErrorsGauge = new Gauge({
  name: 'keenetic_interface_tx_errors_total',
  help: 'Total transmit errors on interface',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceRxPacketsGauge = new Gauge({
  name: 'keenetic_interface_rx_packets_total',
  help: 'Total received packets on interface',
  labelNames: ['interface'] as const,
  registers: [register]
});

export const interfaceTxPacketsGauge = new Gauge({
  name: 'keenetic_interface_tx_packets_total',
  help: 'Total transmitted packets on interface',
  labelNames: ['interface'] as const,
  registers: [register]
});

// Scrape status
export const scrapeSuccessGauge = new Gauge({
  name: 'keenetic_scrape_success',
  help: '1 if last scrape was successful, 0 otherwise',
  registers: [register]
});

export const scrapeDurationGauge = new Gauge({
  name: 'keenetic_scrape_duration_seconds',
  help: 'Duration of last scrape in seconds',
  registers: [register]
});
