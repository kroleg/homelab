# Rethink - local LG ThinQ washer integration

De-clouds an LG ThinQ washer (F2V5PS0W, ThinQ model `F_V7_Y___W.B__QEUK`) using
[anszom/rethink](https://github.com/anszom/rethink): the appliance talks to this
container instead of LG's real cloud, and state/control is exposed as HA-compatible
MQTT. Fully local - no internet dependency after setup.

## Layout

```
rethink/
  config.json   - tracked, no secrets
  certs/        - gitignored (CA key/cert, auto-regenerated on hostname mismatch)
  state/        - gitignored (bridge runtime state)
```

## Setup (new machine / after clone)

### 1. Router: static DNS overrides

On the Keenetic (CLI, config mode) - redirects the appliance's cloud calls and
rethink's own hostname to this host's LAN IP:

```
ip host rethink.internal 192.168.1.100
ip host common.lgthinq.com 192.168.1.100
ip host comon.lgthinq.com 192.168.1.100
ip host eic-common.lgthinq.com 192.168.1.100
system configuration save
```

If the washer is on an isolated VLAN/segment (e.g. an IoT network), also add a
firewall permit for that device's IP to reach this host, since Keenetic's segment
isolation blocks it by default:

```
Settings > Network Rules > Firewall > Permit
Source: <washer's static IP>   Destination: 192.168.1.100   Protocol: TCP (any port)
```

### 2. Start

```bash
docker compose up -d rethink
```

### 3. Provision the washer

Requires a laptop/phone with Wi-Fi (the docker host has no Wi-Fi hardware).

1. Put the washer into Wi-Fi setup mode (hold the Wi-Fi button ~3s until it blinks)
2. Connect your laptop to the washer's temporary SoftAP network
3. From a clone of the repo (any machine with Wi-Fi):
   ```bash
   npx tsx rethink-setup.ts 192.168.120.254 <home-wifi-ssid> <home-wifi-password>
   ```
   (gateway IP may differ - check `ip route` after joining the SoftAP if unsure)
4. Watch `docker compose logs -f rethink` - full success looks like a `clip/provisioning/devices/<uuid>`
   message followed by `completeProvisioning_ack`, then live `device_packet`/`publish` lines
   once a wash cycle is active (the washer only sends full 80-byte status frames while running,
   not while idle)

## Adding device support

If `rethink` logs `thinq2 device type <id> unknown`, the model isn't in
`cloud/ha_bridge.ts`'s device table. Check if a close sibling model already has a
decoder (LG's ThinQ model IDs use `_` as positional wildcards, so near-identical
variants often share a compatible frame layout) - if so, an alias may work. Verify
against real data before trusting it (see the F2V5PS0W alias upstreamed in
[PR #168](https://github.com/anszom/rethink/pull/168) for the pattern), then send
it upstream rather than patching locally.

## Known gaps

- Management port (`44401`) is locked to `127.0.0.1` at the app level (`config.json`),
  but there's no OS-level firewall backstop on this host - `network_mode: host` means
  Docker's own port isolation doesn't apply.
- This washer is fully de-clouded: the official LG ThinQ app will no longer work for
  it unless [bridge mode](https://github.com/anszom/rethink/wiki/Bridge) is set up.
