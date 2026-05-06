import { fetchLiveMLBData } from "@/services/liveMLBDataService";
import { fetchBatterGameLogs } from "@/services/mlbPlayerGameLogService";
import { fetchRecentPitcherFormSummary } from "@/services/mlbPitcherRecentFormService";
import {
  buildStructuredGameContext,
} from "@/services/gamePresentation";
import { getTeamFullName } from "@/services/mlbTeamMetadata";
import type { Game, Pitcher } from "@/types";

type SavantBatterRow = {
  sweetSpotPct: number;
};

type SavantPitcherRow = {
  hardHitRateAllowed: number;
};

type TeamImpliedRuns = Record<
  string,
  {
    away?: number;
    home?: number;
  }
>;

export interface DailyHRRBoardRow {
  rank: number;
  batterId: string;
  playerName: string;
  matchup: string;
  gameTime: string | null;
  hrrScore: number;
  battingOrder: number | null;
  teamTotal: number | null;
  opposingPitcher: string | null;
  lineupConfirmed: boolean;
}

export interface DailyHRRBoardResponse {
  targetDate: string;
  generatedAt: string;
  confirmedCount: number;
  unconfirmedCount: number;
  rows: DailyHRRBoardRow[];
}

interface CachedBoardPayload {
  builtAtMs: number;
  response: DailyHRRBoardResponse;
}

const BOARD_CACHE_TTL_MS = 60 * 1000;
const CACHE_VERSION = "hrr-board-v1";
const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds";

const globalCache = globalThis as typeof globalThis & {
  __hrrBoardCache?: Record<string, CachedBoardPayload>;
  __hrrBoardInflight?: Record<string, Promise<DailyHRRBoardResponse>>;
  __hrrSavantBatterCache?: Record<string, SavantBatterRow>;
  __hrrSavantPitcherCache?: Record<string, SavantPitcherRow>;
  __hrrTeamTotalsCache?: Record<string, TeamImpliedRuns>;
};

if (!globalCache.__hrrBoardCache) {
  globalCache.__hrrBoardCache = {};
}

if (!globalCache.__hrrBoardInflight) {
  globalCache.__hrrBoardInflight = {};
}

