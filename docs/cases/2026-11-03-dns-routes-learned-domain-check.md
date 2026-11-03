# DNS Routes learned domain membership check

Implemented `GET /rules/domain-check?domain=example.com` (optional exact `group` ID override). Source inspection on 2026-11-03 confirmed keenetic-api returns native group arrays keyed by `group-name`, with entry FQDN/parent and IPv4/IPv6 address diagnostics. Existing keenetic-api changes were left intact.

Expected groups come from configured exact/ancestor domains; runtime entries match exact FQDN or parent. Each learned IP is compared against all runtime groups to expose missing memberships and shared-address conflicts, including unrelated FQDNs sharing CDN addresses. `correctGroup` checks membership only; disabled groups and route bindings are reported separately. Unknown/unconfigured groups cannot produce a successful membership result. Empty learning is distinct from upstream failures (HTTP 502). Reads do not force DNS resolution or modify router configuration. Separate upstream reads are not atomic.

Evidence: keenetic-api/README.md, keenetic-api/src/services/keenetic.service.ts, dns-routes/src/services/domain-check.ts, rules.routes.ts and openapi.json. No live router API calls or deployment performed for this change.

Validation in progress: production image lacks tsc; temporary development dependency installation used for checks. Initial OpenAPI checks caught a missing operationId and OpenAPI 3.0 nullable syntax; both corrected.

Final validation: clean temporary Node 24 container passed `npm run typecheck` and all 10 tests (including HTTP validation/error behavior). `./scripts/check-openapi.sh` passed route coverage and lint for all three service specs. `git diff --check` passed. The first temporary install copied existing pnpm node_modules and produced dependency warnings; it was stopped and replaced with a clean install containing only source, tests and package/tsconfig files.

## Readable group and connection names (2026-11-03)

The initial endpoint was deployed and verified live: youtube.com returned 438 addresses, correctGroup=true and no shared-group conflicts; the container became healthy. Initial reverse-proxy 404 responses during health startup cleared once healthy.

Requested addition: readable names alongside IDs. The endpoint now reads connection names through keenetic-api, adds groupName/interfaceName to bindings and groupName to native entries, includes parallel groupNames/missingGroupNames/unexpectedGroupNames on IP reports, and provides a top-level groups lookup covering expected and runtime groups. Unknown/blank names fall back to IDs. Wireguard/Proxy connections are distinct from client policies; no policy assignment is inferred. Existing fields and membership behavior are preserved. Tests cover named connections/groups and unknown-ID fallbacks.

Readable-name validation: typecheck, all 10 tests, OpenAPI route coverage/lint and diff whitespace checks passed before commit.
