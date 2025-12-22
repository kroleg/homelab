export interface Config {
  keeneticHost: string;
  keeneticLogin: string;
  keeneticPassword: string;
  port: number;
  scrapeIntervalMs: number;
  logLevel: string;
  monitoredInterfaces: string[];
}

export const config: Config = {
  keeneticHost: process.env.KEENETIC_HOST || '',
  keeneticLogin: process.env.KEENETIC_LOGIN || '',
  keeneticPassword: process.env.KEENETIC_PASSWORD || '',
  port: parseInt(process.env.PORT || '9101', 10),
  scrapeIntervalMs: parseInt(process.env.SCRAPE_INTERVAL_MS || '10000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  monitoredInterfaces: (process.env.MONITORED_INTERFACES || 'ISP,Wireguard0').split(',').map(s => s.trim()),
};
