import assert from 'node:assert/strict';
import fs from 'node:fs';

// This checks the literal Express registrations used by these three services.
// Parameter/response semantics still need review against the handler code.
const services = [
  { name: 'dns-routes', files: [['src/server.ts', ''], ['src/routes/rules.routes.ts', '/rules']], uiOnly: ['get /'] },
  { name: 'devices', files: [['src/server.ts', '']], uiOnly: ['get /', 'get /traffic'] },
  { name: 'vpn-toggle', files: [['src/server.ts', '']], uiOnly: ['get /'] },
];
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

for (const service of services) {
  const spec = JSON.parse(fs.readFileSync(`${service.name}/src/openapi.json`, 'utf8'));
  const routes = new Map();
  const duplicates = [];
  for (const [file, prefix] of service.files) {
    const source = fs.readFileSync(`${service.name}/${file}`, 'utf8');
    const pattern = /\b(?:app|router)\.(get|post|put|patch|delete|head|options)\(\s*(\[[^\]]+\]|'[^']+')(\s*,\s*requireAdmin)?/g;
    for (const match of source.matchAll(pattern)) {
      const paths = [...match[2].matchAll(/'([^']+)'/g)].map(path => path[1]);
      for (const path of paths) {
        const fullPath = (prefix && path === '/' ? prefix : prefix + path).replace(/:([A-Za-z0-9_]+)/g, '{$1}');
        const key = `${match[1]} ${fullPath}`;
        if (service.uiOnly.includes(key)) continue;
        if (routes.has(key)) { duplicates.push(key); continue; }
        routes.set(key, { admin: Boolean(match[3]) });
      }
    }
  }
  const documented = new Set();
  const operationIds = new Set();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      const key = `${method} ${path}`;
      assert(routes.has(key), `${service.name}: documented route does not exist: ${key}`);
      assert(operation.operationId, `${service.name}: operationId missing: ${key}`);
      assert(!operationIds.has(operation.operationId), `${service.name}: duplicate operationId: ${operation.operationId}`);
      operationIds.add(operation.operationId);
      assert.equal(operation['x-admin-required'] === true, routes.get(key).admin, `${service.name}: admin flag differs from first registered handler: ${key}`);
      documented.add(key);
    }
  }
  for (const key of routes.keys()) assert(documented.has(key), `${service.name}: undocumented route: ${key}`);
  console.log(`${service.name}: ${documented.size} operations match route registrations`);
  if (duplicates.length) console.log(`  Duplicate registrations (first handler documented): ${duplicates.join(', ')}`);
}
