import crypto from 'crypto';
import type { Logger } from 'winston';

export interface SystemInfo {
  cpuload: number;
  memtotal: number;
  memfree: number;
  memcache: number;
  membuffers: number;
  swaptotal: number;
  swapfree: number;
  uptime: number;
  model: string;
}

export interface InterfaceStat {
  name: string;
  displayName: string;
  rxbytes: number;
  txbytes: number;
  rxspeed: number;
  txspeed: number;
  rxerrors: number;
  txerrors: number;
  rxpackets: number;
  txpackets: number;
}

export interface InterfaceInfo {
  id: string;
  name: string;
  type: string;
}

export class KeeneticApi {
  private host: string;
  private cookies = '';
  private login: string;
  private password: string;
  private logger: Logger;

  constructor({ host, login, password, logger }: {
    host: string;
    login: string;
    password: string;
    logger: Logger;
  }) {
    if (!host || !login || !password) {
      throw new Error('host, login, and password are required');
    }
    this.host = host;
    this.login = login;
    this.password = password;
    this.logger = logger;
  }

  async getSystemInfo(): Promise<SystemInfo | null> {
    await this.ensureAuthenticated();
    try {
      const response = await this.getRequest('/rci/show/system');
      if (response.status === 200 && response.data) {
        return response.data as SystemInfo;
      }
      this.logger.error(`Failed to get system info. Status: ${response.status}`);
      return null;
    } catch (error) {
      this.logger.error('Error fetching system info:', error);
      return null;
    }
  }

  async getInterfaces(): Promise<InterfaceInfo[]> {
    await this.ensureAuthenticated();
    try {
      const response = await this.getRequest('/rci/show/interface');
      if (response.status === 200 && response.data) {
        const data = response.data as Record<string, { id?: string; type?: string; description?: string }>;
        return Object.values(data)
          .filter((iface) => iface.type === 'Wireguard' || iface.id === 'ISP')
          .map((iface) => ({
            id: iface.id || '',
            name: iface.description || iface.id || '',
            type: iface.type || '',
          }));
      }
      return [];
    } catch (error) {
      this.logger.error('Error fetching interfaces:', error);
      return [];
    }
  }

  async getInterfaceStats(interfaceNames: string[]): Promise<InterfaceStat[]> {
    await this.ensureAuthenticated();
    try {
      // Get interface info for display names
      const interfaces = await this.getInterfaces();
      const nameMap = new Map(interfaces.map(i => [i.id, i.name]));

      const payload = {
        show: {
          interface: {
            stat: interfaceNames.map(name => ({ name }))
          }
        }
      };

      const response = await this.postRequest('/rci/', [payload]);
      this.logger.debug(`Interface stats response: ${JSON.stringify(response.data)}`);

      if (response.status === 200 && Array.isArray(response.data)) {
        const resultData = response.data[0] as { show?: { interface?: { stat?: Record<string, unknown>[] | Record<string, unknown> } } };
        const statData = resultData.show?.interface?.stat;

        // Handle both array and object responses
        if (Array.isArray(statData)) {
          return statData.map((stat, index) => {
            const id = (stat as Record<string, unknown>).name as string || interfaceNames[index] || 'unknown';
            return {
              name: id,
              displayName: nameMap.get(id) || id,
              rxbytes: (stat as Record<string, unknown>).rxbytes as number || 0,
              txbytes: (stat as Record<string, unknown>).txbytes as number || 0,
              rxspeed: (stat as Record<string, unknown>).rxspeed as number || 0,
              txspeed: (stat as Record<string, unknown>).txspeed as number || 0,
              rxerrors: (stat as Record<string, unknown>).rxerrors as number || 0,
              txerrors: (stat as Record<string, unknown>).txerrors as number || 0,
              rxpackets: (stat as Record<string, unknown>).rxpackets as number || 0,
              txpackets: (stat as Record<string, unknown>).txpackets as number || 0,
            };
          });
        } else if (statData && typeof statData === 'object') {
          // Single interface or keyed by interface name
          const stats: InterfaceStat[] = [];
          for (const [key, value] of Object.entries(statData)) {
            if (typeof value === 'object' && value !== null) {
              const stat = value as Record<string, unknown>;
              stats.push({
                name: key,
                displayName: nameMap.get(key) || key,
                rxbytes: stat.rxbytes as number || 0,
                txbytes: stat.txbytes as number || 0,
                rxspeed: stat.rxspeed as number || 0,
                txspeed: stat.txspeed as number || 0,
                rxerrors: stat.rxerrors as number || 0,
                txerrors: stat.txerrors as number || 0,
                rxpackets: stat.rxpackets as number || 0,
                txpackets: stat.txpackets as number || 0,
              });
            }
          }
          return stats;
        }
      }
      this.logger.error(`Failed to get interface stats. Status: ${response.status}`);
      return [];
    } catch (error) {
      this.logger.error('Error fetching interface stats:', error);
      return [];
    }
  }

