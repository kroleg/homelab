export function loadConfig() {
  const port = parseInt(process.env.PORT || '3007');
  const logLevel = process.env.LOG_LEVEL || 'info';
  const qbittorrentUrl = process.env.QBITTORRENT_URL || 'http://localhost:8080';
  // URL that qBittorrent uses to reach torrent-ui (for completion hook)
  const selfUrl = process.env.SELF_URL || `http://torrent-ui:${port}`;
  const keeneticApiUrl = process.env.KEENETIC_API_URL || 'http://keenetic-api:3000';

  const rutrackerCookie = process.env.RUTRACKER_COOKIE || '';
  // Download limit for non-admin users in bytes (default 1GB)
  const userDownloadLimitGB = parseFloat(process.env.USER_DOWNLOAD_LIMIT_GB || '1');
  const userDownloadLimit = userDownloadLimitGB * 1024 * 1024 * 1024;

  return {
    port,
    logLevel,
    qbittorrentUrl,
    selfUrl,
    keeneticApiUrl,
    rutrackerCookie,
    userDownloadLimit,
    userDownloadLimitGB,
  };
}

export type Config = ReturnType<typeof loadConfig>;
