# OpenAPI discovery for LAN API clients

## Current result (2026-11-02)

Added and deployed `GET /openapi.json` for dns-routes, devices and vpn-toggle. Specs live in each service's `src/openapi.json` and are served as JSON without an admin lookup. Root `AGENTS.md` lists the discovery URLs and requires spec updates in the same change/commit as API changes. No spec was added for Docker-internal keenetic-api; sessions in this monorepo can inspect its source.

The user's primary client is another Codex session. Hand-maintained OpenAPI JSON is used initially; comment-based generation was discussed but not introduced. Future shared runtime request/response schemas could support generation without duplicating parameter definitions in comments.

## Verified behavior and constraints

- Specs describe existing JSON APIs and form mutation actions; UI-only pages are excluded except DNS Routes list/edit forms needed to discover rule/connection IDs.
- Devices registers GET `/api/users` twice. The first handler requires admin status and returns enriched users; the later supposedly public handler is shadowed. The spec documents the first handler; runtime behavior was not changed.
- Devices admin access is IP-based and denial returns HTML 403 even on JSON endpoints. VPN Toggle also identifies the caller by IP and restricts admin-only policies; it does not accept a target MAC/IP in its policy JSON body.
- DNS Routes quick-add requires `Accept: application/json` for JSON responses. General rule editing remains form/redirect-based and bypasses quick-add duplicate checking.
- There is no standard bearer-token scheme for these services. Specs describe caller-based checks and mark protected Devices operations with `x-admin-required`.

## Validation and deployment evidence

All three services passed their typecheck scripts. `scripts/check-openapi.sh` passed OpenAPI validation using Redocly CLI and matched 43 operations against literal Express registrations (12 DNS Routes, 27 Devices, 4 VPN Toggle). The check catches missing/stale routes, duplicate operation IDs and incorrect Devices admin flags. It does not establish parameter/response semantic correctness; these were reviewed against handlers and storage/service types. The lint configuration permits 302-only successful form responses.

Deployed with `docker compose up -d --build --no-deps dns-routes devices vpn-toggle`. Retrieved all three specs through the local Traefik proxy with their configured Host headers; parsed JSON matched repository specs. DNS Routes initially returned 404 until its container health check became ready, then succeeded. No mutation calls were used for deployment verification.

User approved deployment and committing this work together with the preceding DNS Routes quick-add batch on 2026-11-02.