  private async getRequest(path: string): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
  }> {
    this.logger.debug(`Executing GET ${this.host}${path}`);
    const requestOptions: RequestInit = {
      method: 'GET',
      headers: {},
    };
    if (this.cookies) {
      (requestOptions.headers as Record<string, string>)['Cookie'] = this.cookies;
    }

    try {
      const response = await fetch(`${this.host}${path}`, requestOptions);
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
      this.logger.error(`Error during GET request to ${this.host}${path}:`, error);
      return { status: 500, headers: {}, data: { error: (error as Error).message } };
    }
  }

  private async postRequest(path: string, body: unknown): Promise<{
    status: number;
    headers: Record<string, string>;
    data: unknown;
  }> {
    this.logger.debug(`Executing POST ${this.host}${path}`);
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    };
    if (this.cookies) {
      (requestOptions.headers as Record<string, string>)['Cookie'] = this.cookies;
    }

    try {
      const response = await fetch(`${this.host}${path}`, requestOptions);
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
      this.logger.error(`Error during POST request to ${this.host}${path}:`, error);
      return { status: 500, headers: {}, data: { error: (error as Error).message } };
    }
  }

  private async performLogin(realm: string, challenge: string): Promise<boolean> {
    const md5Hash = md5(`${this.login}:${realm}:${this.password}`);
    const finalPasswordHash = sha256(`${challenge}${md5Hash}`);

    const loginPayload = {
      login: this.login,
      password: finalPasswordHash,
    };

    try {
      const response = await this.postRequest('/auth', loginPayload);

      if (response.status === 200) {
        this.logger.debug('Login successful.');
        return true;
      } else {
        this.logger.error(`Login failed. Status: ${response.status}`);
        return false;
      }
    } catch (error) {
      this.logger.error('Error during login POST request:', error);
      return false;
    }
  }

  private async ensureAuthenticated(): Promise<boolean> {
    try {
      const authCheckResponse = await this.getRequest('/auth');

      if (authCheckResponse.status === 200) {
        this.logger.debug('Session is active.');
        return true;
      }
      if (authCheckResponse.status === 401) {
        this.logger.debug('Session not active. Proceeding to login.');
        const realm = authCheckResponse.headers['x-ndm-realm'];
        const challenge = authCheckResponse.headers['x-ndm-challenge'];

        if (!realm || !challenge) {
          this.logger.error('Missing X-NDM-Realm or X-NDM-Challenge in 401 response headers');
          return false;
        }
        this.cookies = authCheckResponse.headers['set-cookie'];
        return await this.performLogin(realm, challenge);
      }
      this.logger.error(`Unexpected status code during auth check: ${authCheckResponse.status}`);
      return false;
    } catch (error) {
      this.logger.error('Error during authentication check:', error);
      return false;
    }
  }
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
