export function loadConfig() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const apiUrl = new URL(process.env.KEENETIC_API_URL || 'http://keenetic-api:3000/api/');
  if (!['http:', 'https:'].includes(apiUrl.protocol)) throw new Error('Invalid KEENETIC_API_URL');
  if (!apiUrl.pathname.endsWith('/')) apiUrl.pathname += '/';
  const portalUrl = new URL(process.env.PORTAL_URL || 'http://portal.internal/');
  if (!['http:', 'https:'].includes(portalUrl.protocol)) throw new Error('Invalid PORTAL_URL');
  return {
    port,
    apiUrl: apiUrl.href,
    portalUrl: portalUrl.href,
    logLevel: process.env.LOG_LEVEL || 'info',
    // Traefik runs on the host and reaches this container through a bridge gateway.
    trustedProxies: (process.env.TRUSTED_PROXIES || 'loopback').split(',').map(v => v.trim()).filter(Boolean),
  };
}
