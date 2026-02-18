# Homelab

DNS-based VPN routing system for Keenetic routers. Automatically routes traffic for specific domains through VPN interfaces based on DNS resolution.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  dns-proxy  │────▶│    main     │────▶│   Keenetic  │
│   (DNS)     │     │  (routing)  │     │   Router    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  vpn-toggle │
                    │    (UI)     │
                    └─────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| [main](./main/) | 3000 | Core routing engine and admin dashboard |
| [dns-proxy](./dns-proxy/) | 53, 3001 | DNS server with logging and ad blocking |
| [vpn-toggle](./vpn-toggle/) | 3002 | Self-service VPN toggle for users |

## Supporting Infrastructure

- **Traefik** - Reverse proxy for internal domains
- **PostgreSQL** - Data persistence (2 instances)
- **Prometheus** - Metrics collection
- **Grafana** - Monitoring dashboards

## Quick Start

```bash
cp .env.example .env
# Edit .env with your Keenetic credentials

docker compose up -d
```

## Development

### Node.js

Node.js is installed manually at `~/opt/node-current` (symlink to versioned directory).

To upgrade Node.js:

```bash
cd ~/opt
curl -O https://nodejs.org/dist/latest-v24.x/node-v24.x.x-linux-x64.tar.xz
tar -xf node-v24.x.x-linux-x64.tar.xz
rm node-current
ln -s node-v24.x.x-linux-x64 node-current
```

Replace `v24.x.x` with the actual version number.

## Internal Domains

- `admin.internal` - Admin dashboard
- `vpn-toggle.internal` - VPN toggle UI
- `grafana.internal` - Grafana

## Host Setup

- [Grafana/Power monitoring](grafana/SETUP.md)
