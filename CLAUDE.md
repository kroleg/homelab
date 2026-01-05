# Homelab

Monorepo for homelab services and infrastructure. Each subfolder is an independent service managed via root docker-compose.

## Subfolders

- calendar - Family calendar display service for iPad using iCal.js and rrule
- config - Configuration data (DNS blocklist, host-to-IP mappings)
- db - SQLite database storage directory
- dns-proxy - DNS proxy with JSON logging and Prometheus metrics
- glance - Dashboard UI showing service health, Docker containers, and calendar widgets
- grafana - Metrics visualization with dashboards for DNS, Keenetic, and node metrics
- keenetic-exporter - Prometheus exporter for Keenetic router metrics
- main - Central API wrapper with VPN management and database integration
- otel - OpenTelemetry collector config for OTLP to Prometheus
- page-watcher - Web page monitoring service that detects text changes and sends notifications
- prometheus - Prometheus time-series database configuration
- promtail - Loki log shipper for Docker container logs
- shared-logs - Shared logging output directory for services
- vector - Data pipeline for transforming Docker logs to Seq
- vpn-toggle - Simple UI for toggling VPN connections

## Git

No AI mention in commits.

## Tech Stack

Docker Compose, Node.js/TypeScript, Prometheus/Grafana

## Development

- Start all: `docker compose up -d`
- Rebuild service: `docker compose up -d --build <service>`
- Logs: `docker compose logs -f <service>`
