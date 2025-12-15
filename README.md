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
- **Glance** - Homepage dashboard

## Quick Start

```bash
cp .env.example .env
# Edit .env with your Keenetic credentials

docker compose up -d
```

## Internal Domains

- `admin.internal` - Admin dashboard
- `vpn-toggle.internal` - VPN toggle UI
- `home.internal` - Glance dashboard
- `grafana.internal` - Grafana
