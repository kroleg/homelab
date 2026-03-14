# Home Assistant

Home automation platform with Zigbee support via Zigbee2MQTT.

## Services

| Service | Image | Network | Access |
|---------|-------|---------|--------|
| Home Assistant | `ghcr.io/home-assistant/home-assistant:2026.3` | host (port 8123) | `hass.internal` via traefik |
| Zigbee2MQTT | `koenkk/zigbee2mqtt` | host (port 8099) | `http://<host-ip>:8099` |
| Mosquitto | `eclipse-mosquitto:2` | bridge (port 1883) | internal MQTT broker |

## Hardware

- **Zigbee coordinator**: Sonoff Zigbee 3.0 USB Dongle Plus (`/dev/ttyUSB0`) - managed by Zigbee2MQTT
- **Bluetooth**: Intel Bluetooth adapter - available to HA via `/run/dbus` mount

## Setup

Services are included in the root `docker-compose.yml` via the `include:` directive.

```bash
# Start all services (from repo root)
docker compose up -d homeassistant mosquitto zigbee2mqtt

# View logs
docker compose logs -f homeassistant
docker compose logs -f zigbee2mqtt
```

### First-time setup

1. Start services
2. Open `http://hass.internal` (or `http://<host-ip>:8123`)
3. Complete the HA onboarding wizard (create account, set location, etc.)
4. Add MQTT integration: Settings > Devices & Services > Add Integration > MQTT (broker: `localhost`, port: `1883`)
5. Zigbee devices paired in Z2M (`http://<host-ip>:8099`) will auto-appear in HA

### Install HACS

```bash
docker exec -it homeassistant bash
wget -O - https://get.hacs.xyz | bash -
```

Then restart HA and add HACS integration via Settings > Devices & Services > Add Integration.

## Updating

```bash
# Edit image tag in home-assistant/docker-compose.yml
docker compose pull homeassistant  # or zigbee2mqtt, mosquitto
docker compose up -d homeassistant
```

## Backup

- HA config lives in this directory (mounted as `/config`)
- HA built-in backups: Settings > System > Backups (saved to `./backups/`)
- Z2M config: `./zigbee2mqtt/`
- Mosquitto config: `./mosquitto/`

## Container mode notes

This is a "Container" install (not HA OS). Key differences:
- **No add-ons** - additional services (Zigbee2MQTT, Mosquitto, etc.) run as separate containers
- **No Supervisor** - updates are manual (edit image tag, pull, restart)
- **HACS works** - install manually (see above)
