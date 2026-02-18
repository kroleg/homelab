# Homelab

Monorepo for homelab services and infrastructure. Each subfolder is an independent service managed via root docker-compose.

## Subfolders

- calendar - Family calendar display service for iPad using iCal.js and rrule
- claude-chat - Web chat interface for Claude API (runs on host via systemd, not Docker)
- config - Configuration data (DNS blocklist, host-to-IP mappings)
- db - SQLite database storage directory
- dns-proxy - DNS proxy with JSON logging and Prometheus metrics
- family-dashboard - Family dashboard with quick links to homelab services
- grafana - Metrics visualization with dashboards for DNS, Keenetic, and node metrics (see grafana/SETUP.md for host setup)
- jellyfin - Media server for streaming movies and TV shows
- keenetic-api - REST API for Keenetic router
- keenetic-exporter - Prometheus exporter for Keenetic router metrics
- main - Central API wrapper with VPN management and database integration
- otel - OpenTelemetry collector config for OTLP to Prometheus
- page-watcher - Web page monitoring service that detects text changes and sends notifications
- devices - Admin UI for managing users and devices with PostgreSQL storage (devices.internal)
- prometheus - Prometheus time-series database configuration
- promtail - Loki log shipper for Docker container logs
- qbittorrent - Torrent client with web interface
- scrutiny - HDD/SSD health monitoring with SMART data (disk-monitor.internal)
- shared-logs - Shared logging output directory for services
- telegram-bot - Telegram bot for commands and notifications with HTTP API
- torrent-ui - Simple UI for uploading torrents and viewing download progress
- traefik - Traefik reverse proxy dynamic configuration
- vector - Data pipeline for transforming Docker logs to Seq
- vpn-toggle - Simple UI for toggling VPN connections

## Service Architecture

Key service responsibilities and dependencies:

- **keenetic-api** - Low-level Keenetic router API. Source of truth for router data (clients, policies, MAC addresses). Other services should call this for any Keenetic-related data.
- **devices** - User and device management (DB-backed). Provides `/api/whoami` for admin status checks. Uses keenetic-api for router data.
- **main/dns-to-vpn** - DNS routing and VPN domain management. Uses keenetic-api internally. Should NOT be called by other services for Keenetic data.
- **vpn-toggle, family-dashboard, torrent-ui** - UI services that use devices for user/admin info.

## Git

No AI mention in commits.

## Tech Stack

Docker Compose, Node.js/TypeScript, Prometheus/Grafana

Refer to @typescript-architecture.md

## Development

- Start all: `docker compose up -d`
- Rebuild service: `docker compose up -d --build <service>`
- Logs: `docker compose logs -f <service>`
- When adding new services, update the Subfolders list in this file
- don't mention claude in commits
