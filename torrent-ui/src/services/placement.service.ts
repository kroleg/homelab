import type { Logger } from '../logger.ts';
import type { QBittorrentService, TorrentInfo } from './qbittorrent.service.ts';
import { extractShowDisplayName, extractSeasonFolder, isMultiSeason, normalizeSeasonFolder } from '../utils/folder-path.ts';

const TV_SHOWS_PATH = '/media/downloads/tv-shows';
const MOVIES_PATH = '/media/downloads/movies';

export interface TorrentPlacement {
  category: 'tv-shows' | 'movies';
  showName: string;
  savePath: string;           // Where the torrent should be saved
  contentFolder: string;      // What the root folder should be named
  seasonSubfolders: Map<string, string>;  // old -> new folder names for season normalization
  isMultiSeason: boolean;
}

export interface PlacementInfo {
  hash: string;
  name: string;
  currentPath: string;
  expectedPath: string;
  sampleFile: string;
  issue: string | null;  // null means correctly placed
}

interface TorrentFile {
  name: string;
  size: number;
}

/**
 * Determines the expected placement for a torrent based on its name and category.
 */
export function determinePlacement(
  torrentName: string,
  category: 'tv-shows' | 'movies',
  files: TorrentFile[]
): TorrentPlacement | null {
  const showName = extractShowDisplayName(torrentName);
  if (!showName) return null;

  const multiSeason = isMultiSeason(torrentName);
  const seasonFolder = extractSeasonFolder(torrentName);
  const categoryBasePath = category === 'tv-shows' ? TV_SHOWS_PATH : MOVIES_PATH;

  // Collect season subfolders that need normalization
  const seasonSubfolders = new Map<string, string>();

  if (multiSeason) {
    // Multi-season: save at category root, content folder = show name
    // Subfolders should be Season XX
    const subfolders = new Set<string>();
    for (const file of files) {
      const parts = file.name.split('/');
      if (parts.length >= 2) {
        subfolders.add(parts[1]);
      }
    }

    for (const subfolder of subfolders) {
      const normalized = normalizeSeasonFolder(subfolder);
      if (normalized && normalized !== subfolder) {
        seasonSubfolders.set(subfolder, normalized);
      }
    }

    return {
      category,
      showName,
      savePath: categoryBasePath,
      contentFolder: showName,
      seasonSubfolders,
      isMultiSeason: true,
    };
  } else if (category === 'tv-shows' && seasonFolder) {
    // Single season TV show: save at show folder, content folder = Season XX
    return {
      category,
      showName,
      savePath: `${categoryBasePath}/${showName}`,
      contentFolder: seasonFolder,
      seasonSubfolders,
      isMultiSeason: false,
    };
  } else {
    // Movie or TV show without season info: save at show folder
    return {
      category,
      showName,
      savePath: `${categoryBasePath}/${showName}`,
      contentFolder: showName,
      seasonSubfolders,
      isMultiSeason: false,
    };
  }
}

/**
 * Applies placement to a torrent - moves it and renames folders as needed.
 */
export async function applyPlacement(
  qbt: QBittorrentService,
  logger: Logger,
  hash: string,
  files: TorrentFile[],
  placement: TorrentPlacement
): Promise<void> {
  const rootFolder = files.length > 0 ? files[0].name.split('/')[0] : null;
  const hasFolder = rootFolder && rootFolder !== files[0]?.name;

  // Move torrent to the correct location
  await qbt.moveTorrent(hash, placement.savePath);

  // Rename root folder if needed
  if (hasFolder && rootFolder !== placement.contentFolder) {
    await qbt.renameTorrentFolder(hash, rootFolder, placement.contentFolder);
  }

  // Rename season subfolders if needed (for multi-season)
  for (const [oldName, newName] of placement.seasonSubfolders) {
    const oldPath = `${placement.contentFolder}/${oldName}`;
    const newPath = `${placement.contentFolder}/${newName}`;
    try {
      await qbt.renameTorrentFolder(hash, oldPath, newPath);
    } catch (e) {
      logger.warn(`Failed to rename subfolder ${oldPath}`, { error: e });
    }
  }
}

