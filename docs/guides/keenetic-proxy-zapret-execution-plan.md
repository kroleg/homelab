# Execution plan: Keenetic selective routing through a Linux proxy with Zapret2

Give this document and the referenced implementation to an execution agent. Implement, validate and document the result; do not stop at a proposal. Treat the reference strategy as an ISP-specific starting point, not a universal bypass. Inspect every newly introduced executable/script/build recipe before executing it or delegating its execution. No TLS interception, credentials in logs, broad firewall changes, or silent router changes.

## 1. Establish the environment and allowed changes

- Read applicable repository instructions and deployment documentation. Consult existing investigation records before repeating experiments. Preserve unrelated working-tree edits; never commit them into this integration.
- Inventory Compose services, host interfaces, LAN/DHCP ranges, router clients and connection policies, DNS routing groups, firewall tables/marks/queues, DNS resolvers, and IPv6 connectivity. Read credentials privately through the project's existing mechanism.
- Inspect any prior proxy containers, images or directories and report them before replacing anything. Confirm the selected LAN IP is outside DHCP and unused in client records and ARP checks; offline static allocations require operator confirmation if inventory is incomplete.
- Record these inputs before edits: project root; parent NIC; LAN subnet/gateway; proxy IP/MAC; router source IP; dedicated Dante/engine UIDs; unused NFQUEUE number and mark bits; tested source commit/hash; baseline test targets; authorized router changes. Discover values from the deployment rather than asking for facts already available.

Reference deployment values: parent `enp1s0`, LAN `192.168.1.0/24`, gateway/router `192.168.1.1`, proxy `192.168.1.250`, MAC `02:42:c0:a8:01:fa`, SOCKS TCP1080; Dante UID1080, engine UID1081; queue24080; generated-packet mark `0x40000000`, connection mark `0x20000000`. Adapt all corresponding Compose, Dante and controller values together. Do not assume these addresses are available on another network.

## 2. Establish a working proxy before packet processing

- Use the project's Compose mechanism. Give Dante a dedicated macvlan LAN identity, read-only config/root filesystem, required tmpfs directories, bounded connection logs and a restart policy. Restrict SOCKS clients to the router's actual source IP and block private/special destination networks. Begin with TCP CONNECT and no publicly exposed listener. Document whether authentication is used; the reference relies on its router-only ACL.
- Use the router as the container's DNS resolver. A macvlan container cannot directly reach the host's parent-interface IP; do not point it at a host-bound resolver without providing a deliberate reachable path. Do not add a host shim solely for diagnostics.
- Keep the main server's existing Default/VPN routing. Register only the new proxy MAC/IP in an ISP-only router policy that excludes VPN and proxy interfaces. A gateway pointing at the router does not by itself prove ISP egress.
- Configure the router's SOCKS connection to the dedicated proxy endpoint. Keep global connection priorities unchanged. For selective routing, use clients in Default with DNS through the router; for a whole-device test, use a temporary policy containing only the proxy connection. Preserve other clients' policies.
- Select a neutral HTTPS domain and check all its learned IPs against every other enabled DNS-routing group. Shared CDN IPs can cause competing routes; avoid them in controlled tests. Add the domain before deliberately resolving it, allow propagation, then inspect `show object-group fqdn` (RCI `/rci/show/object-group/fqdn`). Learned addresses are not proof that forwarding rules were installed or used.
- Prove router→SOCKS→destination traversal from connection logs/counters and real data transfer. Check unselected traffic and the configured outage fallback. Prefer fail-closed behavior for the controlled test. If the operator defers a check, record it as unverified rather than treating it as passed.
- Record endpoint, policy identities, logs and rollback. Do not add permanent test domains, test source ACL exceptions, diagnostic packages or alternate proxy deployments. Remove agent-added temporary test includes after the experiment, preserving operator changes.

## 3. Audit and integrate the engine without widening interception

