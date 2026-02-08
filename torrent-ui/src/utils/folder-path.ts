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

  // If no slash separator (English-style name), extract show name from patterns like:
  // "The.Office.US.S02.WEB-DLRip" -> "The Office US"
  // "Breaking.Bad.S01E01.720p" -> "Breaking Bad"
  if (parts.length === 1) {
    // Remove quality/release info and season/episode patterns
    engName = engName
      .replace(/[._-]S\d{1,2}(?:E\d{1,2})?.*$/i, '')  // Remove .S02E01... or .S02...
      .replace(/[._-]\d{3,4}p.*$/i, '')               // Remove .720p... .1080p...
      .replace(/[._-](?:WEB|HDTV|BluRay|BDRip|DVDRip|WEBRip).*$/i, '')  // Remove release type
      .replace(/\./g, ' ')                            // Replace dots with spaces
      .replace(/_/g, ' ')                             // Replace underscores with spaces
      .trim();
  }

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

  // Check for English season patterns: S01, S02, etc. (but not S01E01 which indicates episodes)
  // Match .S02. or _S02_ or -S02- patterns (season only, not with episode)
  const engSeasonMatch = torrentName.match(/[._-]S(\d{1,2})(?:[._-]|$)(?!E\d)/i);
  if (engSeasonMatch && engSeasonMatch[1]) {
    const seasonNum = parseInt(engSeasonMatch[1], 10);
    return `Season ${seasonNum.toString().padStart(2, '0')}`;
  }

  return null;
}

export function extractSeasonNumber(torrentName: string): number | null {
  // Extract season number from various patterns
  const patterns = [
    /Сезон:\s*(\d+)/,           // Russian: Сезон: 1
    /[._-]S(\d{1,2})[._E-]/i,   // English: .S02. or .S02E
    /[._-]S(\d{1,2})$/i,        // English at end: .S02
    /Season\s*(\d+)/i,          // English word: Season 1
  ];

  for (const pattern of patterns) {
    const match = torrentName.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
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
