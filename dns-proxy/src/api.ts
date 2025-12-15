import express, { type Request, type Response, type NextFunction } from 'express';
import type { Logger } from 'winston';
import { register, getRecentRequests, getStats, getUniqueHostnames, getUniqueClients, type DnsRequest } from './metrics.js';

// Parse time delta strings like "7d", "1w", "24h", "30m"
function parseDelta(delta: string): Date | null {
  const match = delta.match(/^(\d+)([mhdw])$/);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case 'm': // minutes
      now.setMinutes(now.getMinutes() - value);
      break;
    case 'h': // hours
      now.setHours(now.getHours() - value);
      break;
    case 'd': // days
      now.setDate(now.getDate() - value);
      break;
    case 'w': // weeks
      now.setDate(now.getDate() - value * 7);
      break;
    default:
      return null;
  }

  return now;
}

// Convert internal DnsRequest to API format (snake_case)
function toApiFormat(req: DnsRequest) {
  return {
    id: req.id,
    client_ip: req.clientIp,
    hostname: req.hostname,
    query_type: req.queryType,
    status: req.status,
    resolved_ips: req.resolvedIps,
    error_message: req.errorMessage,
    response_time_ms: req.responseTimeMs,
    created_at: req.createdAt.toISOString()
  };
}

export class DnsLogsApi {
  private app: express.Application;
  private logger: Logger;
  private server: any;

  constructor(logger: Logger) {
    this.logger = logger;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req: Request, res: Response) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        this.logger.error('Error generating metrics:', error);
        res.status(500).json({ error: 'Failed to generate metrics' });
      }
    });

    // Get DNS requests with pagination (last 1000 in memory)
    this.app.get('/dns-requests', async (req: Request, res: Response) => {
      try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
        const offset = (page - 1) * limit;
        const status = req.query.status as string;

        const { data, total } = getRecentRequests({
          status: status && ['resolved', 'failed', 'blocked'].includes(status) ? status : undefined,
          limit,
          offset
        });

        res.json({
          data: data.map(toApiFormat),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      } catch (error) {
        this.logger.error('Error fetching DNS requests:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get DNS requests by client IP
    this.app.get('/dns-requests/client/:ip', async (req: Request, res: Response) => {
      try {
        const { ip } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
        const offset = (page - 1) * limit;

        const { data, total } = getRecentRequests({ clientIp: ip, limit, offset });

        res.json({
          data: data.map(toApiFormat),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      } catch (error) {
        this.logger.error('Error fetching DNS requests by client IP:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get DNS requests by hostname
    this.app.get('/dns-requests/hostname/:hostname', async (req: Request, res: Response) => {
      try {
        const { hostname } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
        const offset = (page - 1) * limit;

        const { data, total } = getRecentRequests({ hostname, limit, offset });

        res.json({
          data: data.map(toApiFormat),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      } catch (error) {
        this.logger.error('Error fetching DNS requests by hostname:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get request statistics (from last 1000 requests)
    this.app.get('/dns-requests/stats', async (req: Request, res: Response) => {
      try {
        const stats = getStats();

        res.json({
          total_requests: stats.total,
          resolved_count: stats.resolved,
          failed_count: stats.failed,
          blocked_count: stats.blocked,
          avg_response_time: stats.avgResponseTimeMs,
          topHostnames: stats.topHostnames.map(h => ({ hostname: h.hostname, request_count: h.count })),
          topClients: stats.topClients.map(c => ({ client_ip: c.clientIp, request_count: c.count })),
          recentErrors: stats.recentErrors.map(e => ({
            hostname: e.hostname,
            error_message: e.errorMessage,
            created_at: e.createdAt.toISOString()
          })),
        });
      } catch (error) {
        this.logger.error('Error fetching DNS request statistics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get unique hostnames
    this.app.get('/dns-requests/unique/hostnames', async (req: Request, res: Response) => {
      try {
        const hostnames = getUniqueHostnames();
        res.json({ hostnames });
      } catch (error) {
        this.logger.error('Error fetching unique hostnames:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get unique client IPs
    this.app.get('/dns-requests/unique/clients', async (req: Request, res: Response) => {
      try {
        const clients = getUniqueClients();
        res.json({ clients });
      } catch (error) {
        this.logger.error('Error fetching unique clients:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Search DNS requests
    this.app.get('/dns-requests/search', async (req: Request, res: Response) => {
      try {
        const query = req.query.q as string;
        if (!query) {
          return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
        const offset = (page - 1) * limit;

        const { data, total } = getRecentRequests({ hostname: query, limit, offset });

        res.json({
          data: data.map(toApiFormat),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
      } catch (error) {
        this.logger.error('Error searching DNS requests:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  public start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        this.logger.info(`DNS Metrics API listening on port ${port}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          this.logger.info('DNS Metrics API stopped');
          resolve();
        });
      });
    }
  }
}
