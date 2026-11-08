export interface Registration {
  ip: string;
  mac: string;
  name: string;
  registered: boolean;
}

export type Lookup = (ip: string) => Promise<Registration | null>;

export function createRegistrationLookup(apiUrl: string, fetcher: typeof fetch = fetch, now = Date.now): Lookup {
  const cache = new Map<string, { expires: number; value: Registration | null }>();
  const pending = new Map<string, Promise<Registration | null>>();
  return async (ip) => {
    const entry = cache.get(ip);
    if (entry && entry.expires > now()) return entry.value;
    const existing = pending.get(ip);
    if (existing) return existing;
    const request = (async () => {
      const url = new URL('client-registration', apiUrl);
      url.searchParams.set('ip', ip);
      const response = await fetcher(url, { signal: AbortSignal.timeout(5000) });
      let value: Registration | null = null;
      if (response.status !== 404) {
        if (!response.ok) throw new Error(`Registration lookup HTTP ${response.status}`);
        const data = await response.json() as Registration;
        if (data.ip !== ip || typeof data.registered !== 'boolean' || typeof data.mac !== 'string' || typeof data.name !== 'string') {
          throw new Error('Invalid registration response');
        }
        value = data;
      }
      if (cache.size >= 1024) cache.clear();
      // Short negative caching allows automatic registration to become visible promptly.
      cache.set(ip, { expires: now() + 2000, value });
      return value;
    })();
    pending.set(ip, request);
    try { return await request; } finally { pending.delete(ip); }
  };
}
