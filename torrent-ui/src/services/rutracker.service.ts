import iconv from 'iconv-lite';
import type { Logger } from '../logger.ts';

export interface SearchResult {
  id: string;
  title: string;
  size: number;
  seeds: number;
  leeches: number;
  pubDate: number;
}

const MIRRORS = ['https://rutracker.org', 'https://rutracker.net', 'https://rutracker.nl'];

export function createRutrackerService(cookie: string, logger: Logger) {
  let baseUrl = MIRRORS[0];

  if (!cookie) {
    logger.warn('RUTRACKER_COOKIE not set — search will not work');
  }

  async function fetchWithMirrors(path: string, options?: RequestInit): Promise<Response> {
    let lastError: Error | null = null;

    for (const mirror of MIRRORS) {
      try {
        const url = `${mirror}${path}`;
        const response = await fetch(url, {
          ...options,
          redirect: 'manual',
          headers: {
            ...options?.headers,
            Cookie: `bb_session=${cookie}`,
          },
        });
        baseUrl = mirror;
        return response;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Mirror ${mirror} failed: ${(error as Error).message}`);
      }
    }

    throw lastError || new Error('All mirrors failed');
  }

  async function search(query: string): Promise<SearchResult[]> {
    if (!cookie) {
      throw new Error('RUTRACKER_COOKIE not configured');
    }

    const encodedQuery = encodeURIComponent(query);
    const response = await fetchWithMirrors(`/forum/tracker.php?nm=${encodedQuery}`);

    // Check for redirect to login page (invalid/expired cookie)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      if (location.includes('login.php')) {
        throw new Error('Сессия RuTracker истекла — обновите RUTRACKER_COOKIE');
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const html = iconv.decode(buffer, 'win1251');

    if (html.includes('login-form-full') || html.includes('login_username')) {
      throw new Error('Сессия RuTracker истекла — обновите RUTRACKER_COOKIE');
    }

    return parseSearchResults(html);
  }

  function parseSearchResults(html: string): SearchResult[] {
    const results: SearchResult[] = [];

    // Match each result row in the tracker table
    const rowRegex = /<tr[^>]+class="tCenter\s+hl-tr"[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1];

      // Extract topic ID and title
      const topicMatch = row.match(/data-topic_id="(\d+)"/);
      const titleMatch = row.match(/<a[^>]+class="[^"]*tLink[^"]*"[^>]*>([\s\S]*?)<\/a>/);

      if (!topicMatch || !titleMatch) continue;

      const id = topicMatch[1];
      const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

      // Extract size in bytes
      const sizeMatch = row.match(/data-ts_text="(\d+)"/);
      const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

      // Extract seeds
      const seedsMatch = row.match(/<b\s+class="seedmed"[^>]*>(\d+)<\/b>/);
      const seeds = seedsMatch ? parseInt(seedsMatch[1]) : 0;

      // Extract leeches
      const leechMatch = row.match(/class="[^"]*leechmed[^"]*"[^>]*>(\d+)<\//);
      const leeches = leechMatch ? parseInt(leechMatch[1]) : 0;

      // Extract date (last data-ts_text in the row is the timestamp)
      const dateMatches = [...row.matchAll(/data-ts_text="(\d+)"/g)];
      const pubDate = dateMatches.length > 0 ? parseInt(dateMatches[dateMatches.length - 1][1]) : 0;

      results.push({ id, title, size, seeds, leeches, pubDate });
    }

    // Sort by seeds descending
    results.sort((a, b) => b.seeds - a.seeds);

    return results;
  }

  async function downloadTorrent(topicId: string): Promise<{ buffer: Buffer; filename: string }> {
    if (!cookie) {
      throw new Error('RUTRACKER_COOKIE not configured');
    }

    const response = await fetchWithMirrors(`/forum/dl.php?t=${topicId}`, {
      headers: {
        Referer: `${baseUrl}/forum/viewtopic.php?t=${topicId}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download torrent: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Try to get filename from Content-Disposition
    const disposition = response.headers.get('content-disposition');
    let filename = `${topicId}.torrent`;
    if (disposition) {
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
      if (filenameMatch) {
        filename = decodeURIComponent(filenameMatch[1].replace(/"/g, ''));
      }
    }

    return { buffer, filename };
  }

  return {
    search,
    downloadTorrent,
  };
}

export type RutrackerService = ReturnType<typeof createRutrackerService>;
