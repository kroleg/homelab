# Homelab

Monorepo for homelab services and infrastructure. Each subfolder is an independent service managed via root docker-compose.

## Subfolders

- keenetic-proxy - Restricted SOCKS5 proxy for Keenetic selective routing (macvlan, 192.168.1.250:1080)
- keenetic-zapret - Optional nfqws2 sidecar processing only the proxy's outbound IPv4 TCP HTTPS traffic (Compose profile dpi)

- calendar (calendar.internal) - Family calendar display service for iPad using iCal.js and rrule
- captive-portal (portal.internal) - Registration-based Wi-Fi instructions and OS connectivity-check responses; registration comes from keenetic-api
- devices (devices.internal) - Admin UI for managing users and devices with PostgreSQL storage
- docx-to-pdf (pdf.internal) - DOCX to PDF converter using LibreOffice headless
- dns-proxy - DNS proxy with JSON logging and Prometheus metrics
- dns-routes (dns-routes.internal) - UI for Keenetic's native DNS-based routing (domain lists + interface bindings); intended replacement for dns-vpn's domain routing
- family-dashboard (dom.internal) - Family dashboard with quick links to homelab services
- home-assistant (hass.internal) - Home Assistant with Zigbee2MQTT and Mosquitto MQTT broker, plus rethink for local (no-cloud) LG ThinQ appliance integration (separate compose via include)
- infra - Observability stack (separate compose via include): grafana, prometheus, loki, promtail, otel-collector, node-exporter
- jellyfin (media.internal) - Media server for streaming movies and TV shows
- keenetic-api - REST API for Keenetic router
- keenetic-exporter - Prometheus exporter for Keenetic router metrics
- dns-vpn (admin.internal) - Central API wrapper with VPN management and database integration
- mtg-proxy - MTProto proxy for Telegram (port 8443, host network mode)
- page-watcher (page-watcher.internal) - Web page monitoring service that detects text changes and sends notifications
- qbittorrent (torrent.internal) - Torrent client with web interface
- scrutiny (disk-monitor.internal) - HDD/SSD health monitoring with SMART data
- shared-logs - Shared logging output directory for services
- telegram-bot (telegram-bot.internal) - Telegram bot for commands and notifications with HTTP API
- torrent-ui (dl.internal) - Simple UI for uploading torrents and viewing download progress
- traefik - Traefik reverse proxy dynamic configuration
- vpn-toggle (vpn.internal) - Simple UI for toggling VPN connections

## Service Architecture

Key service responsibilities and dependencies:

- **keenetic-api** - Low-level Keenetic router API. Source of truth for router data (clients, policies, MAC addresses). Other services should call this for any Keenetic-related data.
- **devices** - User and device management (DB-backed). Provides `/api/whoami` for admin status checks. Uses keenetic-api for router data.
- **dns-vpn** - DNS routing and VPN domain management. Uses keenetic-api internally. Should NOT be called by other services for Keenetic data.
- **vpn-toggle, family-dashboard, torrent-ui** - UI services that use devices for user/admin info.

## API discovery

Before calling these services as an API client, fetch their current OpenAPI JSON:

- DNS Routes: `http://dns-routes.internal/openapi.json`
- Devices: `http://devices.internal/openapi.json`
- VPN Toggle: `http://vpn.internal/openapi.json`

Specs are maintained in each service's `src/openapi.json`. Consult them for methods, inputs, defaults, response formats, access requirements, and mutation side effects. When changing code in these services, update the relevant spec in the same change/commit for every added, removed, or changed API endpoint, parameter, request/response schema, default, status code, access requirement, or side effect. Document new API routes; do not leave discovery to source inspection. Run `./scripts/check-openapi.sh` to validate all three specs and check route coverage. Route coverage does not verify parameter or response semantics; review those against the handlers.

Keenetic API is Docker-internal; consult its source in this monorepo rather than adding a public discovery endpoint. Do not impersonate another IP to bypass caller-based access controls.

## Git

No AI mention in commits.

## Tech Stack

Docker Compose, Node.js/TypeScript with pnpm, Prometheus/Grafana

Refer to ./typescript-architecture.md

## Development

- Start all: `docker compose up -d`
- Rebuild service: `docker compose up -d --build <service>`
- After committing service changes, deploy the affected services automatically unless the user explicitly asks to defer deployment. Rebuild and recreate only the affected services, using `docker compose up -d --build --no-deps <service...>` and including changed dependencies in dependency order. Verify container health and the changed behavior through live HTTP checks before declaring the work complete. Documentation-only changes do not require deployment. If deployment or verification is blocked, report the blocker and clearly state what is still undeployed or unverified.
- Logs: `docker compose logs -f <service>`
- When adding new services, update the Subfolders list in this file
- don't mention claude in commits
- use git without -C when possible
- Use jq (not python) for JSON processing in shell commands
- To test service APIs not exposed on host, temporarily add a port mapping in docker-compose rather than using docker exec or ephemeral containers
- use npm/pnpm typecheck script if available instead of `npx tsc --noEmit`
- After modifying .pug files, run `npm run check:views` (or `pnpm check:views`) to catch syntax/indentation errors

# Investigation records

For non-trivial troubleshooting and research, consult relevant records in `docs/cases/` before repeating prior work. Create or update a descriptive case file as findings accumulate, following `docs/cases/README.md`. Case filenames must use a creation-date prefix: `YYYY-MM-DD-descriptive-topic.md`. Keep the original date when updating a case. This naming rule does not apply to `README.md` or supporting artifacts under `docs/cases/support/`.

Record verified observations, user-reported behavior, failed attempts and regressions, proposed but untested options, remaining questions, and evidence sources. Clearly distinguish requests from confirmed executed changes. Never include credentials or tokens.
