import type { Logger } from 'winston';

export interface RouteInfo {
  network?: string;
  mask?: string;
  host?: string;
  interface: string;
  comment: string;
  gateway?: string;
  metric?: number;
  auto?: boolean;
}

export interface InterfaceInfo {
  id: string;
  name: string;
  type: string;
  connected: boolean;
}

export interface ClientInfo {
  name: string;
  ip: string;
  mac: string;
  policy?: string;
  registered?: boolean;
}

export interface PolicyInfo {
  id: string;
  name: string;
  description?: string;
}

export function createKeeneticClient(apiUrl: string, logger: Logger) {
  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE',
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
    async getRoutes(): Promise<RouteInfo[]> {
      return request<RouteInfo[]>('GET', '/api/routes');
    },

    async addStaticRoutesForService(params: {
      ips: string[];
      interfaces: string[];
      comment: string;
      network?: string;
      mask?: string;
    }): Promise<string[]> {
      const { ips, interfaces, comment, network, mask } = params;

      const result = await request<{ success: boolean; messages: string[] }>('POST', '/api/routes', {
        hosts: ips.length > 0 ? ips : undefined,
        network,
        mask,
        interfaces,
        comment,
      });

      return result.messages;
    },

    async removeRoutesByCommentPrefix(commentPrefix: string): Promise<boolean> {
      const result = await request<{ success: boolean; removedCount: number }>('DELETE', '/api/routes', {
        commentPrefix,
      });
      return result.success;
    },

    async getInterfaces(types?: string[]): Promise<InterfaceInfo[]> {
      const query = types ? `?types=${types.join(',')}` : '';
      return request<InterfaceInfo[]>('GET', `/api/interfaces${query}`);
    },

    async getClients(): Promise<ClientInfo[]> {
      return request<ClientInfo[]>('GET', '/api/clients');
    },

    async getClientByIp(ip: string): Promise<ClientInfo | null> {
      try {
        return await request<ClientInfo>('GET', `/api/client?ip=${encodeURIComponent(ip)}`);
      } catch (error) {
        if ((error as Error).message.includes('404')) {
          return null;
        }
        throw error;
      }
    },

    async getConnectionPolicies(): Promise<PolicyInfo[]> {
      return request<PolicyInfo[]>('GET', '/api/policies');
    },

    async setClientPolicy(mac: string, policyId: string | null): Promise<boolean> {
      const result = await request<{ success: boolean }>('POST', `/api/clients/${encodeURIComponent(mac)}/policy`, {
        policyId,
      });
      return result.success;
    },
  };
}

export type KeeneticClient = ReturnType<typeof createKeeneticClient>;
