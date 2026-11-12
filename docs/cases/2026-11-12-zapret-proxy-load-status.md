# Zapret proxy status and observed load

## Current conclusion — session wrap-up, 2026-11-12

Standard SOCKS UDP is enabled in Dante and Keenetic Proxy0; the router configuration-save command was acknowledged. TCP remains supported. The user confirmed YouTube playback is working and reported `client-protocol: quic`; proxy logs independently show substantial Googlevideo UDP transfer. Dante replacement and a QUIC DPI strategy are not required to establish this working path. The existing native zapret2 TCP strategy is unchanged.

Some media requests failed intermittently, including a request to `rr3---sn-jvhnu5g-gv8s.googlevideo.com` with no response headers after 12.02 seconds. Playback subsequently worked again. A delayed packet-size error and 1,343 historical UDP socket-buffer drops are possible contributors, not proven causes. DPI blocking was not demonstrated; do not describe the entire UDP/QUIC setup as broken or change MTUs/buffers/strategy on that assumption. Revisit these observations if failures recur.

User requested cleanup and documentation, with no further synthetic tests or package installations. Diagnostic packages/cache, temporary scripts, backups and log copies were removed after recording evidence here. Older unrelated investigation artifacts were preserved. No temporary routes, diagnostic source ACLs, alternate proxy services or UDP strategy remain. The router setting is saved, and the committed proxy configuration was subsequently deployed as described below.

Final wrap-up checks: Compose profile configuration, Dante configuration, local documentation links and git whitespace passed. Both containers were running; zapret was healthy/active with zero pending/queue-dropped packets. No further synthetic traffic was generated. Existing unrelated working-tree case renames and other changes remain separate. Remote main was read directly and matched the tracking ref; the local branch already contains 15 unpushed commits, so a normal push will include those as well as the eventual UDP commit.

### Deployment verification — 19:13 UTC

After the user authorized committing and pushing only this session's changes, committed the six scoped files/hunks while excluding all pre-existing case renames, link migrations and unrelated work. Committed documentation links continue to use the existing tracked case filenames, so the UDP commit does not depend on those uncommitted renames.

Ran `docker compose --profile dpi up -d --build --no-deps --force-recreate keenetic-proxy keenetic-zapret`. Both builds used cached pinned image layers; only this pair was recreated. Existing unrelated Compose orphans were left untouched. Dante started successfully and configuration validation passed. Zapret was healthy/active, bound queue24080 with pending0 and drops0; Docker inspection confirmed its network namespace references exactly the new proxy container. There were no new client sessions in the first18-second observation window. No post-recreation synthetic HTTP/3/HTTP requests were made, as requested; real playback confirmation above predates this recreation.

## Initial inspection

Read-only production inspection, 2026-11-12 around 17:52–17:54 UTC. User requested status, errors and load assessment. No service, strategy or router changes were made; no stress test was run.

## Current findings

- Both containers started 2026-11-02 13:56 UTC; zero Docker restarts and no OOM kills. Zapret healthy, controller status active, expected nft interception table present and sidecar attached to the current proxy container.
- Three Docker stats samples: proxy CPU 0–0.02%, memory 23.59–24.89 MiB; zapret CPU 0.12–0.27%, memory 12.59–12.75 MiB. These are quiet-period samples, not peak-load history.
- NFQUEUE24080 had zero pending packets and zero kernel/user queue drops in all samples; packet sequence progressed 1,685,046 to 1,685,671. Zapret logs returned no entries for the requested last 240 hours.
- Shared network namespace lifetime counters: approximately 28.5 GB received and 27.4 GB transmitted. Do not add the identical counters reported for both containers. RX drops 29,274 / 28,304,326 packets (about 0.10%), zero interface RX/TX errors and TX drops. The cause of RX drops was not established; they are distinct from NFQUEUE drops.
- TCP lifetime counters: 51,508 retransmitted segments / 25,642,921 outbound segments (about 0.20%). ListenOverflows, ListenDrops, TCPBacklogDrop, TCPRcvQDrop and TCPMemoryPressures all zero.

## Last 24 hours of retained Dante logs

Source: `docker logs --since 24h keenetic-proxy`, 52,755 lines spanning Nov 11 17:52:53 through Nov 12 17:52:48 UTC.

