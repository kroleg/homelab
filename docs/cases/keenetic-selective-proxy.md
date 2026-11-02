# Keenetic selective routing proxy and Zapret2

## Current conclusion — 2026-11-02

The macvlan SOCKS5 proxy and scoped nfqws2 sidecar are running. Domain-only routing and actual YouTube video delivery have been observed through the proxy. Image-host failures were fixed, and the duplicate nfqws2 hostname list was removed at the user's request. Keenetic remains the only domain-selection mechanism. No TLS interception is used.

The user authorized stage two and later requested a production refactor, a shareable execution plan, and separate commits for unrelated work. The refactor passed validation and the user subsequently authorized the proxy/Zapret commit. Instruction consolidation and unrelated Mi TV/UI changes were committed separately. The mtg image-pin commit was dropped at the user's request; its change is excluded.

## Environment and preserved routing

- Server `.100` remains in Default because some services need existing VPN routes. An earlier proposal to put the entire server in ISP-only was rejected by the user and must not be applied.
- Proxy endpoint `192.168.1.250:1080`, fixed MAC `02:42:c0:a8:01:fa`, macvlan bridge on enp1s0; router/gateway `192.168.1.1`. Before allocation, `.250` was absent from client/ARP records; router DHCP pool was verified as `.33–.152`. No host shim was added.
- Proxy client registered as homelab-proxy in Policy3 `ISP only`, permitting PPPoE0 and excluding Wireguard0/1/2 and Proxy0. Host default via the router alone is not evidence of ISP egress; no packet-level WAN capture was completed.
- Keenetic connection Proxy0 was renamed by the user from homelab-test to **zapret proxy**. Policy4 **Zapret** permits Proxy0 only. User's test devices were changed by the user, not the agent.
- Firmware observed: 5.01.C.8.0-2, dated 8 Oct 2026. Runtime DNS filter assignment includes Bridge0/adguard-default. System DNS uses plaintext upstreams and FQDN mirroring; no global DNS-filter settings were changed.
- Initial inspection found no ~/opt/keenetic-proxy directory, prior proxy container or matching image. No interrupted-attempt artifacts were removed.

## Executed implementation

Root Compose manages Dante with bounded json-file logs (10m × 3), read-only root/config, /run and /tmp tmpfs, dedicated UID1080 and router-only source ACL. Private/special destination networks are blocked. The original host-network `.100:1080` prototype was replaced with macvlan after the user's clarification about server VPN access.

The optional `dpi` service shares only the proxy network namespace. It uses nfqws2 source commit `f924d796b49da9e455c6bb09268298ef1471cd74`, archive SHA256 `37b6c71ae5249345b6ba762efe47ef6a9a7391321d1c80306775ca795e3c0d79`, pinned base image, and the two matching Lua modules. Source review and its limitations are in [SECURITY-REVIEW.md](../../keenetic-zapret/SECURITY-REVIEW.md).

Interception is limited to Dante UID1080, eth0, public IPv4 TCP443, with first 12 packets per direction; replies must belong to tagged connections. Queue24080 and owned inet table homelab_zapret2 are namespace-local. Generated mark 0x40000000 is excluded and untracked; connection mark 0x20000000 scopes replies. Host conntrack accounting remained 0; accounting is enabled only in the proxy namespace. Engine UID1081 drops privileges via upstream hardening.

Single active configuration (`engine.args`):

```text
--debug=0
--filter-tcp=443
--filter-l7=tls
--payload=tls_client_hello
--lua-desync=fake:blob=fake_default_tls:tcp_md5:repeats=6
--lua-desync=multidisorder:pos=1,midsld
```

No hostname filter, maintained duplicate strategy, diagnostic curl packages, test drivers or candidate profiles remain in the production tree. The controller monitors child/queue state, not a public website. Dead/stopped engines or sustained queue backlog degrade to proxy-only until restarted.

## Verified observations and tests

### Proxy and native DNS routing

- Independent SOCKS HTTPS returned 200 and destination logs. Unlisted loopback source was rejected; private destination `.1:443` was denied. These checks preceded tightening the final ACL to router-only.
- Host requests through the router proved proxy traversal for a literal IANA IP (`192.0.43.8`) and then for the **domain-only** kernel.org include (`172.105.4.254`), with corresponding router-source Dante data transfers.
- Fresh example.net lookup after adding the domain populated runtime addresses, disproving a universal DNS-learning failure. Ordinary route-table absence was not reliable evidence of native DNS-routing failure.
- At the later YouTube audit, domain-list2 had 210 entries, 468 unique IPv4/464 IPv6 addresses and binding Proxy0; none overlapped an enabled WireGuard-bound group. The user had moved this list from its historical VPN binding. Learned addresses do not prove an individual packet used the route.

### Stage-two trials

