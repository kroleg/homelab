#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm -v "$repo_root:/repo:ro" -w /repo node:24-alpine \
  node scripts/check-openapi-routes.mjs

docker run --rm -v "$repo_root:/repo:ro" -w /repo node:24-alpine \
  npm exec --yes --package=@redocly/cli@2 -- redocly lint --config=scripts/openapi-lint.yaml \
  dns-routes/src/openapi.json devices/src/openapi.json vpn-toggle/src/openapi.json