- 5,836 successful TCP connect-open log events; busiest complete hour 828 (Nov 11 19 UTC).
- 6,370 TCP close events, including connections opened before the window. Sum of client-side byte counters on these close events approximately 4.24 GB; this is a completed-session accounting estimate, not exact traffic within the time window.
- Largest closed session delivered approximately 655 MB in 40 seconds (about 131 Mbit/s of payload), ending with a client reset. Demonstrates a historical burst, not a sustained-capacity benchmark or proof of uninterrupted playback.
- 13,900 rejected router-source requests with `unknown socks_v5 command: 5`. Persistent across all sampled hours. Verified symptom is unsupported command rejection; exact Keenetic feature/request origin remains unverified. No wire capture was performed.
- 268 TCP sessions closed with remote-peer errors, 72 with local-client errors. Raw log messages contain duplicates at accept/connect layers: 486 remote reset, 50 remote timeout, 132 local broken-pipe and 12 local reset lines. Do not present these raw counts as separate failed sessions.

## Assessment and open questions

No observed CPU, memory, socket-listener or NFQUEUE pressure. Existing traffic includes a substantial historical burst. Maximum sustainable throughput and peak CPU/concurrency remain unmeasured. Command-5 rejections were subsequently traced to UDP-in-TCP requests (below); resets/timeouts alone do not identify DPI failure or resource exhaustion. Client playback and fresh end-to-end HTTP success were not tested during this inspection. Earlier functional tests are documented in [the original case](2026-11-02-keenetic-selective-proxy.md).

## Command-5 investigation — same day, 18:02–18:08 UTC

User requested investigation of the rejected requests. No router, proxy, firewall or zapret configuration changes were made. Two single-byte UDP diagnostic datagrams were sent to a recently observed proxy destination, 142.251.14.138:443. This was not a QUIC or application success test.

### Confirmed local evidence

- Installed Dante is 1.4.2, Debian package 1.4.2+dfsg-7+b8. Configuration allows TCP CONNECT only.
- Authenticated read-only RCI GETs `/rci/show/rc/interface/Proxy0` and `/rci/show/interface/Proxy0`: SOCKS5 protocol, upstream 192.168.1.250:1080, running/up/connected. The configuration has no `socks5-udp` field or Ping Check profile. Output was restricted to non-secret fields.
- Passive AF_PACKET capture in the existing sidecar namespace inspected SOCKS headers only. Early short windows were quiet; later capture observed five natural command-5 requests at 18:06:22–26 UTC, router TCP source ports 55308, 55320, 55324, 55338, 55352. All sent greeting `05 01 00`, received no-auth acceptance `05 00`, then sent request `05 05 00 01 00 00 00 00 00 00`. Matching source ports appear in Dante's command-5 rejection logs. Successful command-1 TCP handshakes occurred in the same capture.
- Controlled correlation: first diagnostic UDP byte at 18:06:44 UTC produced matching rejection on router port 55354. Second byte at 18:07:40 UTC was captured on router port 55362: greeting/no-auth success, then identical command-5 header; Dante logged the matching rejection at 18:07:40.219–220 UTC. This directly links routed UDP to the unsupported command.
- Header destination is 0.0.0.0:0 because this requests a UDP tunnel. The actual UDP destination is in subsequent framing; rejection occurs before relay. Natural originating applications and UDP destination ports therefore remain unidentified. Do not equate every rejected request with QUIC, Discord or DNS.

### Interpretation and primary sources

This is a client/server protocol mismatch. Hev's core defines `CONNECT=1`, `UDP_ASC=3`, `FWD_UDP=5`; its client explicitly uses FWD_UDP for UDP_IN_TCP. Dante rejects command 5 before connecting to an external destination. Changing Dante ACLs alone cannot implement the extension.

