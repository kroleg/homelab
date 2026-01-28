import { describe, it, expect } from 'vitest';
import { extractShowName, extractSeasonFolder, extractFolderPath, isMultiSeason, normalizeSeasonFolder } from './folder-path.ts';

describe('extractShowName', () => {
  it('extracts English name from SERIAL format', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 3 / Серии: 1-12 из 12';
    expect(extractShowName(name)).toBe('ted-lasso');
  });

  it('extracts English name from non-SERIAL format', () => {
    const name = 'В лучшем мире / The Good Place / Сезон: 4 / Серии: 1-14';
    expect(extractShowName(name)).toBe('the-good-place');
  });

  it('handles movie without season', () => {
    const name = 'Начало / Inception / 2010';
    expect(extractShowName(name)).toBe('inception');
  });

  it('handles name with special characters', () => {
    const name = '[SERIAL] Офис / The Office (US) / Сезон: 1';
    expect(extractShowName(name)).toBe('the-office-us');
  });
});

describe('extractSeasonFolder', () => {
  it('returns Season XX for single season', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 3 / Серии: 1-12 из 12';
    expect(extractSeasonFolder(name)).toBe('Season 03');
  });

  it('returns null for multi-season', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 1-2 / Серии: 1-22';
    expect(extractSeasonFolder(name)).toBeNull();
  });

  it('returns null for movie without season', () => {
    const name = 'Начало / Inception / 2010';
    expect(extractSeasonFolder(name)).toBeNull();
  });

  it('pads single digit season numbers', () => {
    const name = 'Show / Show Name / Сезон: 1';
    expect(extractSeasonFolder(name)).toBe('Season 01');
  });

  it('handles double digit seasons', () => {
    const name = 'Show / Show Name / Сезон: 12';
    expect(extractSeasonFolder(name)).toBe('Season 12');
  });
});

describe('isMultiSeason', () => {
  it('returns true for season range', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 1-2 / Серии: 1-22';
    expect(isMultiSeason(name)).toBe(true);
  });

  it('returns false for single season', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 3 / Серии: 1-12 из 12';
    expect(isMultiSeason(name)).toBe(false);
  });

  it('returns false for movie without season', () => {
    const name = 'Начало / Inception / 2010';
    expect(isMultiSeason(name)).toBe(false);
  });
});

describe('normalizeSeasonFolder', () => {
  it('normalizes Russian "сезон 1"', () => {
    expect(normalizeSeasonFolder('сезон 1')).toBe('Season 01');
  });

  it('normalizes Russian "Сезон 2"', () => {
    expect(normalizeSeasonFolder('Сезон 2')).toBe('Season 02');
  });

  it('normalizes English "season 1"', () => {
    expect(normalizeSeasonFolder('season 1')).toBe('Season 01');
  });

  it('normalizes English "Season 01"', () => {
    expect(normalizeSeasonFolder('Season 01')).toBe('Season 01');
  });

  it('normalizes short format "s01"', () => {
    expect(normalizeSeasonFolder('s01')).toBe('Season 01');
  });

  it('normalizes short format "S1"', () => {
    expect(normalizeSeasonFolder('S1')).toBe('Season 01');
  });

  it('returns null for non-season folder', () => {
    expect(normalizeSeasonFolder('extras')).toBeNull();
  });

  it('returns null for show name folder', () => {
    expect(normalizeSeasonFolder('В лучшем мире')).toBeNull();
  });
});

describe('extractFolderPath (backwards compatibility)', () => {
  it('extracts English name and single season', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 3 / Серии: 1-12 из 12';
    expect(extractFolderPath(name)).toBe('ted-lasso/season-3');
  });

  it('extracts English name without season subfolder for multi-season', () => {
    const name = '[SERIAL] Тед Лассо / Ted Lasso / Сезон: 1-2 / Серии: 1-22';
    expect(extractFolderPath(name)).toBe('ted-lasso');
  });
});
