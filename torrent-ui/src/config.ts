export function loadConfig() {
  const port = parseInt(process.env.PORT || '3007');
  const logLevel = process.env.LOG_LEVEL || 'info';
  const qbittorrentUrl = process.env.QBITTORRENT_URL || 'http://localhost:8080';

  return {
    port,
    logLevel,
    qbittorrentUrl,
  };
}

export type Config = ReturnType<typeof loadConfig>;
