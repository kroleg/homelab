# Private MAC Wi-Fi captive portal

## Goal and current status

User wants devices joining existing home Wi-Fi to see instructions to disable private MAC addresses. The accepted rule is **router registration**, independent of private MAC bits. The eventual requirement is to block internet for unregistered clients. The user agreed to phone testing first and selected an iPhone.

**Current state (2026-11-08 17:08 UTC): deployed and ready for the iPhone test.** Commit `24b99ab` adds the dedicated portal and a narrow internal registration lookup endpoint. `keenetic-api` and `captive-portal` were rebuilt/recreated in dependency order and both report healthy. Only `captive.apple.com → 192.168.1.100` was added to Keenetic static DNS through authenticated RCI and configuration save was requested successfully. All other probe DNS overrides remain absent. Internet blocking remains off until the phone popup/local reachability test passes.

The user proposed overriding OS captive-check DNS names to homelab and having a dedicated service query keenetic-api. The proposed registered-client 404 response was corrected to the OS-specific successful probe response. User authorized implementation/deployment and the single Apple DNS override; broader blocking is deferred for the agreed initial phone test.

## Deployment verification

- Docker checks passed: portal typecheck, Pug compilation, seven HTTP/cache tests; Keenetic API typecheck and six tests, including registration endpoint validation and upstream errors. Repository OpenAPI route/lint checks passed for all three existing documented services.
- Live requests through Traefik identified the actual home-server caller as 192.168.1.100 with the expected registered MAC. Apple probe returned HTTP 200 and exact Success HTML. Portal rendered the registered state. No forwarded IP was spoofed for live checks.
- Before mutation, the router had five static DNS records and none for captive.apple.com. Added only that binding. `dig @192.168.1.1 captive.apple.com A` returned 192.168.1.100; the AAAA query returned no answer records.
- A separate real LAN request to portal.internal was logged with a different caller IP and `registered: true`. This verifies another source address survived forwarding; it does not establish successful popup behavior.
- Phone popup, disabling private MAC, automatic registration after reconnect, and internet denial/restoration remain unverified.
- Initial host dependency installation was a workflow mistake. Checks were subsequently performed in Docker. Initial portal tests failed because the fetch-based fixture did not preserve the requested Host header; switching the test fixture to native HTTP requests exercised the actual Host routing and all seven tests passed. No production handler was changed to bypass those failures.

Rollback: remove exactly the added record with `no ip host captive.apple.com 192.168.1.100`, then save configuration. Do not stop the portal while leaving its DNS override active. A scoped local authenticated rollback script also exists at `/tmp/captive-portal-apple-dns.sh rollback` (requires an active router session).

## Historical investigation

### Empty dark captive window after enabling blocking

User enabled No Internet for unregistered Home clients, forgot/rejoined Wi-Fi and reported an empty black captive window. Live read-only inspection confirmed Bridge0 default access is now deny; the iPhone's unregistered entry has access deny. Requests to the Apple probe from the unregistered phone still reach the portal. The cause of the empty captive window is not yet established.

The page has no external resources: CSS is inline, fonts are system fonts, and it has no scripts or images. Black was the explicitly configured background, not automatic appearance. Change requested: force a white/light page with dark text and readable controls. Add completion logging (host/path/status/response size) for all requests, including rejected paths, to diagnose the actual browser flow on retest. Do not claim the dark CSS explains missing text or that the empty-window issue is fixed without phone evidence.

### First iPhone test: popup displayed only Success

User reported that the captive popup appeared but displayed only “Success”. At 17:10:34 UTC the portal logged an Apple `/hotspot-detect.html` request from 192.168.1.108 as `registered: false`; the live router host entry independently confirmed an active unregistered locally administered MAC. No follow-up to portal.internal appeared in the request log. Thus registration misclassification is not supported by this evidence. The source of the displayed Success page and iOS's exact subsequent URL remain unconfirmed; logs did not capture requests rejected before identity lookup.

Targeted follow-up change: return the instructions HTML directly on intercepted probe URLs, eliminating the 302/second hostname hop, and handle probe-host roots for captive-browser revisits. Keep successful probe responses for registered clients. This is a proposed fix pending phone retest; do not report the popup content issue as solved based on server tests.