function getTodayETDateString(): string {
  const now = new Date();
  const etDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, "0");
  const dd = String(etDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getSeasonFromDate(value: string): number {
  const [year] = value.slice(0, 10).split("-").map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeTeamName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0 (compatible; MLBAnalytics/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length);
  let currentIndex = 0;

  async function runWorker() {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    runWorker(),
  );
  await Promise.all(workers);
  return results;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

function parseNumber(value: string | undefined, fallback = 0): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value.replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function fetchSavantBatterContactMap(
  season: number,
): Promise<Record<string, SavantBatterRow>> {
  if (globalCache.__hrrSavantBatterCache) {
    return globalCache.__hrrSavantBatterCache;
  }

  const url =
    `https://baseballsavant.mlb.com/leaderboard/custom` +
    `?year=${season}&type=batter&filter=&sort=4&sortDir=desc&min=1` +
    `&selections=sweet_spot_percent` +
    `&chart=false&csv=true`;

  try {
    const text = await fetchText(url);
    const rows = parseCsv(text);
    const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
    const playerIdIndex = header.indexOf("player_id");
    const sweetSpotIndex = header.indexOf("sweet_spot_percent");

    const result: Record<string, SavantBatterRow> = {};
    for (const row of rows.slice(1)) {
      const playerId = row[playerIdIndex];
      if (!playerId) continue;
      result[playerId] = {
        sweetSpotPct: parseNumber(row[sweetSpotIndex]),
      };
    }

    globalCache.__hrrSavantBatterCache = result;
    return result;
  } catch {
    return {};
  }
}

async function fetchSavantPitcherContactMap(
  season: number,
): Promise<Record<string, SavantPitcherRow>> {
  if (globalCache.__hrrSavantPitcherCache) {
    return globalCache.__hrrSavantPitcherCache;
  }

  const url =
    `https://baseballsavant.mlb.com/leaderboard/custom` +
    `?year=${season}&type=pitcher&filter=&sort=4&sortDir=desc&min=1` +
    `&selections=hard_hit_percent` +
    `&chart=false&csv=true`;

  try {
    const text = await fetchText(url);
    const rows = parseCsv(text);
    const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
    const playerIdIndex = header.indexOf("player_id");
    const hardHitIndex = header.indexOf("hard_hit_percent");

    const result: Record<string, SavantPitcherRow> = {};
    for (const row of rows.slice(1)) {
      const playerId = row[playerIdIndex];
      if (!playerId) continue;
      result[playerId] = {
        hardHitRateAllowed: parseNumber(row[hardHitIndex]),
      };
    }

    globalCache.__hrrSavantPitcherCache = result;
    return result;
  } catch {
    return {};
  }
}

type OddsEvent = {
  id: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets?: Array<{
      key: string;
      outcomes?: Array<{
        name?: string;
        point?: number;
        price?: number;
      }>;
    }>;
  }>;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function fetchTeamImpliedRunsMap(
  games: Array<Pick<Game, "awayTeamId" | "homeTeamId">>,
): Promise<TeamImpliedRuns> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  const cacheKey = games
    .map((game) => `${game.awayTeamId}@${game.homeTeamId}`)
    .sort()
    .join("|");

  if (globalCache.__hrrTeamTotalsCache?.[cacheKey]) {
    return globalCache.__hrrTeamTotalsCache[cacheKey];
  }

  if (!apiKey) {
    return {};
  }

  const url =
    `${ODDS_API_BASE}?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;

  try {
    const events = await fetchJson<OddsEvent[]>(url);
    const result: TeamImpliedRuns = {};

    for (const game of games) {
      const normalizedHome = normalizeTeamName(getTeamFullName(game.homeTeamId));
      const normalizedAway = normalizeTeamName(getTeamFullName(game.awayTeamId));
      const event = events.find(
        (entry) =>
          normalizeTeamName(entry.home_team) === normalizedHome &&
          normalizeTeamName(entry.away_team) === normalizedAway,
      );

      if (!event) continue;

      const totals: number[] = [];
      const homeSpreads: number[] = [];

      for (const bookmaker of event.bookmakers ?? []) {
        for (const market of bookmaker.markets ?? []) {
          if (market.key === "totals") {
            const over = market.outcomes?.find(
              (outcome) => outcome.name?.toLowerCase() === "over",
            );
            if (typeof over?.point === "number") {
              totals.push(over.point);
            }
          }

          if (market.key === "spreads") {
            const homeOutcome = market.outcomes?.find(
              (outcome) =>
                normalizeTeamName(outcome.name ?? "") === normalizedHome,
            );
            if (typeof homeOutcome?.point === "number") {
              homeSpreads.push(homeOutcome.point);
            }
          }
        }
      }

      const averageTotal = average(totals);
      const averageHomeSpread = average(homeSpreads);

      if (averageTotal == null) continue;

      const derivedHome =
        averageHomeSpread != null
          ? averageTotal / 2 - averageHomeSpread / 2
          : averageTotal / 2;
      const derivedAway = averageTotal - derivedHome;

      result[`${game.awayTeamId}@${game.homeTeamId}`] = {
        away: roundTo(clamp(derivedAway, 2.5, 8.5), 2),
        home: roundTo(clamp(derivedHome, 2.5, 8.5), 2),
      };
    }

    globalCache.__hrrTeamTotalsCache = {
      ...(globalCache.__hrrTeamTotalsCache ?? {}),
      [cacheKey]: result,
    };

    return result;
  } catch {
    return {};
  }
}

type PitchingSeasonStatsResponse = {
  people?: Array<{
    stats?: Array<{
      type?: { displayName?: string };
      group?: { displayName?: string };
      splits?: Array<{
        stat?: {
          hits?: string | number;
          inningsPitched?: string | number;
        };
      }>;
    }>;
  }>;
};

function parseInningsPitched(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return 0;

  const [whole, partial] = value.split(".");
  const wholeNumber = Number(whole);
  const partialNumber = Number(partial ?? "0");

  if (!Number.isFinite(wholeNumber) || !Number.isFinite(partialNumber)) {
    return 0;
  }

  if (partialNumber === 1) return wholeNumber + 1 / 3;
  if (partialNumber === 2) return wholeNumber + 2 / 3;
  return wholeNumber;
}

async function fetchPitcherHitsAllowedPerStart(
  pitcherId: string,
  season: number,
): Promise<number | null> {
  try {
    const url =
      `${MLB_API_BASE}/people/${pitcherId}` +
      `?hydrate=stats(group=[pitching],type=[season],season=${season})`;
    const json = await fetchJson<PitchingSeasonStatsResponse>(url);
    const stat = json.people?.[0]?.stats?.find(
      (entry) =>
        entry.type?.displayName === "season" &&
        entry.group?.displayName === "pitching",
    )?.splits?.[0]?.stat;

    const hits = parseNumber(String(stat?.hits ?? ""), 0);
    const innings = parseInningsPitched(stat?.inningsPitched);
    if (innings <= 0) return null;

    return (hits / innings) * 5.5;
  } catch {
    return null;
  }
}

function normalizeMetric(
  value: number | null | undefined,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value)) {
    return 0.5;
  }

  if (max <= min) {
    return 0.5;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function battingOrderBoost(lineupSpot: number | null | undefined): number {
  switch (lineupSpot) {
    case 1:
      return 0.97;
    case 2:
      return 0.95;
    case 3:
      return 1;
    case 4:
      return 0.94;
    case 5:
      return 0.88;
    case 6:
      return 0.55;
    case 7:
      return 0.4;
    case 8:
      return 0.28;
    case 9:
      return 0.18;
    default:
      return 0.1;
  }
}

function estimateFallbackTeamTotal(params: {
  pitcher: Pitcher | undefined;
  pitcherHardHitAllowed: number | null;
  game: Game;
  isHome: boolean;
}): number {
  const base = 4.3;
  const whipBoost = ((params.pitcher?.whip ?? 1.28) - 1.25) * 1.8;
  const hardHitBoost = ((params.pitcherHardHitAllowed ?? 38) - 36) * 0.04;
  const weatherBoost = (params.game.weather.hrImpactScore ?? 0) * 0.22;
  const parkBoost =
    params.game.weather.hrImpact === "positive"
      ? 0.12
      : params.game.weather.hrImpact === "negative"
        ? -0.08
        : 0;
  const homeBoost = params.isHome ? 0.08 : 0;

  return roundTo(clamp(base + whipBoost + hardHitBoost + weatherBoost + parkBoost + homeBoost, 3, 7), 2);
}

type RawHRRRow = Omit<DailyHRRBoardRow, "rank" | "hrrScore"> & {
  rawScore: number;
};

async function buildFreshBoard(
  targetDate: string,
  limit: number,
): Promise<DailyHRRBoardResponse> {
  const season = getSeasonFromDate(targetDate);
  const [liveData, batterContactMap, pitcherContactMap] = await Promise.all([
    fetchLiveMLBData(targetDate),
    fetchSavantBatterContactMap(season),
    fetchSavantPitcherContactMap(season),
  ]);

  const impliedRunsByGame = await fetchTeamImpliedRunsMap(liveData.games);
  const batterList = Object.values(liveData.batters);

  const rows = (
    await mapWithConcurrency(batterList, 8, async (batter): Promise<RawHRRRow | null> => {
      if (!batter.id || !batter.teamId) return null;

      const game =
        liveData.games.find((entry) => entry.id === batter.gameId) ??
        liveData.games.find(
          (entry) =>
            entry.awayTeamId === batter.teamId || entry.homeTeamId === batter.teamId,
        );
      if (!game) return null;

      const isHome = game.homeTeamId === batter.teamId;
      const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
      const pitcher = pitcherId ? liveData.pitchers[pitcherId] : undefined;
      const gameContext = buildStructuredGameContext({
        gamePk: game.id,
        awayTeamId: game.awayTeamId,
        homeTeamId: game.homeTeamId,
      });

      const [batterLogs, recentPitcherForm, seasonHitsAllowedPerStart] =
        await Promise.all([
          fetchBatterGameLogs(batter.id, targetDate, { season }).catch(() => []),
          pitcherId
            ? fetchRecentPitcherFormSummary(pitcherId, targetDate, {
                season,
                gamesBack: 3,
              }).catch(() => null)
            : Promise.resolve(null),
          pitcherId
            ? fetchPitcherHitsAllowedPerStart(pitcherId, season).catch(() => null)
            : Promise.resolve(null),
        ]);

      const recentWindow = batterLogs.slice(0, 15);
      const recentPlateAppearances = recentWindow.reduce(
        (sum, log) => sum + log.plateAppearances,
        0,
      );
      const recentStrikeouts = recentWindow.reduce(
        (sum, log) => sum + log.strikeOuts,
        0,
      );
      const recentHits = recentWindow.reduce((sum, log) => sum + log.hits, 0);
      const recentWalks = recentWindow.reduce((sum, log) => sum + log.walks, 0);

      const strikeoutRate =
        recentPlateAppearances > 0
          ? recentStrikeouts / recentPlateAppearances
          : 0.23;
      const contactRate =
        recentPlateAppearances > 0
          ? 1 - strikeoutRate
          : clamp(0.68 + batter.season.avg * 0.5, 0.6, 0.9);
      const lineDriveRate =
        (batterContactMap[batter.id]?.sweetSpotPct ?? 28) / 100;
      const estimatedObp =
        batter.season.obp > 0
          ? batter.season.obp
          : recentPlateAppearances > 0
            ? (recentHits + recentWalks) / recentPlateAppearances
            : 0.31;

      const pitcherHardHitAllowed =
        pitcherId && pitcherContactMap[pitcherId]
          ? pitcherContactMap[pitcherId].hardHitRateAllowed
          : null;
      const pitcherHitsAllowed =
        recentPitcherForm && recentPitcherForm.gamesUsed > 0
          ? recentPitcherForm.hitsAllowed / recentPitcherForm.gamesUsed
          : seasonHitsAllowedPerStart;

      const impliedRunsKey = `${game.awayTeamId}@${game.homeTeamId}`;
      const teamTotalFromOdds = isHome
        ? impliedRunsByGame[impliedRunsKey]?.home
        : impliedRunsByGame[impliedRunsKey]?.away;
      const teamTotal =
        teamTotalFromOdds ??
        estimateFallbackTeamTotal({
          pitcher,
          pitcherHardHitAllowed,
          game,
          isHome,
        });

      const rawScore =
        normalizeMetric(contactRate, 0.62, 0.86) * 15 +
        (1 - normalizeMetric(strikeoutRate, 0.12, 0.34)) * 12 +
        normalizeMetric(lineDriveRate, 0.24, 0.39) * 10 +
        normalizeMetric(estimatedObp, 0.29, 0.42) * 8 +
        battingOrderBoost(batter.lineupSpot) * 20 +
        normalizeMetric(teamTotal, 3.4, 6.2) * 20 +
        normalizeMetric(pitcher?.whip ?? null, 1.05, 1.55) * 5 +
        normalizeMetric(pitcherHitsAllowed ?? null, 4.5, 8.5) * 5 +
        normalizeMetric(pitcherHardHitAllowed, 30, 46) * 5;

      return {
        batterId: batter.id,
        playerName: batter.name,
        matchup: gameContext.matchupLabel,
        gameTime: game.timeET ?? game.time ?? null,
        rawScore,
        battingOrder: batter.lineupSpot ?? null,
        teamTotal: teamTotal != null ? roundTo(teamTotal, 2) : null,
        opposingPitcher: pitcher?.name ?? null,
        lineupConfirmed: batter.lineupConfirmed !== false,
      };
    })
  ).filter((row): row is RawHRRRow => Boolean(row));

  const sortedRows = [...rows].sort((a, b) => b.rawScore - a.rawScore);
  const maxRawScore = sortedRows[0]?.rawScore ?? 1;
  const minRawScore = sortedRows[sortedRows.length - 1]?.rawScore ?? 0;

  const finalizedRows: DailyHRRBoardRow[] = sortedRows
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      batterId: row.batterId,
      playerName: row.playerName,
      matchup: row.matchup,
      gameTime: row.gameTime,
      hrrScore: roundTo(
        minRawScore === maxRawScore
          ? 50
          : normalizeMetric(row.rawScore, minRawScore, maxRawScore) * 100,
        1,
      ),
      battingOrder: row.battingOrder,
      teamTotal: row.teamTotal,
      opposingPitcher: row.opposingPitcher,
      lineupConfirmed: row.lineupConfirmed,
    }));

  const confirmedCount = rows.filter((row) => row.lineupConfirmed).length;

  return {
    targetDate,
    generatedAt: new Date().toISOString(),
    confirmedCount,
    unconfirmedCount: rows.length - confirmedCount,
    rows: finalizedRows,
  };
}

export async function buildDailyHRRBoard(options?: {
  targetDate?: string;
  limit?: number;
}): Promise<DailyHRRBoardResponse> {
  const targetDate = options?.targetDate ?? getTodayETDateString();
  const limit = options?.limit ?? 50;
  const cacheKey = `${CACHE_VERSION}:${targetDate}:${limit}`;

  const cached = globalCache.__hrrBoardCache?.[cacheKey];
  if (cached && Date.now() - cached.builtAtMs < BOARD_CACHE_TTL_MS) {
    return cached.response;
  }

  const inflight = globalCache.__hrrBoardInflight?.[cacheKey];
  if (inflight) {
    return inflight;
  }

  const request = buildFreshBoard(targetDate, limit)
    .then((response) => {
      globalCache.__hrrBoardCache![cacheKey] = {
        builtAtMs: Date.now(),
        response,
      };
      return response;
    })
    .finally(() => {
      delete globalCache.__hrrBoardInflight![cacheKey];
    });

  globalCache.__hrrBoardInflight![cacheKey] = request;
  return request;
}