- [Hev protocol constants](https://raw.githubusercontent.com/heiher/hev-socks5-core/main/src/hev-socks5-proto.h)
- [Hev client command selection](https://raw.githubusercontent.com/heiher/hev-socks5-core/main/src/hev-socks5-client.c)
- [Hev server supported protocols](https://github.com/heiher/hev-socks5-server)
- [Standard SOCKS5, RFC1928](https://www.rfc-editor.org/rfc/rfc1928.html)
- [Dante configuration manual](https://www.inet.no/dante/doc/latest/sockd.conf.5.html)
- [Keenetic command reference](https://storage.googleapis.com/docs.help.keenetic.com/cli/4.1/en/cli_manual_kn-2410.pdf): documents `proxy socks5-udp`, disabled by default. A [Keenetic forum first-hand test and response](https://forum.keenetic.ru/topic/19036-%D1%82%D1%83%D0%BD%D0%BD%D0%B5%D0%BB%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5-udp-%D1%87%D0%B5%D1%80%D0%B5%D0%B7-socks5-proxy/?comment=223945&do=findComment) describe default Hev `udp: tcp` and switching to `udp: udp`; these are historical implementation observations, not a local firmware switch test.

### Options, not executed

- Preserve the intended TCP-only service: identify and explicitly reject unwanted UDP before SOCKS tunneling, validating client fallback and rule scope. This could reduce retries but needs separate router/firewall work; blanket silent drops should not be assumed equivalent to fast rejection.
- Support standard UDP: test Keenetic `interface Proxy0 proxy socks5-udp` together with narrowly scoped Dante UDP ASSOCIATE/reply rules and relay-port handling. Router change alone is insufficient with current Dante policy. Current firmware behavior must be verified live, with rollback prepared.
- Support the existing extension: evaluate a compatible server such as hev-socks5-server. Replacement requires preserving router-only access, private-destination blocks, dedicated outbound UID1080 and sidecar namespace/watchdog integration; it is not a drop-in change already reviewed or tested here.

Relaying UDP does not add UDP DPI circumvention: the deployed zapret rules still process only IPv4 TCP443. In particular, enabling QUIC forwarding does not prove blocked QUIC will work. Browser TCP fallback is plausible but was not tested in this investigation.

## Did command 3 precede command 5? — same day, 18:28–18:30 UTC

User requested checking whether Keenetic tries standard UDP ASSOCIATE before falling back to command 5. No configuration changes were made.

- A fresh retained 24-hour Dante log read contained 14,210 command-5 rejection lines and no matches for `udpassociate`, `udpreply`, `udp/`, or `command: 3`. Logs alone cannot exclude every historical command-3 attempt because their completeness/format is not a packet trace.
- A 100-second passive capture, 18:28:53–18:30:33 UTC, tracked new router-to-proxy TCP connections from their SYN, assembled the initial client bytes and decoded the first SOCKS request after the no-auth greeting. All 10 new connections were decoded: nine command 1, one command 5, zero command 3. Only SOCKS headers/command metadata were printed; no application payload was retained.
- One diagnostic UDP byte sent to 142.251.14.138:443 at 18:28:59 UTC caused the command-5 connection, router source port 60324. Greeting/authentication was followed directly by `05 05 00 01 00 00 00 00 00 00`; the same port has Dante's command-5 rejection at 18:28:59.091957 UTC. No earlier command 3 or subsequent command-3 retry was observed during the capture.

Conclusion: the controlled attempt selected command 5 directly; observed behavior does not support a command-3-to-command-5 fallback. This is bounded evidence for the current settings, not a claim about every past session or all firmware modes. Standard UDP would require an explicit mode change and separate validation.

## Parallel review requested after UDP investigation

User explicitly authorized a parallel strategy review. Read-only live inspection confirmed the running engine is already zapret2 (`nfqws2`) and active arguments match the native Lua configuration in `engine.args`: fake default TLS with TCP MD5, six repeats, followed by multidisorder at `1,midsld`. No zapret1-to-zapret2 migration is needed; adding QUIC is a separate extension to interception and strategy, not automatically an engine upgrade.

Current [Xray SOCKS implementation](https://raw.githubusercontent.com/XTLS/Xray-core/main/proxy/socks/protocol.go), checked 2026-11-12, handles commands 1, 3 and Tor resolve commands; its default branch rejects command 5. Therefore Xray alone is not a compatible replacement for the currently observed UDP mode. This does not exclude Xray with a router mode change or a separate adapter. No replacement or router-mode change has been executed.

## Standard UDP test — same day, 18:36–18:41 UTC

User authorized testing standard SOCKS UDP first, and researching replacement proxies only if that failed. **The standard UDP test succeeded. Dante replacement is not required for UDP transport.** All temporary test settings were restored; standard UDP is not left enabled in production. QUIC application transfers and UDP DPI bypass remain untested.

### Router mode and settling time

- Temporarily posted `[{"interface":{"name":"Proxy0","proxy":{"socks5-udp":{}}}}]` to authenticated RCI `/rci/`. The router acknowledged enabling UDP mode and its running config reported `socks5-udp: true`.
- An immediate diagnostic packet at 18:36:02 still produced command 5. The setting was rolled back with `socks5-udp: {"no":true}`. This first result was premature; do not conclude that the mode switch is ineffective.
- Repeated at 18:36:42 with a seven-second settling period. Capture observed four command-3 requests and five command-1 requests, zero command-5 requests. Dante rejected command 3 using its default block rule, confirming the next requirement was server policy. Router mode was restored at 18:37:12.

### Failed diagnostic route — do not repeat

A first round-trip test used a temporary global static route for 9.9.9.10/32 via Proxy0 and temporary Dante rules allowing only that resolver on UDP53. It timed out twice. Logs showed many repeated 29-byte DNS requests forwarded through newly created associations, consistent with the global route re-intercepting the proxy's own egress and creating a routing loop. This is a diagnostic routing failure, not evidence that standard UDP is unsupported. The route was deleted at 18:39:14; config inspection confirmed absence afterward. Router mode and original Dante config were restored. Do not use a global /32 test route through Proxy0 without first excluding the proxy's own egress.

### Successful domain-routed UDP443 round trip

- Used the existing domain route: resolved `www.youtube.com` to 142.251.153.4. No static route was added for this test.
- Temporary Dante rules allowed router-source UDP association to 0.0.0.0:0, UDP datagrams only to this public IP on port443, and replies only from that IP:443 to the router. Existing client ACL and private-destination blocks were preserved. Config validation (`danted -V`) succeeded before SIGHUP reload.
- Enabled standard UDP on Proxy0 at 18:40:30 and waited eight seconds.
- Sent two 1,200-byte QUIC version-negotiation probes using reserved unsupported version 0x0a0a0a0a and explicit connection IDs. Both received 35-byte responses from 142.251.153.4:443, version0 with both connection IDs echoed, in 311 ms and 65 ms. No TLS or application data was sent.
- Dante close logs at 18:40:40 independently confirm two associations, each with 1,200 outbound payload bytes and 35 inbound payload bytes, router UDP source ports 58891 and 57623. This proves the traffic traversed Dante in both directions, rather than bypassing it.
- Restored router mode at 18:40:39 and original Dante config via validated SIGHUP reload. File contents matched the backup exactly; `git diff -- keenetic-proxy/danted.conf` was empty. Both containers remained up, zapret healthy. Post-restoration `https://www.youtube.com/` over TCP returned HTTP200 in 0.98s.

### Scope and next step

The result establishes Keenetic standard SOCKS UDP plus Dante transport compatibility on the current firmware. Version negotiation does not test TLS/SNI filtering, HTTP/3 transfer, video playback or a QUIC DPI strategy. Permanent UDP support would require reviewed general public-destination UDP/reply policy, retained source/private-network restrictions, appropriate documentation, and separate QUIC acceptance tests. The TCP zapret strategy was unchanged.

A preliminary fallback search, begun after the first immediate mode-switch failure, found first-hand Dante+zapret use in [upstream discussion224](https://github.com/bol-van/zapret/discussions/224), and [ss-zapret2](https://github.com/vernette/ss-zapret2) documents a containerized SOCKS/Shadowsocks+zapret2 setup. These are not local command-5 compatibility tests. Further replacement selection was unnecessary after the successful standard UDP round trip. Current [3proxy SOCKS source](https://raw.githubusercontent.com/3proxy/3proxy/master/src/socks.c) explicitly rejects commands outside1–3, so reports of 3proxy+zapret do not establish compatibility with command5.

## Permanent UDP enablement started — same day, 18:49 UTC onward

User authorized proceeding with standard UDP support, then explicitly requested removing the HTTP/3 diagnostic packages and skipping synthetic tests in favor of user-driven YouTube playback and log inspection.

- Added permanent Dante rules for router-source UDP association, public-destination UDP forwarding and replies to the router. Existing private/special destination blocks and router-only client ACL remain. Config validation passed and SIGHUP loaded the new rules without recreating containers.
- Enabled `interface Proxy0 proxy socks5-udp` at 18:49:17; confirmed running configuration true after settling. Logs subsequently show bidirectional UDP443 traffic to Google addresses. These generic sessions do not establish YouTube playback or HTTP/3 success.
- The installed host curl lacks HTTP/3. An isolated aioquic1.7.2 client and dependencies were downloaded under `/tmp` to prepare forced-HTTP/3 checks; no such test was run. At the user's request, removed the entire target directory, downloaded pip wheel and metadata, downloaded Dante source archive, and pip cache. Cache creation time and all cache file times confirmed it was newly created by this installation. No system Python package installation or service-image package changes were made.
- Read-only Dante1.4.2 source inspection before removing the archive confirmed per-datagram `rulespermit()` checks in `sockd/dante_udp.c`; the association rule does not automatically permit every subsequent destination.
- Automated HTTP/3, playback and further synthetic acceptance tests are explicitly deferred at the user's request. Continue with real user playback and bounded Dante logs. No QUIC zapret strategy has been added; TCP strategy remains unchanged. Changes are not yet committed/recreated.

## User playback regression — same day, approximately 18:54–18:56 UTC

User reported YouTube initially playing, then a playback error; screenshot timestamp21:56:21 Moscow. Safari console screenshot shows built-in player-control icon loading errors, source-map errors and CORS rejection of a Google `/pagead/1p-user-list/` redirect to google.ru. It does not show a failed media request. Do not attribute the playback error to these console messages without further evidence.

- Router standard UDP was confirmed enabled and a configuration-save command was acknowledged at approximately18:52 UTC. No QUIC modification was enabled.
- Bounded Dante logs correlate the playback window with seven Googlevideo UDP443 sessions receiving a combined9,144,483 payload bytes from212.188.7.12/.14/.16 and212.188.35.141/.142/.143/.145. RCI learned-domain data maps these endpoints to `*.googlevideo.com`.
- These associations closed at18:56:30–33 with `local client closed`, durations95–103s. No reset/timeout error was reported on those media associations. Do not infer normal playback completion or a specific QUIC failure from client closure alone.
- Some other Google UDP sessions had no replies, including four of five closed sessions to142.251.153.4 in18:54–18:56. One such session at18:56:34 sent4,638 payload bytes in four packets with no reply. Not sufficient to identify which browser request failed.
- Proxy CPU0.62%, memory43.88MiB; sidecar CPU0.13%, memory18.56MiB. Controller active; NFQUEUE pending0 and kernel/user drops0. No sidecar log entries in the requested20-minute window. No evidence of local resource exhaustion.
- Other timeout errors at the screenshot time targeted157.240.205.63, not the observed Googlevideo media endpoints.
- Asked user for the failed media request's hostname, protocol and status/error, excluding signed URL query strings. First filter attempt returned nothing; user spelled it `videoplaypack`. Clarified `videoplayback`, or `googlevideo`/media requests after opening Network and reloading. Browser HTTP/3 protocol and exact failure remain unconfirmed.

No synthetic requests, additional installations, strategy changes or service restarts were performed during this regression inspection.

### QUIC confirmation and additional transport faults — 18:59–19:01 UTC

User subsequently found response header `client-protocol: quic`, consistent with the observed media UDP443 sessions. This supports actual QUIC use during playback; it does not establish which exact request caused the error.

- At18:59:05 Dante logged `Message too long (delayed error)` for UDP forwarding to212.188.35.142:443. This is concrete packet-size/path-MTU evidence, not a generic DPI timeout.
- Read-only namespace `ip route get 212.188.35.142` at19:01 UTC reported cached path MTU1492, via192.168.1.1; namespace eth0 MTU1500. Authenticated router interface data reported PPPoE0 MTU1492 and Proxy0 MTU8500.
- Namespace UDP counters at19:00:37: InDatagrams24,027, InErrors1,343, RcvbufErrors1,343, OutDatagrams24,027, SndbufErrors0. Thus the earlier healthy NFQUEUE/low-CPU observations did not exclude UDP socket-buffer loss. Host receive default/max both212,992 bytes.
- A20-second passive follow-up had zero UDP traffic and zero new receive drops, so it does not quantify drop rate under ongoing playback. Current sockets had empty queues and no retained per-socket drops; sessions responsible for historical drops had already closed.
- No MTU or buffer tuning has been applied. Packet-size issues, UDP receive-buffer drops and unmodified QUIC/DPI are separate candidate contributors. Do not attribute the playback failure solely to DPI or claim that transport is loss-free.