User additionally required all portal instructions and visible text to be in Russian. The Pug page already uses Russian; follow-up localizes 404/405 text, status lookup errors, and address labels too. OS connectivity success payloads remain byte-compatible (including Apple's `Success`); they are protocol responses, not translated portal copy. Router-reported device names are displayed verbatim.

Follow-up deployed as commit `be3951f` at approximately 17:16 UTC. Docker build passed typecheck, Pug compilation and all seven portal tests; only captive-portal was recreated and is healthy. Live requests through Traefik, without forged source headers, verified an unknown loopback caller receives HTTP 200 with Russian instructions directly on the Apple probe URL, while the registered home-server caller still receives the exact Apple Success body. Unknown page text is Russian. The immediate check during Traefik's provider refresh returned a transient 404; the subsequent check passed. A real iPhone retest remains required; no claim that the observed popup issue is resolved yet. DNS and blocking settings were not changed in this follow-up.

Screenshots were requested and then explicitly deferred by the user. No screenshots or external image dependencies were added to the portal.

After deployment of `be3951f`, the user reported that the iPhone test appears to work ("looks like it works"). Treat the instructions/popup behavior as user-reported success after the direct-HTML change. This does not verify private-address disable/reconnect auto-registration or internet denial/restoration. Internet blocking remains off; those are the remaining checks before enforcement rollout.

Read local session `dd7e1158-bd6f-4404-a923-b76e6b142d7d` and its plan `/home/kroleg/.claude/plans/delightful-noodling-toucan.md` on 2026-11-08. They describe a proposed DNS-proxy interception design; they do not establish a completed deployment.

Historical unresolved checks: real LAN client IP preservation through Docker DNS publishing; preserving router DNS-learned routes when clients change DNS; missing TCP DNS listener. The historical default was a probe-only reminder. Its proposed full DNS hijack also cannot enforce internet denial against direct IP connections or alternate DNS.

Do not repeat the assumption that DNS hijacking equals access enforcement. Do not claim a locally administered MAC proves the private-address setting is enabled: it is a heuristic and includes deliberately assigned addresses. Retain administrator exceptions for such cases.

## Verified findings (2026-11-08)

- Live read-only RCI inspection: Hopper KN-3811, release `5.01.C.8.0-2`. Bridge0 is Home at 192.168.1.1/24 and includes both primary Wi-Fi APs and a wired VLAN. No Chilli interface is configured. Home hotspot policy is permit; automatic registration reports `disable: false`. Bridge0 currently reports only a link-local IPv6 address; this alone does not verify every IPv6 egress path.
- Host snapshot includes registered locally administered MACs, including the wired homelab SOCKS proxy. Registration and private-MAC status are distinct criteria. Do not deny all locally administered hosts indiscriminately.
- Source inspection: `keenetic-api` reads router hosts; `/api/clients` filters registered clients, so a controller must include unregistered devices too. Router access writes are documented in `keenetic-api/Keenetic-Router-API-Reference.md`; a deny operation alone is not evidence of portal redirection.
- `dns-proxy` publishes TCP/UDP 53 and uses Cloudflare DoT by default in Compose. No portal service is present in this repository.
- Keenetic documents its captive portal as Coova-Chilli based, using UAM and RADIUS. Its segment documentation explicitly says the primary segment cannot enable captive portal through the web UI. This does **not** prove CLI setup on the primary segment is impossible or supported.
- The official OS 4.3 CLI reference documents Chilli MAC authentication, manual login via RADIUS, unauthenticated homepage redirection, and walled-garden configuration. Applicability to the installed router/version and IPv6 behavior remains unverified.

## Proposed, not executed

Prefer router-enforced captive access plus a locally hosted instructions page. Evaluate native Chilli with MAC authentication against a local RADIUS policy: hardware-address candidates may be authorized automatically; locally administered candidates remain captive. Test rejection-to-portal behavior and reconnect after disabling private MAC. Preserve existing access schedules and routing policies. No blanket permit of existing denied devices.

For the existing primary segment, establish supported native configuration before considering custom firewall interception. Both IPv4 and IPv6 paths, initial connection behavior, and portal reachability must be tested. A polling controller alone permits a startup window unless the router starts clients in a restricted state.

## Evidence and next checks

- [Keenetic captive portal](https://support.keenetic.com/titan/kn-1811/en/15226-captive-portal.html)
- [Keenetic segments, primary-segment UI restriction](https://support.keenetic.com/hero-4g-plus/kn-2311/en/14628-segments.html)
- [Official OS 4.3 CLI reference](https://storage.googleapis.com/docs.help.keenetic.com/cli/4.3/en/cli_manual_kn-3610.pdf), Chilli sections (MAC authentication and UAM).
- [Apple private Wi-Fi settings](https://support.apple.com/en-us/102509), including Off/Fixed/Rotating.

Next: resolve Wi-Fi topology, inspect installed router capabilities through the homelab's Keenetic integration, then prepare an isolated test before activating access denial on household clients.

## Revised proposal from user: DNS probe service

Override only known OS HTTP connectivity-check hostnames in Keenetic DNS to the homelab HTTP server. Traefik routes those Host headers to a dedicated service. Determine the actual requesting client IP via a trusted proxy configuration and query keenetic-api for its router identity, including unregistered hosts. Cache briefly; use `Cache-Control: no-store` for probe responses.

For allowed clients, return the probe's actual success response; 404 is not a success signal. Windows expects HTTP 200 with `Microsoft Connect Test`, Android commonly expects 204 with no body, Apple commonly expects the Success HTML. For restricted clients return a redirect to a dedicated instructions URL. Automatic popup behavior still requires real-phone testing; DNS overrides do not support impersonating third-party HTTPS endpoints.

DNS stays on Keenetic, preserving its DNS-based routing architecture. This differs from handing all LAN DNS to dns-proxy in the historical plan. Router-side Internet denial remains a separate necessary control and must leave local portal and DNS reachable. Registration-based permission would exempt registered private-MAC clients; explicit choice of rule is still needed.

References for probe behavior: [Microsoft NCSI FAQ](https://learn.microsoft.com/en-us/windows-server/networking/ncsi/ncsi-frequently-asked-questions), [AOSP NetworkMonitor](https://android.googlesource.com/platform/packages/modules/NetworkStack/+/refs/heads/main/src/com/android/server/connectivity/NetworkMonitor.java).
