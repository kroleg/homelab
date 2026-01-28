import type { Logger } from '../logger.ts';

export interface TorrentInfo {
  hash: string;
  name: string;
  progress: number;
  state: string;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  save_path: string;
}

const TorrentState = {
  Downloading: 'downloading',
  Seeding: 'seeding',
  Paused: 'paused',
  Queued: 'queued',
  Checking: 'checking',
  Error: 'error',
  Unknown: 'unknown',
} as const;

export type TorrentState = typeof TorrentState[keyof typeof TorrentState];

export function mapTorrentState(state: string): TorrentState {
  const stateMap: Record<string, TorrentState> = {
    downloading: TorrentState.Downloading,
    stalledDL: TorrentState.Downloading,
    forcedDL: TorrentState.Downloading,
    metaDL: TorrentState.Downloading,
    uploading: TorrentState.Seeding,
    stalledUP: TorrentState.Seeding,
    forcedUP: TorrentState.Seeding,
    pausedDL: TorrentState.Paused,
    pausedUP: TorrentState.Paused,
    queuedDL: TorrentState.Queued,
    queuedUP: TorrentState.Queued,
    checkingDL: TorrentState.Checking,
    checkingUP: TorrentState.Checking,
    checkingResumeData: TorrentState.Checking,
    error: TorrentState.Error,
    missingFiles: TorrentState.Error,
  };
  return stateMap[state] || TorrentState.Unknown;
}

export function createQBittorrentService(baseUrl: string, logger: Logger) {
  async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`;
    logger.debug(`qBittorrent request: ${options?.method || 'GET'} ${path}`);

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`qBittorrent API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text) return undefined as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  return {
    async listTorrents(): Promise<TorrentInfo[]> {
      return request<TorrentInfo[]>('/api/v2/torrents/info');
    },

    async getFreeSpace(): Promise<number> {
      const data = await request<{ server_state: { free_space_on_disk: number } }>('/api/v2/sync/maindata');
      return data.server_state.free_space_on_disk;
    },

    async addTorrent(torrentFile: Uint8Array, filename: string): Promise<void> {
      const formData = new FormData();
      const blob = new Blob([torrentFile as BlobPart], { type: 'application/x-bittorrent' });
      formData.append('torrents', blob, filename);

      await request('/api/v2/torrents/add', {
        method: 'POST',
        body: formData,
      });

      logger.info(`Added torrent: ${filename}`);
    },

    async addMagnet(magnetUrl: string): Promise<void> {
      const formData = new URLSearchParams();
      formData.append('urls', magnetUrl);

      await request('/api/v2/torrents/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      logger.info(`Added magnet link`);
    },

    async deleteTorrent(hash: string, deleteFiles: boolean = false): Promise<void> {
      const formData = new URLSearchParams();
      formData.append('hashes', hash);
      formData.append('deleteFiles', deleteFiles.toString());

      await request('/api/v2/torrents/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      logger.info(`Deleted torrent: ${hash}`);
    },

    async moveTorrent(hash: string, location: string): Promise<void> {
      const formData = new URLSearchParams();
      formData.append('hashes', hash);
      formData.append('location', location);

      await request('/api/v2/torrents/setLocation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      logger.info(`Moved torrent ${hash} to ${location}`);
    },

    async getTorrentFiles(hash: string): Promise<{ name: string }[]> {
      return request<{ name: string }[]>(`/api/v2/torrents/files?hash=${hash}`);
    },

    async renameTorrentFolder(hash: string, oldPath: string, newPath: string): Promise<void> {
      const formData = new URLSearchParams();
      formData.append('hash', hash);
      formData.append('oldPath', oldPath);
      formData.append('newPath', newPath);

      await request('/api/v2/torrents/renameFolder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      logger.info(`Renamed folder in torrent ${hash}: ${oldPath} -> ${newPath}`);
    },

    async getTorrentInfo(hash: string): Promise<TorrentInfo | undefined> {
      const torrents = await request<TorrentInfo[]>(`/api/v2/torrents/info?hashes=${hash}`);
      return torrents[0];
    },

    async setAutorunHook(hookUrl: string): Promise<void> {
      const formData = new URLSearchParams();
      formData.append('json', JSON.stringify({
        autorun_enabled: true,
        autorun_program: `curl -s -X POST "${hookUrl}/%I"`,
      }));

      await request('/api/v2/app/setPreferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      logger.info(`Set autorun hook to: ${hookUrl}/%I`);
    },
  };
}

export type QBittorrentService = ReturnType<typeof createQBittorrentService>;