- Research maintained upstream Linux Zapret2: [repository](https://github.com/bol-van/zapret2), [manual](https://github.com/bol-van/zapret2/blob/master/docs/manual.en.md). Prefer nfqws2 unless a concrete compatibility issue requires nfqws. Inspect source/build steps before compilation or execution; do not run upstream installers or discovery tools that alter the live firewall.
- Pin a source commit and archive checksum, base image digest, and matching Lua modules. Review networking destinations, subprocess execution, file access, privilege changes, Lua loading and startup scripts. Record findings and limits: a static review is not proof of safety or an independent audit of the compiler/OS dependency chain.
- Reference source: commit `f924d796b49da9e455c6bb09268298ef1471cd74`, archive SHA256 `37b6c71ae5249345b6ba762efe47ef6a9a7391321d1c80306775ca795e3c0d79`. It is known to build on Debian bookworm/x86_64; verify recipient architecture/dependencies rather than downloading an arbitrary prebuilt image.
- Use an optional Compose sidecar sharing only the proxy's network namespace. Do not use host networking, host root mounts, Docker socket mounts or privileged mode. Retain only capabilities required for NFQUEUE/raw sends, UID/GID/capability dropping and managing the engine child. Use a distinct engine UID and the upstream sandbox.
- Scope OUTPUT interception to the dedicated Dante UID, the macvlan egress interface, public IPv4 destinations and TCP443. Mark those connections and queue only their initial packets. If the chosen strategy requires replies, match only the tagged connections in PREROUTING; never queue all LAN replies. Confirm UID ownership and counters before enabling modifications.
- Use a dedicated owned nftables table, an unused queue, explicit generated-packet mark exclusion and any upstream-required early `notrack` rule for generated packets. Account for NAT and hook ordering; this macvlan reference has no Docker bridge SNAT between proxy and router. Never flush or modify unrelated host/Docker tables. Enable conntrack accounting only in the proxy namespace when packet-count rules require it.
- Keep one active strategy file. Do not maintain a second hostname list in nfqws2: Keenetic handles domain selection, while the engine processes eligible proxy connections regardless of hostname. Keep temporary experimental variants outside the production tree; retain their exact parameters/results in the case record.
- Start the engine and verify queue binding before atomically installing interception rules. On graceful stop, remove only the owned table before terminating the engine. With no listener, queue bypass must preserve proxy-only forwarding. Detect dead/stopped engines and a persistently backed-up queue, remove interception and remain degraded until restarted. The controller must not depend on a public test website.
- Recreate the sidecar whenever its proxy namespace is replaced. Confirm coordinated restart/recreate behavior on the installed Compose version; dependency declarations alone are not test evidence.

Reference strategy (ISP-specific; test it):

```text
--debug=0
--filter-tcp=443
--filter-l7=tls
--payload=tls_client_hello
--lua-desync=fake:blob=fake_default_tls:tcp_md5:repeats=6
--lua-desync=multidisorder:pos=1,midsld
```

## 4. Validate through the actual path

- Record proxy-only results before packet processing. Use fresh connections and explicit timeouts. Test IPv4 and TLS1.2/TLS1.3, report server/client limitations, and include a neutral control destination.
- First use a reviewed pass-through diagnostic configuration or counters to prove NFQUEUE delivery. A direct request from another UID in the same namespace must not increment the queue; Dante traffic must. Check generated-packet counters without recursive queue growth.
- Compare candidate strategies off/on/off with repeated trials through SOCKS or a verified router proxy route. Retain status, byte count, elapsed time, throughput and active/degraded state. A response during fail-open transition does not prove bypass success.
- YouTube acceptance includes a real video response from a `*.googlevideo.com` server with transferred video bytes, not just a homepage, redirect or thumbnail. Check `ytimg.com` and `ggpht.com` assets too. For an exact comparison, retain the same short-lived media URL privately in memory across off/on/off tests; do not log signed query strings, browser cookies or credentials. Inspect any extractor and avoid executing unaudited player JavaScript.
- Test normal stop/start, engine kill, engine stop/hang, and proxy namespace replacement. Verify table removal, degraded state and continuing proxy-only forwarding. A source ACL denial must persist after restart. State explicitly that a paused entire supervisor/container is a different fault from a stopped child engine; do not claim coverage without testing it.
- Handle IPv6, QUIC and Discord voice separately. The reference processes only IPv4 TCP443. Establish end-to-end Keenetic SOCKS UDP support before any UDP strategy. Do not claim IPv6 or UDP bypass based on learned DNS addresses.
- If no strategy succeeds reliably, stop packet processing, retain the working proxy and report the measured failures. Do not silently broaden host interception, change WAN policies or install TLS interception.

## 5. Deliver a reviewable production change

- Keep runtime code, one strategy, operating instructions, source review and the investigation record. Remove disposable scripts, alternative strategies, diagnostic image dependencies and temporary source ACLs. Preserve meaningful failures and exact tested strategy parameters in prose/evidence.
- Document all files changed, source/hash, traffic scope, privileges, limitations, DNS/policy arrangement, start/status/logs/rollback commands and how to recreate shared namespaces.
- Run configuration/static checks and the behavioral acceptance checks appropriate to the actual changes. Check for secrets and unrelated diffs. Distinguish executed changes, operator reports, hypotheses and deferred checks.
- Follow the recipient's commit/deployment approval preferences. If commit approval is required, leave a concrete validated diff uncommitted and summarize it. Never push, change router settings, or message other people without authorization.
