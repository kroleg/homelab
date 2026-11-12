# Keenetic overlapping DNS route precedence

## Conclusion

Read-only live diagnostics on 2026-11-06 (~15:56–16:04 UTC), KeeneticOS 5.1.8, show that new eligible Default-policy traffic to `108.156.22.12` selects **Wireguard1 (Lithuania)** before Proxy0 (zapret proxy). This is an inference from installed destination sets, marking rules, policy rules and routes, not a captured test flow. No router configuration, DNS cache, connection state or service configuration was changed; no test destination traffic was generated.

## Evidence

- `/rci/show/rc/object-group/fqdn`: domain-list3 is `zapret_default`, includes wheely.com; domain-list7 is `brawlstars`, includes supercell.com.
- `/rci/show/object-group/fqdn`: both enabled groups contain 108.156.22.12, learned respectively for cd.wheely.com and cdn.supercell.com. Reported TTL is 30 in both; update ages differ substantially. These diagnostic ages alone do not establish route expiration.
- `/rci/show/rc/dns-proxy/route`: enabled auto bindings domain-list7 → Wireguard1 and domain-list3 → Proxy0. Domain-list7 is seventh in the 13-element snapshot; domain-list3 is last. Indices are opaque identifiers, not numeric priorities.
- `/rci/show/ipset`: installed `_NDM_OGDN_4_@domain-list7` and `_NDM_OGDN_4_@domain-list3` destination sets both contain `108.156.22.12/32`.
- `/rci/show/netfilter`: mangle PREROUTING applies hotspot/client policy marking first, then enters `_NDM_DNSRT_PREROUTING_MANGLE` only for mark zero. That chain tests groups in the same order as the binding snapshot. Each group has MARK, CONNMARK SAVE, RETURN. Domain-list7 sets `0xffffac1` and returns before domain-list3, which would set `0xffffab2`. Earlier groups did not contain this exact /32 in the installed-set check.
- `/rci/show/ip/rule`: rule priority 132 maps displayed fwmark `0xffffac10/0xffffffff` to table 4115. Rule priority 116 maps `0xffffab20/0xffffffff` to table 4107. The router's rule output renders the marks shifted four bits relative to its netfilter/conntrack output; preserve this representation difference when parsing. The lower numeric rule priority for table 4107 does not win: its mark does not match the packet selected by domain-list7.
- `/rci/show/ip/route?table=4115`: installed default via Wireguard1, metric 1000, flags U, floating true. Table 4107 has a default via Proxy0 with the same metric. These are separate policy tables, not competing equal-prefix routes in one table.
- `/rci/show/interface/Wireguard1` and `/rci/show/interface/Proxy0`: both up/connected. Interface priorities 2047 and 1023 respectively are not the deciding comparison in the observed DNS marking chain.
- Plain `/rci/show/ip/route` returns the main table (10 entries, default PPPoE0), with no host route for the target. Its absence does not mean DNS routing is inactive.
- `/rci/show/ip/nat` and `/rci/show/ip/conntrack`: no exact 108.156.22.12 connection in the sampled snapshots. Proxy logs over the preceding 24 hours had no exact-IP hit; a similar address, 108.156.22.123, did appear and is not evidence for .12.

## Meaning and limits

On this firmware/configuration, first matching installed DNS destination-set rule wins for unmarked eligible traffic. Domain names themselves are not used to distinguish the two services once the destination IP overlaps. There is no observed intrinsic VPN-over-proxy class preference. The present ordering happens to provide VPN priority for this pair; it does not establish VPN priority across all groups or guarantee behavior after reordering/editing bindings.

Explicit client policies mark traffic before the DNS chain and can bypass it. Existing connections can retain saved marks. Consequently, reporting a winner for actual traffic also requires source/client policy and connection context. No packet capture or controlled session was performed; actual traversal of this target remains unverified.

The vendor DNS routing guide documents Default-policy eligibility and connected-interface requirements: https://support.keenetic.ua/extra/kn-1711/en/51150-dns-based-routes.html . The installed rules above are the direct evidence for cross-group precedence; do not generalize statements about multiple bindings for the same group to cross-group conflicts without examining installed rules.

## API gap

Source reviewed: `keenetic-api/src/services/keenetic.service.ts` and `src/routes/api.ts`.

- GET /api/dns-routes reads `show sc dns-proxy route`: configured bindings.
- GET /api/dns-learned-ips reads `show object-group fqdn`: learned membership.
- GET /api/routes reads `show sc ip route`: configured static routes, not live installed routes.
- GET /api/interfaces drops router priority and most diagnostic fields; connected state alone does not identify a winning path.

These endpoints can identify conflicting bindings and suggest a winner by list order, but cannot authoritatively report the installed winning interface. Missing read-only router queries are `/rci/show/netfilter` (effective first-match order and marks), `/rci/show/ipset` (installed membership), `/rci/show/ip/rule` (mark-to-table mapping), and `/rci/show/ip/route?table=<number>` (selected table's installed routes). For session evidence add `/rci/show/ip/conntrack` and interface-index mapping; packet capture would be stronger traversal evidence. No API change was requested or implemented.

## Unsuccessful diagnostics / next checks

`show/dns-proxy/route`, `show/dns-proxy/routes`, `show/ip/route/dns`, `show/ip/route/table`, and `show/ip/route-group` returned empty bodies and did not provide winner information. `show/ip/route?table=all` returned an error requiring a numeric table ID. Small guessed table IDs were empty; `show/ip/rule` provided the useful table IDs. Avoid treating empty unsupported-query output as absence of routing.

If actual traversal must be proven later, observe a naturally occurring or separately authorized fresh client flow to the exact IP, correlate its conntrack mark/output interface with the installed rules, and optionally capture packets. No such test was executed in this investigation.
