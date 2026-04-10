type MLBPitchingGameLogSplit = {
  date?: string;
  stat?: {
    inningsPitched?: string | number;
    homeRuns?: number;
    hits?: number;
    baseOnBalls?: number;
    strikeOuts?: number;
    battersFaced?: number;
    earnedRuns?: number;
  };
};

type MLBPitchingGameLogResponse = {
  stats?: Array<{
    splits?: MLBPitchingGameLogSplit[];
  }>;
};

export interface RecentPitcherFormSummary {
  gamesUsed: number;
  inningsPitched: number;
  homeRunsAllowed: number;
  hitsAllowed: number;
  walksAllowed: number;
  strikeOuts: number;
  battersFaced: number;
  earnedRuns: number;
  recentHrPer9: number;
  recentRiskScore: number;
}

function normalizeDateString(value: string): string {
  return value.slice(0, 10);
}

function getSeasonFromDate(value: string): number {
  const [year] = normalizeDateString(value).split('-').map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseInningsPitched(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return 0;

  const trimmed = value.trim();
  const parts = trimmed.split('.');
  const whole = Number(parts[0] ?? 0);
  const partial = Number(parts[1] ?? 0);

  if (!Number.isFinite(whole) || !Number.isFinite(partial)) return 0;

  // Baseball IP notation:
  // .0 = 0 outs, .1 = 1 out, .2 = 2 outs
  let partialInnings = 0;
  if (partial === 1) partialInnings = 1 / 3;
  if (partial === 2) partialInnings = 2 / 3;

  return whole + partialInnings;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function fetchRecentPitcherFormSummary(
  pitcherId: string,
  targetDate: string,
  options?: {
    season?: number;
    gamesBack?: number;
  }
): Promise<RecentPitcherFormSummary> {
  const season = options?.season ?? getSeasonFromDate(targetDate);
  const gamesBack = options?.gamesBack ?? 3;

  const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${season}`;
  const json = await fetchJson<MLBPitchingGameLogResponse>(url);

  const splits = json?.stats?.[0]?.splits ?? [];
  const target = new Date(`${normalizeDateString(targetDate)}T12:00:00Z`);

  const priorGames = splits
    .filter((split) => typeof split?.date === 'string')
    .map((split) => ({
      ...split,
      normalizedDate: normalizeDateString(String(split.date)),
    }))
    .filter((split) => {
      const splitDate = new Date(`${split.normalizedDate}T12:00:00Z`);
      return splitDate.getTime() < target.getTime();
    })
    .sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate))
    .slice(0, gamesBack);

  const totals = priorGames.reduce(
    (acc, game) => {
      const stat = game.stat ?? {};

      acc.gamesUsed += 1;
      acc.inningsPitched += parseInningsPitched(stat.inningsPitched);
      acc.homeRunsAllowed += safeNumber(stat.homeRuns);
      acc.hitsAllowed += safeNumber(stat.hits);
      acc.walksAllowed += safeNumber(stat.baseOnBalls);
      acc.strikeOuts += safeNumber(stat.strikeOuts);
      acc.battersFaced += safeNumber(stat.battersFaced);
      acc.earnedRuns += safeNumber(stat.earnedRuns);

      return acc;
    },
    {
      gamesUsed: 0,
      inningsPitched: 0,
      homeRunsAllowed: 0,
      hitsAllowed: 0,
      walksAllowed: 0,
      strikeOuts: 0,
      battersFaced: 0,
      earnedRuns: 0,
    }
  );

  const recentHrPer9 =
    totals.inningsPitched > 0
      ? (totals.homeRunsAllowed / totals.inningsPitched) * 9
      : 0;

  // Ranking-oriented risk score.
  // Higher = more HR-friendly recent form.
  const recentRiskScore = Math.max(
    0,
    Math.min(
      8,
      recentHrPer9 * 0.9 +
        totals.homeRunsAllowed * 0.6 +
        (totals.hitsAllowed / Math.max(1, totals.gamesUsed)) * 0.08 +
        (totals.walksAllowed / Math.max(1, totals.gamesUsed)) * 0.06
    )
  );

  return {
    gamesUsed: totals.gamesUsed,
    inningsPitched: totals.inningsPitched,
    homeRunsAllowed: totals.homeRunsAllowed,
    hitsAllowed: totals.hitsAllowed,
    walksAllowed: totals.walksAllowed,
    strikeOuts: totals.strikeOuts,
    battersFaced: totals.battersFaced,
    earnedRuns: totals.earnedRuns,
    recentHrPer9,
    recentRiskScore,
  };
}