- Proxy-only kernel.org worked. YouTube TLS1.2 and TLS1.3 each timed out twice at approximately five seconds; queue pass-through reproduced the failure.
- Scope counters: a direct UID0 request added no queued packets (outbound/inbound 36→36); a Dante request added 12 each (36→48). Engine debug logs confirmed it saw TLS. Generated counters confirmed marked packets bypassed reprocessing.
- multisplit(pos=1,midsld) failed all four YouTube trials. Plain multidisorder caused a partial neutral response/timeout and fail-open; a YouTube success during that transition was excluded from success evidence.
- fake(tcp_seq=-10000,repeats=6)+multidisorder passed an initial 4/4 homepage matrix. Host-scoped repeats/overlap variants had occasional resets. The tcp_md5 variant passed 4/4 homepage trials with TLS1.2/1.3 and was retained. Only short repeated trials were performed; this is not a long-term reliability guarantee.
- A reviewed diagnostic probe retrieved public player metadata without executing JavaScript or using cookies, then downloaded actual video bytes from rr5---sn-jvhnu5g-gv8e.googlevideo.com: four HTTP206 transfers, 185,292 bytes each across TLS1.2/1.3. Measured short-transfer rates were approximately 0.4–2.1 MB/s; this is not a 4K/sustained-throughput test. Signed media URLs were not logged.
- Exact same-media off/on/off comparison was attempted but never completed successfully: web player data lacked direct URLs and later extraction requests reset. Do not claim media A/B causality was proven.
- Live user-reported **MacBook** playback (not iPhone), with active wireless client `.63` in Default: Dante connected to www.youtube.com (`142.251.150.4`) and rr3---sn-jvhnu5g-gv8e.googlevideo.com (`212.188.7.14`) at 13:31–13:33 UTC. Finished sessions transferred 3,311,422 and 5,290,536 bytes; active socket bytes_received reached 9,495,891. Sidecar was active. Dante sees router source `.1`; per-client attribution relies on the user's playback timing and router policy checks.
- Missing images were reported; user identified yt3.ggpht.com. ytimg/ggpht were absent from the initial engine host filter. Adding them changed a real thumbnail from TLS timeout to 200 image/jpeg, 15,921 bytes, in four TLS1.2/1.3 trials; yt3 root returned HTTP400 (TLS works, not a valid image path). User confirmed images worked.
- User then requested removal of engine hostname selection. With no host filter, kernel.org, YouTube and the thumbnail passed TLS1.2/1.3; yt3 root returned HTTP400. This is the current behavior.

### Production refactor and validation

The requested refactor removed the test drivers/candidate strategies, duplicate saved profile, diagnostic source ACL and diagnostic runtime packages. It replaced the external kernel.org watchdog with local process and queue monitoring and changed namespace guards from assertions to explicit runtime checks. Updated operating documentation and the [shareable execution plan](../guides/keenetic-proxy-zapret-execution-plan.md) describe the final design.

After rebuilding and replacing only the pair: real router-routed YouTube TLS1.2 returned HTTP200 and thumbnail TLS1.3 returned HTTP200 image/jpeg (15,921 bytes). Controlled engine SIGSTOP and SIGKILL each produced degraded state and removed the dedicated table; ordinary router-routed HTTP to YouTube still returned 301 in proxy-only operation. Normal sidecar stop also preserved HTTP301 and an independent table lookup confirmed the table was absent. Sidecar was restored after each test.

Coordinated recreation then changed the proxy container identity; Docker inspect confirmed the sidecar's network mode referenced exactly that new container ID. YouTube returned HTTP200 and the thumbnail returned HTTP200 image/jpeg afterward; sidecar healthy, queue pending 0, host conntrack accounting still 0. Runtime curl binaries are absent from both images and proxy iproute diagnostics were removed.

Final router-only ACL check used the already-reviewed local diagnostic image as a disposable, unprivileged client in the proxy namespace (no diagnostic package added back). Source `.250` was reset with curl exit97 and a matching Dante block log after recreation. Compose validation, controller compilation, local documentation-link validation and git whitespace checks passed. The refactor was held uncommitted until the user's subsequent approval; final precommit checks again passed and both services remained running, with the sidecar healthy/active. Unrelated generated Home Assistant PNG cache files were left untouched and excluded.

## Failed attempts and lessons

- Read-only Dante initially failed to create /tmp shared-memory locks; tmpfs fixed it. A one-line temporary rule with command/log syntax failed validation without restarting; multiline syntax worked. Temporary destination blocks were subsequently removed.
- Debian nft1.0.6 omits table comments from JSON. Ownership verification initially refused its own table on restart; corrected to verify the text comment while retaining strict ownership checks. No broad ruleset flush was used.
- Initial hostname-based testing with example.com/example.net was confounded by shared CDN addresses in other Wireguard0 groups (careers.tether.io and OpenAI/ChatGPT entries). Even an explicit example IP bypassed Dante. This invalidated the overbroad claim that all explicit IPs worked and domains did not. Do not repeat those destinations as clean controls.
- IANA names initially had empty runtime addresses after queries that preceded list addition; router caching was a plausible confounder, not a proven cause. The AdGuard profile was also considered but the later non-conflicting domain-only success disproved a general requirement to disable it.
- Generic proxy traffic after an iPhone policy change was not proof of YouTube delivery. Subsequent API reads showed the iPhone back in Default; packet/log correlation must use the actual device and interval.
- The first build was started before the user's audit request, then interrupted during dependency installation before compiling/running nfqws2. Review occurred before resuming the engine build. Audit scope does not include a full compiler/OS dependency source audit; no downloaded installer or player JavaScript was executed.

## Remaining limits and evidence

IPv6 forwarding/bypass, SOCKS UDP compatibility, QUIC and Discord voice are unverified and not enabled. Packet-level ISP egress, complete unselected-client/fallback scenarios, exact same-media off/on/off, sustained throughput, whole-container freeze behavior and the five-second backlog fault branch have not all been exercised. Do not infer them from local health or runtime DNS entries. Operator changes superseded/removed earlier test includes; no router test list was blindly rewritten during refactoring.

Sources: read-only existing API and authenticated RCI observations; Docker/Dante/nft/ss output; bounded host/proxy HTTP tests and user reports, 2026-11-01/02. Upstream references and operating commands are in the service READMEs. No credentials or signed media URLs retained.
