# Keenetic routing proxy

Dante provides SOCKS5 TCP CONNECT and standard UDP ASSOCIATE at **192.168.1.250:1080**, without username/password authentication. Only the router at **192.168.1.1** is allowed to connect. Private/special destination networks are blocked. UDP uses dynamically allocated relay ports on the dedicated macvlan IP; no Docker host-port mappings are needed. Connection logs include destination IPs/ports and rotate at 10 MB × 3 files.

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

### Important: Keenetic's CLI setting for standard SOCKS UDP

Selecting SOCKS5 in the normal proxy setup form does **not** establish which UDP transport Keenetic uses. The setting below is configured through Keenetic's command-line interface; do not assume the web form exposes a matching toggle. On this router, with the setting absent, UDP used the nonstandard UDP-over-TCP request **command 5**, which Dante rejects. Explicitly enabling the setting switched requests to standard UDP ASSOCIATE **command 3**.

The checked-in Dante configuration includes matching UDP association, public-destination forwarding and reply rules. The initial association to `0.0.0.0:0` is allowed as a control request; actual datagram destinations are checked separately against the private/special network blocks. Replies return only to the router. Retain these restrictions when adapting the setup; enabling the router setting alone is insufficient with an older TCP-only Dante configuration.

CLI means Keenetic's command-line interface: the router's text console, accessed over SSH/Telnet when enabled or through a Web CLI page if the firmware provides one. These are KeeneticOS commands, not Linux shell commands on the homelab server. Substitute the actual proxy interface ID (here `Proxy0`, whose display name is `zapret proxy`):

```text
interface Proxy0 proxy socks5-udp
```

Allow time for the proxy client to adopt the mode, then verify a fresh request. In the 2026-11-12 tests, an immediate probe still used command5; a repeat after seven seconds used command3. The successful round-trip test waited eight seconds. Do not interpret the first immediate request as proof that the command has no effect.

After confirming UDP requests **and replies** traverse Dante and TCP still works, persist the router change:

```text
system configuration save
```

Router-mode rollback (save afterward if the mode had been persisted):

```text
interface Proxy0
no proxy socks5-udp
exit
```

This rollback returns Keenetic to its observed UDP-over-TCP command5 mode, which Dante rejects; it does not disable TCP or guarantee that clients stop trying UDP.

**Current deployment: standard UDP is enabled and the router setting is saved.** Both initial version-negotiation probes and later real YouTube playback traversed the existing domain route. The user confirmed ongoing playback and reported response header `client-protocol: quic`; Dante recorded approximately 9.1 MB received over UDP from Googlevideo servers in one playback window. TCP remains supported. Zapret still processes TCP443 only; no UDP/QUIC modification strategy was added.

Some media requests failed intermittently, including a 12-second wait without response headers. A packet-size error and historical UDP receive-buffer drops were observed, but neither was proven to cause those requests. This is a working UDP/QUIC path with reliability observations to revisit if failures recur, not demonstrated DPI blocking. See the [UDP investigation and exact results](../docs/cases/2026-11-12-zapret-proxy-load-status.md).

Use the existing domain-based route for tests. A temporary global static route via Proxy0 re-intercepted the proxy's own egress and caused a routing loop; the proxy's ISP-only policy was not sufficient protection for that test arrangement. Do not repeat that diagnostic route.

TCP HTTPS, actual Googlevideo transfers and user-confirmed QUIC playback have been observed through this path. IPv6, QUIC DPI bypass and Discord voice remain unverified. DNS filter settings were left unchanged; do not remove AdGuard presets based on the rejected early hypothesis. Router packet-level ISP egress and all client fallback scenarios have not been independently captured.

References: [Keenetic proxy client](https://support.keenetic.com/hero/kn-1012/en/49443-proxy-client.html), [DNS routing](https://support.keenetic.com/hero/kn-1012/en/51150-dns-based-routes.html), [Docker macvlan](https://docs.docker.com/engine/network/drivers/macvlan/).
