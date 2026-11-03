# Keenetic API

Docker-internal REST wrapper for the router, listening on port 3000. Other services use `http://keenetic-api:3000/api`. It has no public discovery endpoint; consult the route handlers in this repository. Do not publish it on the LAN: existing mutation endpoints are trusted internal operations.

## Learned DNS addresses

`GET /api/dns-learned-ips` reads a fresh `/rci/show/object-group/fqdn` snapshot from Keenetic. It returns the router's `group` array, preserving native field names and any firmware-specific diagnostic fields. It does not modify router configuration or force DNS resolution. Responses use `Cache-Control: no-store`.

Optional `group` query parameter selects an exact group ID, such as:

```text
GET http://keenetic-api:3000/api/dns-learned-ips?group=domain-list2
```

The response is always an array on success; an unknown group or an empty router snapshot returns `[]`. Empty or repeated `group` parameters return HTTP400. Router failures or an unexpected snapshot structure return HTTP502 with a generic error; an unavailable snapshot must not be mistaken for an empty one.

Example excerpt (other router fields are retained):

```json
[
  {
    "group-name": "domain-list2",
    "enabled": true,
    "entry": [
      {
        "fqdn": "www.youtube.com",
        "type": "runtime",
        "parent": "youtube.com",
        "ipv4": [{ "address": "192.0.2.10", "ttl": 300, "last-updated": 5 }],
        "ipv6": []
      }
    ],
    "excluded-ipv4": [],
    "excluded-ipv6": [],
    "excluded-fqdns": []
  }
]
```

Addresses in the example are documentation placeholders. `ttl`, `last-updated`, deadlines, counters and exclusion lists are router-reported diagnostics, not recomputed values. Do not infer route installation, TTL freshness or actual traffic traversal from this snapshot alone. For interface bindings use `GET /api/dns-routes`; for configured domains and labels use `GET /api/dns-domain-lists`. Comparing the address sets across groups can reveal shared-CDN conflicts.

Validation: `npm run typecheck` and `node --test test/*.test.ts`.
