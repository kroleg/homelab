import type { Logger } from '../logger.ts';

export interface Profile {
  id: string;
  name: string;
  isAdmin: boolean;
}

export interface Device {
  name: string;
  mac: string;
  ip: string | null;
  online: boolean;
  profile: Profile | null;
  policy: string | null;
}

export interface ClientInfo {
  name: string;
  ip: string;
  mac: string;
  online: boolean;
  profile: Profile | null;
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
    async getProfiles(): Promise<Profile[]> {
      const profiles = await fetchJson<Profile[]>('/api/profiles');
      return profiles || [];
    },

    async getChildren(): Promise<Profile[]> {
      const profiles = await this.getProfiles();
      return profiles.filter(p => !p.isAdmin);
    },

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
