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

| Service | Domain | Description |
|---------|--------|-------------|
| [calendar](./calendar/) | calendar.internal | Family calendar display |
| [claude-chat](./claude-chat/) | chat.internal | Claude AI chat interface |
| [devices](./devices/) | devices.internal | User and device management |
| [dns-proxy](./dns-proxy/) | - | DNS server with logging and ad blocking |
| [family-dashboard](./family-dashboard/) | dom.internal | Family dashboard with quick links |
| [grafana](./grafana/) | grafana.internal | Metrics dashboards |
| [jellyfin](./jellyfin/) | media.internal | Media server |
| [main](./main/) | admin.internal | DNS/VPN routing admin |
| [page-watcher](./page-watcher/) | page-watcher.internal | Web page change notifications |
| [qbittorrent](./qbittorrent/) | torrent.internal | Torrent client |
| [scrutiny](./scrutiny/) | disk-monitor.internal | HDD/SSD health monitoring |
| [telegram-bot](./telegram-bot/) | telegram-bot.internal | Telegram bot and notifications |
| [torrent-ui](./torrent-ui/) | dl.internal | Torrent upload UI |
| [vpn-toggle](./vpn-toggle/) | vpn.internal | Self-service VPN toggle |

### Infrastructure

| Service | Description |
|---------|-------------|
| [traefik](./traefik/) | Reverse proxy for internal domains |
| [prometheus](./prometheus/) | Metrics collection |
| [keenetic-api](./keenetic-api/) | Keenetic router REST API |
| [keenetic-exporter](./keenetic-exporter/) | Prometheus exporter for router metrics |
| postgres | Data persistence (2 instances) |

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

## Host Setup

- [Grafana/Power monitoring](grafana/SETUP.md)
# test
