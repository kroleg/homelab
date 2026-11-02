# DNS Routes proxy selection and domain group labels

## Current result (2026-11-02)

Deployed on 2026-11-02 with `docker compose up -d --build --no-deps dns-routes`; only dns-routes was rebuilt and recreated. Domains view shows the assigned connection name alongside each group, falling back to `No interface`. Create/edit forms and bulk switching offer both Wireguard and Proxy connections and submit connection IDs.

## Request and verified cause

User requested policy names beside groups and reported that only WireGuard could be assigned. Source inspection confirmed that dns-routes requested `/interfaces` without types, while keenetic-api defaults that endpoint to `Wireguard` only. DNS route bindings reference connection interfaces, distinct from client IP policies. The UI now explicitly requests `types=Wireguard,Proxy`, also allowing proxy IDs to resolve to display names.

Submitting connection IDs avoids the backend's name lookup, which also defaults to WireGuard. No backend defaults or router configuration were changed.

## Validation and failed attempts

TypeScript check passed using the existing Docker image and locally mounted dependencies. All Pug templates compiled after fixing an initial use of nullish coalescing, which the Pug expression parser rejected. `git diff --check` passed. Host npm is unavailable, so validation used Docker. Post-deployment HTTP checks returned 200 for /health, /rules, /rules/create and /rules/list. Verified rendered Domains HTML includes `zapret proxy` and create form includes option value `Proxy0`. No live browser or router-write test performed.

Evidence: dns-routes/src/services/keenetic-client.ts, src/routes/rules.routes.ts, src/views/rules/{domains,list,_form}.pug; keenetic-api/src/routes/api.ts interface endpoint and services/keenetic.service.ts interface resolver, inspected 2026-11-02. Prior related context: keenetic-selective-proxy.md.
