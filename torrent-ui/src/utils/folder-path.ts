export function extractShowName(torrentName: string): string {
  // Try to extract English name from patterns like "[SERIAL] Rus Name / Eng Name / ..." or "Rus Name / Eng Name"
  const parts = torrentName.split('/').map(p => p.trim());

  let engName = '';
  if (parts.length >= 2) {
    // Second part is usually the English name
    engName = parts[1];
  } else {
    engName = parts[0];
  }

  // Remove [SERIAL] or similar tags
  engName = engName.replace(/^\[.*?\]\s*/, '');

  // Convert to lowercase kebab-case
  return engName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Limit length
}

export function extractShowDisplayName(torrentName: string): string {
  // Extract readable English name (not kebab-case)
  const parts = torrentName.split('/').map(p => p.trim());

  let engName = '';
  if (parts.length >= 2) {
    engName = parts[1];
  } else {
    engName = parts[0];
  }

  // Remove [SERIAL] or similar tags
  engName = engName.replace(/^\[.*?\]\s*/, '');

  return engName.trim();
}

export function extractSeasonFolder(torrentName: string): string | null {
  // Check for season info: "Сезон: N" (single) vs "Сезон: N-M" (range)
  const seasonMatch = torrentName.match(/Сезон:\s*(\d+)(?:-(\d+))?/);
  if (seasonMatch && seasonMatch[1] && !seasonMatch[2]) {
    // Single season number - format as "Season 01"
    const seasonNum = parseInt(seasonMatch[1], 10);
    return `Season ${seasonNum.toString().padStart(2, '0')}`;
  }
  return null;
}

export function isMultiSeason(torrentName: string): boolean {
  // Check for season range: "Сезон: N-M"
  const seasonMatch = torrentName.match(/Сезон:\s*(\d+)-(\d+)/);
  return seasonMatch !== null;
}

export function normalizeSeasonFolder(folderName: string): string | null {
  // Match various season folder formats:
  // - "сезон 1", "Сезон 1", "СЕЗОН 1"
  // - "season 1", "Season 1", "SEASON 1"
  // - "season 01", "Season 01"
  // - "s01", "S01"
  const patterns = [
    /^[Сс]езон\s*(\d+)$/i,
    /^season\s*(\d+)$/i,
    /^s(\d+)$/i,
  ];

  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match && match[1]) {
      const seasonNum = parseInt(match[1], 10);
      return `Season ${seasonNum.toString().padStart(2, '0')}`;
    }
  }
  return null;
}

// Keep for backwards compatibility
export function extractFolderPath(torrentName: string): string {
  const showName = extractShowName(torrentName);
  const seasonFolder = extractSeasonFolder(torrentName);
  if (seasonFolder) {
    // For backwards compat, still use kebab-case season format
    const seasonMatch = torrentName.match(/Сезон:\s*(\d+)/);
    if (seasonMatch) {
      return `${showName}/season-${seasonMatch[1]}`;
    }
  }
  return showName;
}
