import type { Logger } from '../logger.ts';

export interface DnsDomainListInfo {
  id: string;
  description: string;
  addresses: string[];
}

export interface DnsRouteInfo {
  index: string;
  group: string;
  interface: string;
  auto: boolean;
  comment: string;
  enabled: boolean;
}

export interface InterfaceInfo {
  id: string;
  name: string;
  type: string;
  connected: boolean;
}

export function createKeeneticClient(apiUrl: string, logger: Logger) {
  async function request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${apiUrl}${path}`;
    logger.debug(`${method} ${url}`);

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Keenetic API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    async getDnsDomainLists(): Promise<DnsDomainListInfo[]> {
      return request<DnsDomainListInfo[]>('GET', '/dns-domain-lists');
    },

    async getDnsRoutes(): Promise<DnsRouteInfo[]> {
      return request<DnsRouteInfo[]>('GET', '/dns-routes');
    },

    async getInterfaces(types?: string[]): Promise<InterfaceInfo[]> {
      const query = types ? `?types=${types.join(',')}` : '';
      return request<InterfaceInfo[]>('GET', `/interfaces${query}`);
    },

    async createRule(params: { name: string; addresses: string[]; interface: string; enabled: boolean }): Promise<{ success: boolean; id: string }> {
      return request('POST', '/dns-rules', params);
    },

    async updateRule(listId: string, params: { name: string; addresses: string[]; interface: string; enabled: boolean }): Promise<{ success: boolean }> {
      return request('PUT', `/dns-rules/${encodeURIComponent(listId)}`, params);
    },

    async deleteRule(listId: string): Promise<{ success: boolean }> {
      return request('DELETE', `/dns-rules/${encodeURIComponent(listId)}`);
    },
  };
}

export type KeeneticClient = ReturnType<typeof createKeeneticClient>;