/**
 * Checks torrent placement and returns info with issue (or null if correct).
 */
export function checkPlacement(
  torrent: TorrentInfo,
  files: TorrentFile[],
  placement: TorrentPlacement
): PlacementInfo | null {
  if (files.length === 0) return null;

  const firstFilePath = files[0].name;
  const rootFolder = firstFilePath.split('/')[0];
  const hasFolder = rootFolder && rootFolder !== firstFilePath;

  let issue: string | null = null;

  // Check save path
  if (torrent.save_path !== placement.savePath) {
    issue = placement.isMultiSeason ? 'wrong_base_path' : 'wrong_show_path';
  }
  // Check root folder name
  else if (hasFolder && rootFolder !== placement.contentFolder) {
    issue = placement.isMultiSeason ? 'wrong_folder_name' : 'wrong_season_folder';
  }
  // Check season subfolders (for multi-season)
  else if (placement.seasonSubfolders.size > 0) {
    issue = 'wrong_season_folder';
  }

  const currentPath = torrent.save_path + (hasFolder ? `/${rootFolder}` : '');
  const expectedPath = `${placement.savePath}/${placement.contentFolder}`;
  const sampleFile = `${torrent.save_path}/${firstFilePath}`;

  return {
    hash: torrent.hash,
    name: torrent.name,
    currentPath,
    expectedPath,
    sampleFile,
    issue,
  };
}

export function createPlacementService(qbt: QBittorrentService, logger: Logger) {
  return {
    determinePlacement,

    async applyPlacement(hash: string, placement: TorrentPlacement): Promise<void> {
      const files = await qbt.getTorrentFiles(hash);
      return applyPlacement(qbt, logger, hash, files, placement);
    },

    async getPlacementInfo(torrent: TorrentInfo): Promise<PlacementInfo | null> {
      // Only check torrents in tv-shows folder for now
      if (!torrent.save_path.includes('/tv-shows')) {
        return null;
      }

      const files = await qbt.getTorrentFiles(torrent.hash);
      if (files.length === 0) return null;

      const seasonFolder = extractSeasonFolder(torrent.name);
      if (!isMultiSeason(torrent.name) && !seasonFolder) {
        // No season info, can't determine expected placement
        return null;
      }

      const placement = determinePlacement(torrent.name, 'tv-shows', files);
      if (!placement) return null;

      return checkPlacement(torrent, files, placement);
    },

    async getAllPlacements(): Promise<{ misplaced: PlacementInfo[]; correct: PlacementInfo[] }> {
      const torrents = await qbt.listTorrents();
      const misplaced: PlacementInfo[] = [];
      const correct: PlacementInfo[] = [];

      for (const torrent of torrents) {
        const info = await this.getPlacementInfo(torrent);
        if (info) {
          if (info.issue) {
            misplaced.push(info);
          } else {
            correct.push(info);
          }
        }
      }

      return { misplaced, correct };
    },

    async fixPlacement(hash: string): Promise<void> {
      const torrent = await qbt.getTorrentInfo(hash);
      if (!torrent) {
        throw new Error('Torrent not found');
      }

      if (!torrent.save_path.includes('/tv-shows')) {
        throw new Error('Torrent is not in tv-shows folder');
      }

      const files = await qbt.getTorrentFiles(hash);
      const placement = determinePlacement(torrent.name, 'tv-shows', files);
      if (!placement) {
        throw new Error('Could not determine placement');
      }

      await applyPlacement(qbt, logger, hash, files, placement);
      logger.info(`Fixed placement for torrent: ${torrent.name}`);
    },
  };
}

export type PlacementService = ReturnType<typeof createPlacementService>;
