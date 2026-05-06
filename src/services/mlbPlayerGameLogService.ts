type MLBGameLogSplit = {
  date?: string;
  isHome?: boolean;
  opponent?: {
    id?: number;
    abbreviation?: string;
    name?: string;
  };
  stat?: {
    atBats?: number;
    plateAppearances?: number;
    hits?: number;
    homeRuns?: number;
    doubles?: number;
    triples?: number;
    baseOnBalls?: number;
    strikeOuts?: number;
    runs?: number;
    rbi?: number;
    totalBases?: number;
    sacFlies?: number;
  };
};

type MLBGameLogResponse = {
  stats?: Array<{
    splits?: MLBGameLogSplit[];
  }>;
};

export interface BatterGameLogEntry {
  date: string;
  opponent: string;
  opponentId: string | null;
  isHome: boolean | null;
  plateAppearances: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  doubles: number;
  triples: number;
  totalBases: number;
  walks: number;
  strikeOuts: number;
  runs: number;
  rbi: number;
}

export interface BatterGameLogWindowSummary {
  gamesPlayed: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  doubles: number;
  triples: number;
  extraBaseHits: number;
  totalBases: number;
  walks: number;
  strikeOuts: number;
  runs: number;
  rbi: number;
  battingAverage: number | null;
  slugging: number | null;
  iso: number | null;
  hardHitProxy: number | null;
}

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

interface CachedGameLogPayload {
  fetchedAtMs: number;
  logs: BatterGameLogEntry[];
}

const GAME_LOG_CACHE_TTL_MS = 15 * 60 * 1000;

const globalCache = globalThis as typeof globalThis & {
  __mlbBatterGameLogCache?: Record<string, CachedGameLogPayload>;
};

if (!globalCache.__mlbBatterGameLogCache) {
  globalCache.__mlbBatterGameLogCache = {};
}

function normalizeDateString(value: string): string {
  return value.slice(0, 10);
}

