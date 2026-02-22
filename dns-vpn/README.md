# DNS VPN Service

Core routing engine that watches DNS resolutions and manages static routes on Keenetic router.

## Features

- **DNS Log Watching** - Monitors dns-proxy log file for domain resolutions
- **Domain Matching** - Wildcard (`*.example.com`) and suffix (`.example.com`) pattern support
- **Route Management** - Adds/removes static routes via Keenetic API
- **Route Optimization** - Combines /32 host routes into network blocks (e.g., /24)
- **Admin Dashboard** - Web UI for managing services and devices
- **Per-Device Policies** - Enable/disable VPN routing per device

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KEENETIC_HOST` | `http://192.168.1.1` | Router address |
| `KEENETIC_LOGIN` | `admin` | Router login |
| `KEENETIC_PASSWORD` | - | Router password |
| `WATCH_FILE` | `/logs/dns-proxy.log` | DNS log file to monitor |
| `ROUTE_OPTIMIZATION_INTERVAL` | `300000` | Optimization interval (ms) |
| `DATABASE_URL` | - | PostgreSQL connection string |

## API Endpoints

### Admin UI
- `GET /` - Dashboard home
- `GET /devices` - Device management
- `GET /services` - Service configuration
- `GET /logs` - DNS request logs
- `GET /check` - Domain matching tester

### REST API
- `GET /api/device-info?ip=<ip>` - Get device info by IP
- `POST /api/device-policy` - Update device VPN policy

## Database Schema

```sql
CREATE TABLE services (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  interfaces JSONB NOT NULL,        -- VPN interface IDs
  matching_domains JSONB NOT NULL,  -- Domain patterns
  optimize_routes BOOLEAN DEFAULT true,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Route Comment Format

Routes are tagged for identification:
```
dns-auto:{serviceName}:{hostname}
```

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
docker build -t homelab-dns-vpn .
```
