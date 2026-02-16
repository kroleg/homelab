import crypto from 'crypto';
import type { Logger } from '../logger.ts';

export interface ClientInfo {
  name: string;
  ip: string | null;
  mac: string;
  online: boolean;
  policy: string | null;
}

export function createKeeneticService(config: {
  host: string;
  login: string;
  password: string;
  logger: Logger;
}) {
  const { host, login, password, logger } = config;
  let cookies = '';

  async function getRequest(path: string): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
  }> {
    logger.debug(`GET ${host}${path}`);
    const requestOptions: RequestInit = {
      method: 'GET',
      headers: {},
    };
    if (cookies) {
      (requestOptions.headers as Record<string, string>)['Cookie'] = cookies;
    }

    try {
      const response = await fetch(`${host}${path}`, requestOptions);
      const responseHeaders = getHeadersFromFetchResponse(response.headers);
      let responseData;
      try {
        const text = await response.text();
        if (text) {
          responseData = JSON.parse(text);
        }
      } catch {
        responseData = null;
      }

      return {
        status: response.status,
        headers: responseHeaders,
        data: responseData,
      };
    } catch (error) {
      logger.error(`Error during GET request to ${host}${path}:`, error);
      return { status: 500, headers: {}, data: { error: (error as Error).message } };
    }
  }

  async function postRequest(path: string, body: unknown): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
  }> {
    logger.debug(`POST ${host}${path}`);
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    };
    if (cookies) {
      (requestOptions.headers as Record<string, string>)['Cookie'] = cookies;
    }

    try {
      const response = await fetch(`${host}${path}`, requestOptions);
      const responseHeaders = getHeadersFromFetchResponse(response.headers);
      let responseData;
      try {
        const text = await response.text();
        if (text) {
          responseData = JSON.parse(text);
        }
      } catch {
        responseData = null;
      }

      return {
        status: response.status,
        headers: responseHeaders,
        data: responseData,
      };
    } catch (error) {
      logger.error(`Error during POST request to ${host}${path}:`, error);
      return { status: 500, headers: {}, data: { error: (error as Error).message } };
    }
  }

  async function performLogin(realm: string, challenge: string): Promise<boolean> {
    const md5Hash = md5(`${login}:${realm}:${password}`);
    const finalPasswordHash = sha256(`${challenge}${md5Hash}`);

    const loginPayload = {
      login,
      password: finalPasswordHash,
    };

    try {
      const response = await postRequest('/auth', loginPayload);
      if (response.status === 200) {
        logger.debug('Login successful');
        return true;
      }
      logger.error(`Login failed. Status: ${response.status}`);
      return false;
    } catch (error) {
      logger.error('Error during login:', error);
      return false;
    }
  }

  async function ensureAuthenticated(): Promise<boolean> {
    try {
      const authCheckResponse = await getRequest('/auth');

      if (authCheckResponse.status === 200) {
        logger.debug('Session is active');
        return true;
      }
      if (authCheckResponse.status === 401) {
        logger.debug('Session not active, logging in');
        const realm = authCheckResponse.headers['x-ndm-realm'];
        const challenge = authCheckResponse.headers['x-ndm-challenge'];

        if (!realm || !challenge) {
          logger.error('Missing X-NDM-Realm or X-NDM-Challenge in 401 response');
          return false;
        }
        cookies = authCheckResponse.headers['set-cookie'];
        return await performLogin(realm, challenge);
      }
      logger.error(`Unexpected status during auth check: ${authCheckResponse.status}`);
      return false;
    } catch (error) {
      logger.error('Error during authentication check:', error);
      return false;
    }
  }

  async function getWithAuth(path: string) {
    await ensureAuthenticated();
    return getRequest(path);
  }

  return {
    async getClientByIp(ip: string): Promise<ClientInfo | null> {
      try {
        const response = await getWithAuth('/rci/show/ip/hotspot/host');
        if (response.status === 200 && Array.isArray(response.data)) {
          const client = response.data.find((c: { ip: string }) => c.ip === ip);
          if (client) {
            return {
              name: client.name || 'Unknown',
              ip: client.ip || null,
              mac: client.mac || '',
              online: client.active === true,
              policy: null,
            };
          }
        }
        logger.debug(`Client not found for IP: ${ip}`);
        return null;
      } catch (error) {
        logger.error('Error fetching client by IP:', error);
        return null;
      }
    },

    async getClients(): Promise<ClientInfo[]> {
      try {
        // Fetch all data in parallel
        const [response, policyResponse, policyNamesResponse] = await Promise.all([
          getWithAuth('/rci/show/ip/hotspot'),
          getWithAuth('/rci/show/rc/ip/hotspot/host'),
          getWithAuth('/rci/show/rc/ip/policy'),
        ]);

        if (response.status !== 200 || !response.data) {
          logger.error(`Failed to get clients. Status: ${response.status}`);
          return [];
        }

        // Build policy assignment map (returns object, not array)
        const policyMap = new Map<string, string>();
        if (policyResponse.status !== 200) {
          logger.error(`Failed to fetch policy assignments: ${policyResponse.status}`);
        } else if (policyResponse.data && typeof policyResponse.data === 'object') {
          for (const host of Object.values(policyResponse.data as Record<string, { mac?: string; policy?: string }>)) {
            if (host.mac && host.policy) {
              policyMap.set(host.mac.toLowerCase(), host.policy);
            }
          }
        }

        // Build policy names map for human-readable display
        const policyNames = new Map<string, string>();
        if (policyNamesResponse.status !== 200) {
          logger.error(`Failed to fetch policy names: ${policyNamesResponse.status}`);
        } else if (policyNamesResponse.data && typeof policyNamesResponse.data === 'object') {
          for (const [id, policy] of Object.entries(policyNamesResponse.data as Record<string, { description?: string }>)) {
            // Keenetic prefixes policy descriptions with "!" - strip it for display
            const name = policy.description?.replace(/^!/, '') || id;
            policyNames.set(id, name);
          }
        }

        const data = response.data as { host?: Array<{ name?: string; ip?: string; mac?: string; active?: boolean; registered?: boolean }> };
        const hosts = data.host || [];
        return hosts
          .filter(client => client.registered)
          .map(client => {
            const mac = client.mac || '';
            const policyId = mac ? policyMap.get(mac.toLowerCase()) : undefined;
            return {
              name: client.name || 'Unknown',
              ip: client.ip && client.ip !== '0.0.0.0' ? client.ip : null,
              mac,
              online: client.active === true,
              policy: policyId ? (policyNames.get(policyId) || policyId) : null,
            };
          });
      } catch (error) {
        logger.error('Error fetching clients:', error);
        return [];
      }
    },

    async getPolicies(): Promise<{ id: string; name: string }[]> {
      try {
        const response = await getWithAuth('/rci/show/rc/ip/policy');
        if (response.status === 200 && response.data && typeof response.data === 'object') {
          return Object.entries(response.data as Record<string, { description?: string }>).map(([id, policy]) => ({
            id,
            name: policy.description?.replace(/^!/, '') || id,
          }));
        }
        logger.error(`Failed to get policies. Status: ${response.status}`);
        return [];
      } catch (error) {
        logger.error('Error fetching policies:', error);
        return [];
      }
    },

    async setClientPolicy(mac: string, policyId: string | null): Promise<boolean> {
      try {
        await ensureAuthenticated();
        const payload = policyId
          ? [
              { ip: { hotspot: { host: { mac, permit: true, policy: policyId } } } },
              { system: { configuration: { save: {} } } }
            ]
          : [
              { ip: { hotspot: { host: { mac, permit: true, policy: { no: true } } } } },
              { system: { configuration: { save: {} } } }
            ];

        const response = await postRequest('/rci/', payload);
        if (response.status === 200) {
          logger.info(`Policy ${policyId || 'removed'} set for MAC: ${mac}`);
          return true;
        }
        logger.error(`Failed to set policy. Status: ${response.status}`);
        return false;
      } catch (error) {
        logger.error('Error setting client policy:', error);
        return false;
      }
    },
  };
}

function md5(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getHeadersFromFetchResponse(responseHeaders: Headers): Record<string, string> {
  const headers: Record<string, string> = {};
  responseHeaders.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

export type KeeneticService = ReturnType<typeof createKeeneticService>;
