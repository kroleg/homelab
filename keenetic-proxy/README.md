# Keenetic routing proxy

Dante provides SOCKS5 TCP CONNECT at **192.168.1.250:1080**, without username/password authentication. Only the router at **192.168.1.1** is allowed to connect. Private/special destination networks are blocked. Connection logs include destination IPs/ports and rotate at 10 MB × 3 files.

The root Compose service uses macvlan on `enp1s0`, gateway `.1`, fixed MAC `02:42:c0:a8:01:fa`, and allocation range `.250/32`. This address is outside the observed DHCP pool `.33–.152`. Dante's outbound sockets use dedicated UID1080. Config/root filesystem are read-only; `/run` and `/tmp` use tmpfs. DNS goes through the router because Linux macvlan isolates the container from the host's `.100` interface. No host shim or published host port is needed.

The optional [Zapret2 sidecar](../keenetic-zapret/) shares this namespace. The [execution plan](../docs/guides/keenetic-proxy-zapret-execution-plan.md) explains how to reproduce the setup elsewhere. [Investigation record](../docs/cases/keenetic-selective-proxy.md) contains historical experiments and verified results.

## Operation

From the project root:

```bash
docker compose config --quiet
docker compose build keenetic-proxy
docker compose up -d --no-deps keenetic-proxy
docker compose exec -T keenetic-proxy danted -V -f /etc/danted.conf
docker compose logs --tail 100 -f keenetic-proxy
```

If DPI processing is enabled, use a coordinated replacement so the sidecar joins the new proxy namespace:

```bash
docker compose --profile dpi up -d --build --force-recreate keenetic-proxy keenetic-zapret
```

Stopping the complete proxy path affects routed clients:

```bash
docker compose --profile dpi stop keenetic-zapret
docker compose stop keenetic-proxy
```

For proxy-only operation, stop only `keenetic-zapret`. Do not use project-wide `down`. Source ACLs deliberately exclude proxy-local diagnostic clients; runtime images contain no curl or test drivers.

## Router arrangement

- Register the dedicated MAC/IP as `homelab-proxy`. Its **ISP only** policy must permit only the actual ISP connection (`PPPoE0` here), excluding Proxy0 and all WireGuard interfaces. Keep the home server `.100` in its existing Default/VPN arrangement.
- The Keenetic SOCKS connection is `Proxy0`, currently named **zapret proxy**, endpoint `.250:1080`, authentication disabled. It is available for Internet use without replacing the normal global primary connection.
- For selective routing, use a client in Default with DNS through the router and bind its desired DNS lists to Proxy0. A whole-device test instead uses a dedicated policy containing only Proxy0; preserve the client's previous assignment for rollback.
- Keenetic's DNS rules are the only maintained domain-selection lists. There is no nfqws2 hostname list.
- Check learned address overlap across enabled groups. The example.com/example.net CDN addresses also matched VPN groups and were misleading test targets. `show object-group fqdn` exposes learned addresses, not proof of forwarding. Require matching router-source Dante connections and real data transfer.
- Native route fallback is a separate setting: Exclusive route fails closed when its interface is unavailable. A live proxy interface can still report connected while a destination fails. Record actual outage behavior rather than inferring it.

TCP HTTPS and actual Googlevideo traffic have been observed through this path. IPv6, UDP/QUIC and Discord voice are outside the verified implementation. DNS filter settings were left unchanged; do not remove AdGuard presets based on the rejected early hypothesis. Router packet-level ISP egress and all client fallback scenarios have not been independently captured.

References: [Keenetic proxy client](https://support.keenetic.com/hero/kn-1012/en/49443-proxy-client.html), [DNS routing](https://support.keenetic.com/hero/kn-1012/en/51150-dns-based-routes.html), [Docker macvlan](https://docs.docker.com/engine/network/drivers/macvlan/).
