import type { Logger } from '../logger.ts';

export interface Device {
  name: string;
  mac: string;
  ip: string | null;
  online: boolean;
  policy: string | null;
}

export interface ClientInfo {
  name: string;
  ip: string;
  mac: string;
  online: boolean;
  policy: string | null;
}

export interface TrafficInfo {
  rx: number;
  tx: number;
  total: number;
}

export interface HourlyTraffic {
  date: string;
  hour: number;
  rx: number;
  tx: number;
}

export function createKeeneticService(apiUrl: string, logger: Logger) {
  async function fetchJson<T>(path: string): Promise<T | null> {
    try {
      const response = await fetch(`${apiUrl}${path}`);
      if (!response.ok) {
        logger.error(`Keenetic API error: ${response.status} for ${path}`);
        return null;
      }
      return await response.json() as T;
    } catch (error) {
      logger.error(`Keenetic API fetch error: ${error}`);
      return null;
    }
  }

  return {
    async getClients(): Promise<Device[]> {
      const clients = await fetchJson<Device[]>('/api/clients');
      return clients || [];
    },

    async getClientByIp(ip: string): Promise<ClientInfo | null> {
      return fetchJson<ClientInfo>(`/api/client?ip=${encodeURIComponent(ip)}`);
    },

    async getTrafficBulk(macs: string[]): Promise<Record<string, HourlyTraffic[]>> {
      if (macs.length === 0) return {};
      try {
        const response = await fetch(`${apiUrl}/api/traffic`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ macs }),
        });
        if (!response.ok) {
          logger.error(`Traffic API error: ${response.status}`);
          return {};
        }
        return await response.json() as Record<string, HourlyTraffic[]>;
      } catch (error) {
        logger.error(`Traffic API fetch error: ${error}`);
        return {};
      }
    },
  };
}

export type KeeneticService = ReturnType<typeof createKeeneticService>;
