type MLBGameLogSplit = {
  date?: string;
  stat?: {
    atBats?: number;
    hits?: number;
    homeRuns?: number;
    doubles?: number;
    triples?: number;
    baseOnBalls?: number;
    strikeOuts?: number;
    runs?: number;
    rbi?: number;
  };
};

type MLBGameLogResponse = {
  stats?: Array<{
    splits?: MLBGameLogSplit[];
  }>;
};

export interface RecentBatterGameLogSummary {
  gamesUsed: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  doubles: number;
  triples: number;
  extraBaseHits: number;
  walks: number;
  strikeOuts: number;
  runs: number;
  rbi: number;

  recentHardHitsProxy: number;
  recentExtraBaseHits: number;
  recentHrTrend: number;
  recentPowerScore: number;

  recentGamesWithHR: number;
  multiHRGamesLast30: number;
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

export async function fetchRecentBatterGameLogSummary(
  batterId: string,
  targetDate: string,
  options?: {
    season?: number;
    gamesBack?: number;
  }
): Promise<RecentBatterGameLogSummary> {
  const season = options?.season ?? getSeasonFromDate(targetDate);
  const gamesBack = options?.gamesBack ?? 10;

  const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=gameLog&season=${season}`;
  const json = await fetchJson<MLBGameLogResponse>(url);

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
    .sort((a, b) => b.normalizedDate.localeCompare(a.normalizedDate));

  const last10Games = priorGames.slice(0, gamesBack);
  const last30Games = priorGames.slice(0, 30);

  const totals = last10Games.reduce(
    (acc, game) => {
      const stat = game.stat ?? {};

      const atBats = safeNumber(stat.atBats);
      const hits = safeNumber(stat.hits);
      const homeRuns = safeNumber(stat.homeRuns);
      const doubles = safeNumber(stat.doubles);
      const triples = safeNumber(stat.triples);
      const walks = safeNumber(stat.baseOnBalls);
      const strikeOuts = safeNumber(stat.strikeOuts);
      const runs = safeNumber(stat.runs);
      const rbi = safeNumber(stat.rbi);

      acc.gamesUsed += 1;
      acc.atBats += atBats;
      acc.hits += hits;
      acc.homeRuns += homeRuns;
      acc.doubles += doubles;
      acc.triples += triples;
      acc.walks += walks;
      acc.strikeOuts += strikeOuts;
      acc.runs += runs;
      acc.rbi += rbi;

      return acc;
    },
    {
      gamesUsed: 0,
      atBats: 0,
      hits: 0,
      homeRuns: 0,
      doubles: 0,
      triples: 0,
      walks: 0,
      strikeOuts: 0,
      runs: 0,
      rbi: 0,
    }
  );

  const extraBaseHits = totals.doubles + totals.triples + totals.homeRuns;

  const gamesWithHR =
    last10Games.filter((game) => safeNumber(game.stat?.homeRuns) > 0).length;
  const multiHRGamesLast30 =
    last30Games.filter((game) => safeNumber(game.stat?.homeRuns) >= 2).length;

  const hitsPerGame = totals.gamesUsed > 0 ? totals.hits / totals.gamesUsed : 0;
  const xbhPerGame = totals.gamesUsed > 0 ? extraBaseHits / totals.gamesUsed : 0;
  const hrPerGame = totals.gamesUsed > 0 ? totals.homeRuns / totals.gamesUsed : 0;
  const hitRate = totals.atBats > 0 ? totals.hits / totals.atBats : 0;
  const xbhRate = totals.atBats > 0 ? extraBaseHits / totals.atBats : 0;

  const recentHardHitsProxy = Math.max(
    0,
    Math.min(25, totals.hits + extraBaseHits * 0.75)
  );

  const recentExtraBaseHits = Math.max(0, Math.min(20, extraBaseHits));

  const recentHrTrend = Math.max(
    0,
    Math.min(12, totals.homeRuns * 1.5 + xbhPerGame * 2)
  );

  const recentPowerScore = Math.max(
    0,
    Math.min(
      40,
      hrPerGame * 18 +
        xbhPerGame * 10 +
        hitRate * 25 +
        xbhRate * 40
    )
  );

  return {
    gamesUsed: totals.gamesUsed,
    atBats: totals.atBats,
    hits: totals.hits,
    homeRuns: totals.homeRuns,
    doubles: totals.doubles,
    triples: totals.triples,
    extraBaseHits,
    walks: totals.walks,
    strikeOuts: totals.strikeOuts,
    runs: totals.runs,
    rbi: totals.rbi,

    recentHardHitsProxy,
    recentExtraBaseHits,
    recentHrTrend,
    recentPowerScore,

    recentGamesWithHR: gamesWithHR / Math.max(1, last10Games.length),
    multiHRGamesLast30,
  };
}
