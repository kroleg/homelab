# Wi-Fi registration portal

Dedicated HTTP connectivity-check service at `http://portal.internal/`. Registration comes from Keenetic, via the internal `GET /api/client-registration?ip=…` endpoint. Registered clients receive the exact successful probe response; unregistered/unknown clients receive HTTP 302 to the instructions page. Registered private MACs are accepted. The service performs no router mutations and does not enforce internet denial.

The page has Russian instructions for disabling private MAC addresses on iOS, Android, macOS and Windows. `/api/status` returns only the requesting client's `{ip, mac, name, registered}`. Lookups have a 5-second timeout and a 2-second cache; a failed lookup returns 503 rather than pretending registration succeeded. `/health` checks the process only, not router availability. All responses are `Cache-Control: no-store`.

## DNS and proxy setup

Keep clients using Keenetic DNS. Add static DNS records on Keenetic for the selected HTTP probe hostnames to the homelab address, **192.168.1.100**. `portal.internal` must also resolve to that address (the existing internal wildcard covers it). Traefik's explicit Host rules route these requests; there is no catch-all router.

| Host | Path | Registered-client response |
| --- | --- | --- |
| captive.apple.com | /hotspot-detect.html | 200, Apple Success HTML |
| connectivitycheck.gstatic.com | /generate_204 | 204, empty |
| connectivitycheck.android.com | /generate_204 | 204, empty |
| www.msftconnecttest.com | /connecttest.txt | 200, Microsoft Connect Test |
| ipv6.msftconnecttest.com | /connecttest.txt | 200, Microsoft Connect Test |

Start the iPhone test with **only captive.apple.com**. The table lists supported hosts, not proof that all DNS overrides are enabled. HTTPS probes cannot be impersonated using this HTTP service. Android behavior, other vendors' probe hosts, alternate DNS, and IPv6 answers need separate testing. If a registered phone shows a warning, remove the test DNS override and reconnect it before proceeding.

Traefik runs on the host; `TRUSTED_PROXIES` contains the observed Docker bridge gateways (172.18.0.1 and 192.168.80.1). Express selects the nearest untrusted address in the forwarded chain. Reverify this configuration if Docker networks or Traefik networking change. The portal has no IP query parameter for impersonating another client.

## Phone test

1. Open `http://portal.internal/api/status` from the phone. Confirm its IP, MAC and registration match the router. Save those details before changing Wi-Fi settings.
2. Enable only the Apple DNS override; reconnect an unregistered iPhone using a private MAC. Expect the sign-in prompt and instructions. If no prompt appears, open `http://captive.apple.com/hotspot-detect.html` explicitly to separate popup detection from HTTP routing.
3. Disable the private address for this home Wi-Fi and reconnect. Keenetic auto-registration should make `/api/status` return `registered: true`. Check the MAC changed; confirm the probe returns Success and that there is no sign-in prompt.
4. Verify a previously registered phone stays online without a prompt.
5. Only after this passes, enable Keenetic's **deny internet for unregistered Home clients** and repeat. Verify DNS and the local portal remain reachable, external internet is blocked with private MAC on, and restored after registration. Preserve registered devices' existing policies and schedules.

Popup detection and actual internet denial require phone testing; server tests alone cannot verify them. The router's existing automatic registration remains enabled; there is no controller auto-registering clients in this service.

Rollback for an added Apple DNS binding: `no ip host captive.apple.com 192.168.1.100`, then `system configuration save`. Restore an earlier binding instead if one existed. Disabling the portal container alone while its DNS overrides remain installed breaks probe handling.

## Build and checks

Use Docker. The service Dockerfile runs typecheck, Pug compilation and HTTP/registration tests before creating the runtime image:

```sh
docker compose build captive-portal
docker compose up -d --build --no-deps keenetic-api
docker compose up -d --build --no-deps captive-portal
```

Configuration: `KEENETIC_API_URL` (default `http://keenetic-api:3000/api/`), `PORTAL_URL` (default `http://portal.internal/`), `TRUSTED_PROXIES` (default loopback; Compose sets host gateways), `PORT` (3000), `LOG_LEVEL` (info). Logs record request IP, registration decision, host/path and lookup failures.
