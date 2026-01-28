export function loadConfig() {
  const port = parseInt(process.env.PORT || '3007');
  const logLevel = process.env.LOG_LEVEL || 'info';
  const qbittorrentUrl = process.env.QBITTORRENT_URL || 'http://localhost:8080';
  // URL that qBittorrent uses to reach torrent-ui (for completion hook)
  const selfUrl = process.env.SELF_URL || `http://torrent-ui:${port}`;
  const keeneticApiUrl = process.env.KEENETIC_API_URL || 'http://keenetic-api:3000';

  return {
    port,
    logLevel,
    qbittorrentUrl,
    selfUrl,
    keeneticApiUrl,
  };
}

export type Config = ReturnType<typeof loadConfig>;