function getSeasonFromDate(value: string): number {
  const [year] = normalizeDateString(value).split("-").map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundTo(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

function buildCacheKey(batterId: string, season: number): string {
  return `${season}:${batterId}`;
}

function sumTotalBases(game: MLBGameLogSplit["stat"]): number {
  if (!game) return 0;

  const explicitTotalBases = safeNumber(game.totalBases, -1);
  if (explicitTotalBases >= 0) {
    return explicitTotalBases;
  }

  const hits = safeNumber(game.hits);
  const doubles = safeNumber(game.doubles);
  const triples = safeNumber(game.triples);
  const homeRuns = safeNumber(game.homeRuns);
  const singles = Math.max(0, hits - doubles - triples - homeRuns);
  return singles + doubles * 2 + triples * 3 + homeRuns * 4;
}

function mapGameLogEntry(split: MLBGameLogSplit): BatterGameLogEntry | null {
  if (typeof split.date !== "string") {
    return null;
  }

  const stat = split.stat ?? {};
  const atBats = safeNumber(stat.atBats);
  const walks = safeNumber(stat.baseOnBalls);
  const plateAppearances = Math.max(
    atBats + walks,
    safeNumber(stat.plateAppearances),
  );

  return {
    date: normalizeDateString(split.date),
    opponent: split.opponent?.abbreviation ?? split.opponent?.name ?? "UNK",
    opponentId: split.opponent?.id != null ? String(split.opponent.id) : null,
    isHome: typeof split.isHome === "boolean" ? split.isHome : null,
    plateAppearances,
    atBats,
    hits: safeNumber(stat.hits),
    homeRuns: safeNumber(stat.homeRuns),
    doubles: safeNumber(stat.doubles),
    triples: safeNumber(stat.triples),
    totalBases: sumTotalBases(stat),
    walks,
    strikeOuts: safeNumber(stat.strikeOuts),
    runs: safeNumber(stat.runs),
    rbi: safeNumber(stat.rbi),
  };
}

function filterLogsBeforeTarget(
  logs: BatterGameLogEntry[],
  targetDate: string,
): BatterGameLogEntry[] {
  const target = new Date(`${normalizeDateString(targetDate)}T12:00:00Z`);

  return logs
    .filter((log) => {
      const logDate = new Date(`${log.date}T12:00:00Z`);
      return logDate.getTime() < target.getTime();
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeBatterGameLogWindow(
  logs: BatterGameLogEntry[],
  gamesBack: number,
): BatterGameLogWindowSummary {
  const window = logs.slice(0, Math.max(0, gamesBack));

  const totals = window.reduce(
    (accumulator, game) => {
      accumulator.gamesPlayed += 1;
      accumulator.plateAppearances += game.plateAppearances;
      accumulator.atBats += game.atBats;
      accumulator.hits += game.hits;
      accumulator.homeRuns += game.homeRuns;
      accumulator.doubles += game.doubles;
      accumulator.triples += game.triples;
      accumulator.totalBases += game.totalBases;
      accumulator.walks += game.walks;
      accumulator.strikeOuts += game.strikeOuts;
      accumulator.runs += game.runs;
      accumulator.rbi += game.rbi;
      return accumulator;
    },
    {
      gamesPlayed: 0,
      plateAppearances: 0,
      atBats: 0,
      hits: 0,
      homeRuns: 0,
      doubles: 0,
      triples: 0,
      totalBases: 0,
      walks: 0,
      strikeOuts: 0,
      runs: 0,
      rbi: 0,
    },
  );

  const extraBaseHits = totals.doubles + totals.triples + totals.homeRuns;
  const battingAverage =
    totals.atBats > 0 ? roundTo(totals.hits / totals.atBats) : null;
  const slugging =
    totals.atBats > 0 ? roundTo(totals.totalBases / totals.atBats) : null;
  const iso =
    battingAverage != null && slugging != null
      ? roundTo(slugging - battingAverage)
      : null;
  const hardHitProxy =
    totals.gamesPlayed > 0
      ? roundTo(
          Math.min(
            100,
            (extraBaseHits * 12 + totals.homeRuns * 8 + totals.hits * 2) /
              totals.gamesPlayed,
          ),
          1,
        )
      : null;

  return {
    ...totals,
    extraBaseHits,
    battingAverage,
    slugging,
    iso,
    hardHitProxy,
  };
}

export function summarizeBatterGameLogsByFilter(
  logs: BatterGameLogEntry[],
  predicate: (log: BatterGameLogEntry) => boolean,
  gamesBack?: number,
): BatterGameLogWindowSummary {
  const filtered = logs.filter(predicate);
  return summarizeBatterGameLogWindow(
    gamesBack != null ? filtered.slice(0, gamesBack) : filtered,
    gamesBack ?? filtered.length,
  );
}

export async function fetchBatterGameLogs(
  batterId: string,
  targetDate: string,
  options?: {
    season?: number;
  },
): Promise<BatterGameLogEntry[]> {
  const season = options?.season ?? getSeasonFromDate(targetDate);
  const cacheKey = buildCacheKey(batterId, season);
  const cached = globalCache.__mlbBatterGameLogCache?.[cacheKey];

  if (cached && Date.now() - cached.fetchedAtMs < GAME_LOG_CACHE_TTL_MS) {
    return filterLogsBeforeTarget(cached.logs, targetDate);
  }

  const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=gameLog&group=hitting&season=${season}`;
  const json = await fetchJson<MLBGameLogResponse>(url);
  const splits = json?.stats?.[0]?.splits ?? [];
  const mappedLogs = splits
    .map(mapGameLogEntry)
    .filter((entry): entry is BatterGameLogEntry => Boolean(entry))
    .sort((a, b) => b.date.localeCompare(a.date));

  globalCache.__mlbBatterGameLogCache![cacheKey] = {
    fetchedAtMs: Date.now(),
    logs: mappedLogs,
  };

  return filterLogsBeforeTarget(mappedLogs, targetDate);
}

export async function fetchRecentBatterGameLogSummary(
  batterId: string,
  targetDate: string,
  options?: {
    season?: number;
    gamesBack?: number;
  },
): Promise<RecentBatterGameLogSummary> {
  const gamesBack = options?.gamesBack ?? 10;
  const logs = await fetchBatterGameLogs(batterId, targetDate, options);
  const recentWindow = summarizeBatterGameLogWindow(logs, gamesBack);
  const last30Games = logs.slice(0, 30);

  const gamesWithHR = logs
    .slice(0, gamesBack)
    .filter((game) => game.homeRuns > 0).length;
  const multiHRGamesLast30 = last30Games.filter(
    (game) => game.homeRuns >= 2,
  ).length;
  const hrPerGame =
    recentWindow.gamesPlayed > 0
      ? recentWindow.homeRuns / recentWindow.gamesPlayed
      : 0;
  const xbhPerGame =
    recentWindow.gamesPlayed > 0
      ? recentWindow.extraBaseHits / recentWindow.gamesPlayed
      : 0;
  const hitRate =
    recentWindow.atBats > 0 ? recentWindow.hits / recentWindow.atBats : 0;
  const xbhRate =
    recentWindow.atBats > 0
      ? recentWindow.extraBaseHits / recentWindow.atBats
      : 0;

  const recentHardHitsProxy = Math.max(
    0,
    Math.min(25, recentWindow.hits + recentWindow.extraBaseHits * 0.75),
  );

  const recentExtraBaseHits = Math.max(
    0,
    Math.min(20, recentWindow.extraBaseHits),
  );
  const recentHrTrend = Math.max(
    0,
    Math.min(12, recentWindow.homeRuns * 1.5 + xbhPerGame * 2),
  );
  const recentPowerScore = Math.max(
    0,
    Math.min(
      40,
      hrPerGame * 18 + xbhPerGame * 10 + hitRate * 25 + xbhRate * 40,
    ),
  );

  return {
    gamesUsed: recentWindow.gamesPlayed,
    atBats: recentWindow.atBats,
    hits: recentWindow.hits,
    homeRuns: recentWindow.homeRuns,
    doubles: recentWindow.doubles,
    triples: recentWindow.triples,
    extraBaseHits: recentWindow.extraBaseHits,
    walks: recentWindow.walks,
    strikeOuts: recentWindow.strikeOuts,
    runs: recentWindow.runs,
    rbi: recentWindow.rbi,
    recentHardHitsProxy,
    recentExtraBaseHits,
    recentHrTrend,
    recentPowerScore,
    recentGamesWithHR:
      gamesWithHR / Math.max(1, Math.min(gamesBack, logs.length)),
    multiHRGamesLast30,
  };
}
