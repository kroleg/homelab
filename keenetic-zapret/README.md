# Proxy DPI processing

The optional `dpi` Compose profile runs a pinned nfqws2 sidecar in the [proxy](../keenetic-proxy/)'s network namespace. See the [source review](SECURITY-REVIEW.md), [investigation evidence](../docs/cases/keenetic-selective-proxy.md), and [reusable execution plan](../docs/guides/keenetic-proxy-zapret-execution-plan.md).

`engine.args` is the single strategy configuration: fake default TLS ClientHello with TCP MD5 and six repeats, followed by multidisorder at positions `1,midsld`. **There is no hostname filter or duplicate host list.** Keenetic selects traffic routed to the proxy; all eligible proxy TLS connections receive the strategy. This strategy was tested against this ISP and is not promised to work elsewhere.

## Scope and runtime

- Only Dante UID1080's public IPv4 TCP443 flows on `eth0` are tagged and intercepted. The engine runs as UID1081. Reply interception matches only the tagged flows. The first 12 packets in each direction are queued.
- Queue24080 and the owned `inet homelab_zapret2` table exist only in the proxy namespace. Generated-packet mark `0x40000000` prevents recursive queueing and applies early notrack; connection mark `0x20000000` scopes replies. No host/Docker firewall tables are changed.
- No TLS termination, application decryption, UDP/QUIC or IPv6 processing is configured. The macvlan path has no Docker bridge SNAT before Keenetic.
- Source commit `f924d796b49da9e455c6bb09268298ef1471cd74`, source archive checksum and base-image digest are pinned in the Dockerfile; Lua modules come from that same source. Review changes before rebuilding.
- Only required capabilities are granted: NET_ADMIN/NET_RAW, UID/GID/capability dropping, and KILL for the engine child. The root filesystem/config are read-only. Logs rotate at 10 MB × 3.
- The controller installs rules only after the engine binds the queue. Normal shutdown removes the owned table before stopping the engine. If the child dies/stops, its queue disappears, or packets continuously back up for five seconds, interception is removed and the service stays degraded until restarted. Health uses local process/queue state; there are no public-website probes or diagnostic packages.
- Queue bypass preserves forwarding without a listener. Pausing the entire container also pauses its watchdog; this is distinct from stopping the engine child and is not a verified fail-open scenario. Network/DPI success is measured separately from local health.

## Commands

From the project root:

```bash
docker compose --profile dpi config --quiet
docker compose --profile dpi build keenetic-zapret
docker compose --profile dpi up -d keenetic-zapret
docker compose --profile dpi restart keenetic-zapret
docker compose --profile dpi logs --tail 100 -f keenetic-zapret
docker compose --profile dpi exec -T keenetic-zapret cat /run/zapret-status
docker compose --profile dpi exec -T keenetic-zapret nft list table inet homelab_zapret2
```

**Proxy-only rollback:** `docker compose --profile dpi stop keenetic-zapret`.

After replacing the proxy container, recreate the sidecar to join its new namespace. Use `docker compose --profile dpi up -d --force-recreate keenetic-proxy keenetic-zapret` for a coordinated replacement. The two services can be removed independently of unrelated homelab services. Namespace-local conntrack accounting remains enabled for packet counting; the host's setting is unchanged.

The case record distinguishes confirmed checks from incomplete acceptance tests. Experimental strategies and disposable test scripts were removed from the production tree; exact successful parameters and meaningful failures remain documented there.
