export type SeasonSampleWeights = Record<string, number>;

export const DEFAULT_SEASON_SAMPLE_WEIGHTS: SeasonSampleWeights = {
  '2026': 1.0,
  '2025': 0.65,
  '2024': 0.4,
};

export function normalizeSeasonSampleWeights(
  weights?: SeasonSampleWeights
): SeasonSampleWeights {
  const merged: SeasonSampleWeights = {
    ...DEFAULT_SEASON_SAMPLE_WEIGHTS,
  };

  if (!weights) {
    return merged;
  }

  for (const [season, value] of Object.entries(weights)) {
    const normalizedSeason = season.trim();
    if (!normalizedSeason) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    merged[normalizedSeason] = value;
  }

  return merged;
}

export function parseSeasonSampleWeights(
  input: unknown
): SeasonSampleWeights | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }

  const parsedEntries = Object.entries(input).flatMap(([season, value]) => {
    if (typeof value === 'number') {
      return [[season, value] as const];
    }

    if (typeof value === 'string') {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        return [[season, numericValue] as const];
      }
    }

    return [];
  });

  if (parsedEntries.length === 0) {
    return undefined;
  }

  return normalizeSeasonSampleWeights(Object.fromEntries(parsedEntries));
}

export function parseSeasonSampleWeightsFromString(
  input?: string | null
): SeasonSampleWeights | undefined {
  if (!input) return undefined;

  const entries = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.includes('=') ? '=' : ':';
      const [season, rawValue] = part.split(separator).map((item) => item.trim());
      const value = Number(rawValue);

      if (!season || !Number.isFinite(value) || value <= 0) {
        return [];
      }

      return [[season, value] as const];
    });

  if (entries.length === 0) {
    return undefined;
  }

  return normalizeSeasonSampleWeights(Object.fromEntries(entries));
}

export function getSeasonFromGameDate(gameDate: string): string {
  return gameDate.slice(0, 4);
}

export function getSeasonSampleWeight(
  gameDate: string,
  weights?: SeasonSampleWeights
): number {
  const season = getSeasonFromGameDate(gameDate);
  const normalizedWeights = normalizeSeasonSampleWeights(weights);
  return normalizedWeights[season] ?? 1;
}

export function areSeasonSampleWeightsEqual(
  left?: SeasonSampleWeights,
  right?: SeasonSampleWeights
): boolean {
  const normalizedLeft = normalizeSeasonSampleWeights(left);
  const normalizedRight = normalizeSeasonSampleWeights(right);
  const seasons = [...new Set([...Object.keys(normalizedLeft), ...Object.keys(normalizedRight)])];

  return seasons.every((season) => normalizedLeft[season] === normalizedRight[season]);
}

export function serializeSeasonSampleWeights(weights?: SeasonSampleWeights): string {
  const normalizedWeights = normalizeSeasonSampleWeights(weights);

  return Object.keys(normalizedWeights)
    .sort()
    .map((season) => `${season}:${normalizedWeights[season]}`)
    .join(',');
}
