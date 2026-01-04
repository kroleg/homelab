import * as cheerio from 'cheerio';
import { logger } from '../logger.ts';

export interface CheckResult {
  found: boolean;
  error?: string;
}

export async function checkPage(url: string, searchText: string): Promise<CheckResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PageWatcher/1.0)',
      },
    });

    if (!response.ok) {
      return {
        found: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Get text content (removes scripts, styles, etc.)
    $('script, style, noscript').remove();
    const textContent = $('body').text();

    // Case-insensitive search
    const found = textContent.toLowerCase().includes(searchText.toLowerCase());

    logger.debug('Page checked', { url, found, searchText });

    return { found };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to check page', { url, error: message });
    return { found: false, error: message };
  }
}
