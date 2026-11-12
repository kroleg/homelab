# DNS Routes quick-add and domain moves

## Request and implementation (2026-11-02)

The user approved the deployed default Rules tab and live domain search; committed as `8d26806`. The next batch adds quick-add buttons for `_default` and `zapret_default` on both tabs, duplicate errors across all groups, and an explicit move option.

`POST /rules/quick-add` accepts JSON or form data: `domain`, optional `group` (defaults to `_default`), and optional `move=true`. JSON callers should send `Accept: application/json`. Duplicates return HTTP 409 with `error` and `groups`; HTML callers get a conflict page with a Move button. Comparison ignores case and a trailing dot; subdomains remain distinct entries. Missing `zapret_default` is an error because its intended connection cannot be inferred. A missing `_default` retains the existing creation behavior.

Moves save the destination first, then remove matches from all other groups while retaining unrelated domains, connections, and enabled status. Quick-add operations are serialized within the service process. Other router clients and ordinary edit forms are outside this queue. Router updates are not transactional: failed source removal reports HTTP 502 with the partial result and retry instructions. A failed destination write does not start source removal.

## Verified API constraint and validation

Source inspection found that `PUT /api/dns-rules/:listId` rejected empty address arrays even though `setDnsDomainList` can submit them. Updated PUT validation to permit an empty list, preserving the source group and connection when its last domain moves. Creation still requires at least one domain. Deleting empty groups was considered and rejected to retain connection settings.

Typechecks passed for dns-routes and keenetic-api. All Pug views compiled. Eight mocked quick-add tests cover duplicates, normalization, both destinations, moves, empty groups, failure behavior, concurrent requests, and HTML/JSON responses. A mocked Keenetic API test confirms empty-list PUT preserves the route and POST still rejects empty lists. No test wrote domains to the live router. Actual router acceptance of an empty list remains unverified; an upstream rejection is reported as a partial move rather than success.

Evidence: `dns-routes/src/services/quick-add.ts`, `dns-routes/test/quick-add.test.ts`, `keenetic-api/src/routes/api.ts`, `keenetic-api/src/services/keenetic.service.ts`, and `keenetic-api/test/dns-rules.test.ts`, inspected/tested 2026-11-02.

## Deployment

Deployed both services with `docker compose up -d --build --no-deps keenetic-api dns-routes` on 2026-11-02. The reverse proxy initially returned 404 while container health checks were starting; after readiness, `/rules` returned the new quick-add buttons. Posting an existing domain without `move` returned HTTP 409 and a JSON response identifying its groups; no router write was triggered by this check. User approved deployment and committing batch two together with API discovery on 2026-11-02.
