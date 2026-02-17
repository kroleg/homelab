# ADR-002: Tailscale for Remote Access

## Status
Accepted

## Date
2026-02-17

## Context

Need to access homelab services (`*.internal` domains) when not on the home WiFi network.

### Requirements
- Access all `*.internal` services remotely
- Maintain user/device identification for admin access
- Minimal changes to existing infrastructure

### Options Considered

1. **Port forwarding + public DNS** - Exposes services to internet, security risk
2. **WireGuard on router** - Keenetic supports it but complex setup
3. **Tailscale** - Zero-config VPN with subnet routing

## Decision

Install Tailscale on the homelab host (not Docker) with subnet routing.

### Why Host Installation (not Docker)

Tailscale needs to:
1. Create a `tailscale0` network interface for the VPN tunnel
2. Act as a subnet router for 192.168.1.0/24
3. Route traffic between Tailscale network and local LAN

Running in Docker would require `--privileged` mode and `--net=host` anyway, negating container isolation benefits. Host installation is simpler and officially recommended for subnet routers.

### Installation

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=192.168.1.0/24 --accept-dns=false
```

- `--advertise-routes=192.168.1.0/24`: Makes homelab a subnet router for the local network
- `--accept-dns=false`: Don't override host DNS (we use our own dns-proxy)

### DNS Configuration

Tailscale DNS settings (via admin console):
- Add nameserver: homelab's Tailscale IP (e.g., 100.87.52.46)
- Restrict to domain: `internal`
- Disable MagicDNS (conflicts with custom DNS)

This routes `*.internal` queries to homelab's dns-proxy, which resolves them to 192.168.1.x addresses.

## Consequences

### Traefik: Host Network Mode

**Problem**: With Traefik in Docker bridge mode, all requests appeared from Docker gateway IP (192.168.80.1), not the real client IP. Services couldn't identify Tailscale users.

**Solution**: Changed Traefik to `network_mode: host`:

```yaml
traefik:
  network_mode: host
  # removed: ports, networks
```

**Side effect**: Traefik now binds directly to host ports 80/443. Backend services must be referenced by `127.0.0.1:port` instead of container names in `traefik/dynamic.yml`.

### Device Identification

**Problem**: Tailscale IPs (100.64.0.0/10) are unknown to Keenetic router. Services using Keenetic for IP→MAC→user lookup fail for Tailscale users.

**Solution**: Added `tailscale_ip` column to devices table. Services now:
1. Check if IP is in Tailscale range (100.64.0.0/10)
2. If yes, lookup device by `tailscale_ip` in database
3. If no, use existing Keenetic lookup

Centralized in `lookupByIp()` helper in devices service.

### Service-Specific Changes

| Service | Change |
|---------|--------|
| devices | Added `tailscaleIp` field, `lookupByIp()` helper, UI for setting Tailscale IP |
| qbittorrent | Added `100.64.0.0/10` to `AuthSubnetWhitelist` |
| vpn.internal | Not applicable - sets Keenetic policies, but Tailscale traffic bypasses Keenetic |

### Traffic Flow

**Local network:**
```
Device → Keenetic → Service
         ↓
    (IP→MAC lookup works)
```

**Via Tailscale:**
```
Device → Tailscale → Homelab → Service
                      ↓
              (lookup by tailscale_ip)
```

Note: Only traffic to 192.168.1.0/24 goes through Tailscale. Internet traffic (google.com) goes directly from the device, not through homelab/Keenetic.

## Affected Files

- `docker-compose.yml` - Traefik host networking
- `traefik/dynamic.yml` - Backend URLs changed to 127.0.0.1
- `devices/src/storage/db-schema.ts` - Added `tailscaleIp` column
- `devices/src/server.ts` - Added `lookupByIp()` helper
- `devices/migrations/0001_add_tailscale_ip.sql` - Migration
- `qbittorrent/config/qBittorrent/qBittorrent.conf` - Auth whitelist
