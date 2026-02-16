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
  };
}

export type KeeneticService = ReturnType<typeof createKeeneticService>;
