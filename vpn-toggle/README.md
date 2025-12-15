# VPN Toggle

Self-service web UI for users to toggle their device's VPN routing policy.

## Features

- **Auto Device Detection** - Identifies client by IP address
- **Policy Selection** - Toggle between available VPN policies
- **Proxy Support** - Handles X-Forwarded-For for proxied connections
- **IPv6 Support** - Normalizes IPv6-mapped IPv4 addresses

## Port

| Port | Protocol | Description |
|------|----------|-------------|
| 3002 | HTTP | Web UI |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIN_API_URL` | `http://main:3000` | Main service API endpoint |
| `PORT` | `3002` | HTTP server port |

## How It Works

1. User visits `vpn-toggle.internal`
2. Service detects client IP from request
3. Fetches device info and available policies from main API
4. Displays current policy and toggle options
5. User selects desired policy
6. Service updates policy via main API

## API Dependencies

Requires main service endpoints:
- `GET /api/device-info?ip=<ip>` - Get device info
- `POST /api/device-policy` - Update policy

## Development

```bash
pnpm install
pnpm dev
```

## Build

```bash
docker build -t homelab-vpn-toggle .
```
