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

export interface TopicDetails {
  id: string;
  title: string;
  category: string;
  description: string;
  size: number;
  files: { name: string; size: number }[];
  registered: string;
  imageUrl: string | null;
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

  async function getTopicDetails(topicId: string): Promise<TopicDetails> {
    if (!cookie) {
      throw new Error('RUTRACKER_COOKIE not configured');
    }

    const response = await fetchWithMirrors(`/forum/viewtopic.php?t=${topicId}`);

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

    return parseTopicDetails(topicId, html);
  }

  function parseTopicDetails(topicId: string, html: string): TopicDetails {
    // Extract title from maintitle
    const titleMatch = html.match(/<a[^>]+id="topic-title"[^>]*>([^<]+)<\/a>/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract category/forum name
    const categoryMatch = html.match(/<a[^>]+class="[^"]*nav[^"]*"[^>]*href="viewforum\.php[^"]*"[^>]*>([^<]+)<\/a>/g);
    const category = categoryMatch && categoryMatch.length > 0
      ? categoryMatch[categoryMatch.length - 1].replace(/<[^>]+>/g, '').trim()
      : '';

    // Extract description from post body (first post)
    const postBodyMatch = html.match(/<div[^>]+class="[^"]*post_body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/td>/);
    let description = '';
    if (postBodyMatch) {
      // Clean up HTML: remove tags, decode entities, limit length
      description = postBodyMatch[1]
        .replace(/<var[^>]*class="postImg[^"]*"[^>]*title="([^"]*)"[^>]*><\/var>/g, '') // Remove images
        .replace(/<span[^>]*class="post-hr"[^>]*>.*?<\/span>/g, '\n---\n') // HR to separator
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '') // Remove remaining tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 2000); // Limit to 2000 chars
    }

    // Extract size from torrent info
    const sizeMatch = html.match(/<li>Размер:\s*<b>([^<]+)<\/b>/);
    let size = 0;
    if (sizeMatch) {
      const sizeStr = sizeMatch[1].trim();
      const sizeNum = parseFloat(sizeStr.replace(/,/g, '.').replace(/\s/g, ''));
      if (sizeStr.includes('GB') || sizeStr.includes('ГБ')) {
        size = Math.round(sizeNum * 1024 * 1024 * 1024);
      } else if (sizeStr.includes('MB') || sizeStr.includes('МБ')) {
        size = Math.round(sizeNum * 1024 * 1024);
      } else if (sizeStr.includes('KB') || sizeStr.includes('КБ')) {
        size = Math.round(sizeNum * 1024);
      }
    }

    // Extract file list from spoiler or post
    const files: { name: string; size: number }[] = [];
    const filesMatch = html.match(/<div[^>]+class="[^"]*sp-wrap[^"]*"[^>]*>[\s\S]*?<div[^>]+class="[^"]*sp-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (filesMatch) {
      const fileLines = filesMatch[1].split(/<br\s*\/?>/i);
      for (const line of fileLines) {
        const clean = line.replace(/<[^>]+>/g, '').trim();
        // Match pattern like "filename.mkv (1.5 GB)" or just "filename.mkv"
        const fileMatch = clean.match(/^(.+?)\s*(?:\((\d+(?:[.,]\d+)?)\s*(GB|MB|KB|ГБ|МБ|КБ|B)?\))?$/i);
        if (fileMatch && fileMatch[1] && fileMatch[1].includes('.')) {
          let fileSize = 0;
          if (fileMatch[2]) {
            const num = parseFloat(fileMatch[2].replace(',', '.'));
            const unit = (fileMatch[3] || '').toUpperCase();
            if (unit.includes('G')) fileSize = Math.round(num * 1024 * 1024 * 1024);
            else if (unit.includes('M')) fileSize = Math.round(num * 1024 * 1024);
            else if (unit.includes('K')) fileSize = Math.round(num * 1024);
            else fileSize = Math.round(num);
          }
          files.push({ name: fileMatch[1].trim(), size: fileSize });
        }
      }
    }

    // Extract registration date
    const regMatch = html.match(/<li>Зарегистрирован:\s*(?:<span[^>]*>)?([^<]+)/);
    const registered = regMatch ? regMatch[1].trim() : '';

    // Extract first image URL
    let imageUrl: string | null = null;
    const imgMatch = html.match(/<var[^>]+class="postImg[^"]*"[^>]*title="([^"]+)"[^>]*>/);
    if (imgMatch) {
      imageUrl = imgMatch[1];
    }

    return {
      id: topicId,
      title,
      category,
      description,
      size,
      files,
      registered,
      imageUrl,
    };
  }

  return {
    search,
    downloadTorrent,
    getTopicDetails,
  };
}

export type RutrackerService = ReturnType<typeof createRutrackerService>;
