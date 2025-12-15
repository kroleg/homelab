import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Collect default Node.js metrics (memory, CPU, etc.)
collectDefaultMetrics({ register });

// DNS requests counter
export const dnsRequestsTotal = new Counter({
  name: 'dns_requests_total',
  help: 'Total number of DNS requests',
  labelNames: ['status'] as const,
  registers: [register]
});

// DNS requests by domain (2nd-level domain only to limit cardinality)
export const dnsRequestsByDomain = new Counter({
  name: 'dns_requests_by_domain_total',
  help: 'Total DNS requests by 2nd-level domain',
  labelNames: ['domain', 'status'] as const,
  registers: [register]
});

// Extract 2nd-level domain (e.g., api.example.com -> example.com)
function getBaseDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname.toLowerCase();
  // Handle common multi-part TLDs
  const lastTwo = parts.slice(-2).join('.');
  const knownMultiPartTlds = ['co.uk', 'com.au', 'co.nz', 'com.br', 'co.jp', 'com.cn'];
  if (knownMultiPartTlds.includes(lastTwo) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

// DNS request duration histogram
export const dnsRequestDuration = new Histogram({
  name: 'dns_request_duration_seconds',
  help: 'DNS request duration in seconds',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

// In-memory storage for recent DNS requests (last 1000)
export interface DnsRequest {
  id: number;
  clientIp: string;
  hostname: string;
  queryType: string;
  status: 'resolved' | 'failed' | 'blocked';
  resolvedIps?: string[];
  errorMessage?: string;
  responseTimeMs: number;
  createdAt: Date;
}

export interface FilterOptions {
  status?: string;
  clientIp?: string;
  hostname?: string;
  limit?: number;
  offset?: number;
}

const MAX_REQUESTS = 1000;
const recentRequests: DnsRequest[] = [];
let nextId = 1;

// Record request (metrics + in-memory storage)
export function recordRequest(req: Omit<DnsRequest, 'id' | 'createdAt'>): void {
  const request: DnsRequest = {
    ...req,
    id: nextId++,
    createdAt: new Date()
  };

  // Add to beginning of array (most recent first)
  recentRequests.unshift(request);

  // Trim to max size
  if (recentRequests.length > MAX_REQUESTS) {
    recentRequests.length = MAX_REQUESTS;
  }

  // Update Prometheus metrics
  dnsRequestsTotal.inc({ status: req.status });
  dnsRequestsByDomain.inc({ domain: getBaseDomain(req.hostname), status: req.status });
  dnsRequestDuration.observe(req.responseTimeMs / 1000);
}

export function getRecentRequests(opts: FilterOptions = {}): { data: DnsRequest[]; total: number } {
  let filtered = [...recentRequests];

  // Apply filters
  if (opts.status) {
    filtered = filtered.filter(r => r.status === opts.status);
  }
  if (opts.clientIp) {
    filtered = filtered.filter(r => r.clientIp === opts.clientIp);
  }
  if (opts.hostname) {
    filtered = filtered.filter(r => r.hostname.includes(opts.hostname!));
  }

  const total = filtered.length;

  // Apply pagination
  const offset = opts.offset || 0;
  const limit = opts.limit || 50;
  filtered = filtered.slice(offset, offset + limit);

  return { data: filtered, total };
}

export interface Stats {
  total: number;
  resolved: number;
  failed: number;
  blocked: number;
  avgResponseTimeMs: number;
  topHostnames: { hostname: string; count: number }[];
  topClients: { clientIp: string; count: number }[];
  recentErrors: { hostname: string; errorMessage: string; createdAt: Date }[];
}

export function getStats(): Stats {
  const resolved = recentRequests.filter(r => r.status === 'resolved').length;
  const failed = recentRequests.filter(r => r.status === 'failed').length;
  const blocked = recentRequests.filter(r => r.status === 'blocked').length;

  // Calculate average response time
  const responseTimes = recentRequests.map(r => r.responseTimeMs);
  const avgResponseTimeMs = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;

  // Top hostnames
  const hostnameCount = new Map<string, number>();
  for (const r of recentRequests) {
    hostnameCount.set(r.hostname, (hostnameCount.get(r.hostname) || 0) + 1);
  }
  const topHostnames = [...hostnameCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([hostname, count]) => ({ hostname, count }));

  // Top clients
  const clientCount = new Map<string, number>();
  for (const r of recentRequests) {
    clientCount.set(r.clientIp, (clientCount.get(r.clientIp) || 0) + 1);
  }
  const topClients = [...clientCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([clientIp, count]) => ({ clientIp, count }));

  // Recent errors
  const recentErrors = recentRequests
    .filter(r => r.status === 'failed' && r.errorMessage)
    .slice(0, 10)
    .map(r => ({
      hostname: r.hostname,
      errorMessage: r.errorMessage!,
      createdAt: r.createdAt
    }));

  return {
    total: recentRequests.length,
    resolved,
    failed,
    blocked,
    avgResponseTimeMs,
    topHostnames,
    topClients,
    recentErrors
  };
}

export function getUniqueHostnames(): string[] {
  return [...new Set(recentRequests.map(r => r.hostname))];
}

export function getUniqueClients(): string[] {
  return [...new Set(recentRequests.map(r => r.clientIp))];
}
