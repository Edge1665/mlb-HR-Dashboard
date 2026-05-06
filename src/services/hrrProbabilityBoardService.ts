import { fetchLiveMLBData } from "@/services/liveMLBDataService";
import { fetchBatterGameLogs } from "@/services/mlbPlayerGameLogService";
import { fetchRecentPitcherFormSummary } from "@/services/mlbPitcherRecentFormService";
import { buildStructuredGameContext } from "@/services/gamePresentation";
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

export type HRRSummaryTag = "Floor" | "Balanced" | "Ceiling";

export interface DailyHRRProbabilityBoardRow {
  rank: number;
  batterId: string;
  playerName: string;
  matchup: string;
  gameTime: string | null;
  probability1Plus: number;
  probability2Plus: number;
  probability3Plus: number;
  battingOrder: number | null;
  teamTotal: number | null;
  opposingPitcher: string | null;
  summaryTag: HRRSummaryTag;
  confidence: "High" | "Medium" | "Low";
  lineupConfirmed: boolean;
}

export interface DailyHRRProbabilityBoardResponse {
  targetDate: string;
  generatedAt: string;
  confirmedCount: number;
  unconfirmedCount: number;
  rows: DailyHRRProbabilityBoardRow[];
}

interface CachedBoardPayload {
  builtAtMs: number;
  response: DailyHRRProbabilityBoardResponse;
}

type OddsEvent = {
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    markets?: Array<{
      key: string;
      outcomes?: Array<{
        name?: string;
        point?: number;
      }>;
    }>;
  }>;
};

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

type OrderProfile = {
  floorBoost: number;
  balancedBoost: number;
  ceilingBoost: number;
  rankingPenalty: number;
  probabilityPenalty: number;
};

type RawHRRRow = Omit<DailyHRRProbabilityBoardRow, "rank"> & {
  rankingScore: number;
};

const BOARD_CACHE_TTL_MS = 60 * 1000;
const CACHE_VERSION = "hrr-board-v2";
const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds";

const globalCache = globalThis as typeof globalThis & {
  __hrrProbabilityBoardCache?: Record<string, CachedBoardPayload>;
  __hrrProbabilityBoardInflight?: Record<
    string,
    Promise<DailyHRRProbabilityBoardResponse>
  >;
  __hrrSavantBatterCacheV2?: Record<string, SavantBatterRow>;
  __hrrSavantPitcherCacheV2?: Record<string, SavantPitcherRow>;
  __hrrTeamTotalsCacheV2?: Record<string, TeamImpliedRuns>;
};

if (!globalCache.__hrrProbabilityBoardCache) {
  globalCache.__hrrProbabilityBoardCache = {};
}

if (!globalCache.__hrrProbabilityBoardInflight) {
  globalCache.__hrrProbabilityBoardInflight = {};
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

function normalizeMetric(
  value: number | null | undefined,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value)) return 0.5;
  if (max <= min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseNumber(value: string | undefined, fallback = 0): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value.replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function getBattingOrderProfile(lineupSpot: number | null | undefined): OrderProfile {
  switch (lineupSpot) {
    case 1:
      return { floorBoost: 1, balancedBoost: 1, ceilingBoost: 0.95, rankingPenalty: 0, probabilityPenalty: 0 };
    case 2:
      return { floorBoost: 0.98, balancedBoost: 1, ceilingBoost: 0.97, rankingPenalty: 0, probabilityPenalty: 0 };
    case 3:
      return { floorBoost: 0.96, balancedBoost: 0.99, ceilingBoost: 1, rankingPenalty: 0, probabilityPenalty: 0 };
    case 4:
      return { floorBoost: 0.86, balancedBoost: 0.9, ceilingBoost: 0.94, rankingPenalty: 0.02, probabilityPenalty: 0.02 };
    case 5:
      return { floorBoost: 0.8, balancedBoost: 0.86, ceilingBoost: 0.9, rankingPenalty: 0.03, probabilityPenalty: 0.03 };
    case 6:
      return { floorBoost: 0.56, balancedBoost: 0.6, ceilingBoost: 0.64, rankingPenalty: 0.07, probabilityPenalty: 0.04 };
    case 7:
      return { floorBoost: 0.46, balancedBoost: 0.44, ceilingBoost: 0.46, rankingPenalty: 0.1, probabilityPenalty: 0.03 };
    case 8:
      return { floorBoost: 0.34, balancedBoost: 0.32, ceilingBoost: 0.34, rankingPenalty: 0.14, probabilityPenalty: 0.05 };
    case 9:
      return { floorBoost: 0.26, balancedBoost: 0.24, ceilingBoost: 0.26, rankingPenalty: 0.18, probabilityPenalty: 0.06 };
    default:
      return { floorBoost: 0.28, balancedBoost: 0.26, ceilingBoost: 0.28, rankingPenalty: 0.16, probabilityPenalty: 0.04 };
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

  return roundTo(
    clamp(
      base + whipBoost + hardHitBoost + weatherBoost + parkBoost + homeBoost,
      3,
      7,
    ),
    2,
  );
}

function pickSummaryTag(
  probability1Plus: number,
  probability2Plus: number,
  probability3Plus: number,
): HRRSummaryTag {
  const floorGap = probability1Plus - probability2Plus;
  const ceilingRatio = probability3Plus / Math.max(probability2Plus, 0.1);

  if (ceilingRatio >= 0.6 && probability3Plus >= 16) {
    return "Ceiling";
  }

  if (floorGap >= 24 || (probability1Plus >= 48 && probability2Plus < 24)) {
    return "Floor";
  }

  return "Balanced";
}

async function fetchSavantBatterContactMap(
  season: number,
): Promise<Record<string, SavantBatterRow>> {
  if (globalCache.__hrrSavantBatterCacheV2) {
    return globalCache.__hrrSavantBatterCacheV2;
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

    globalCache.__hrrSavantBatterCacheV2 = result;
    return result;
  } catch {
    return {};
  }
}

async function fetchSavantPitcherContactMap(
  season: number,
): Promise<Record<string, SavantPitcherRow>> {
  if (globalCache.__hrrSavantPitcherCacheV2) {
    return globalCache.__hrrSavantPitcherCacheV2;
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

    globalCache.__hrrSavantPitcherCacheV2 = result;
    return result;
  } catch {
    return {};
  }
}

async function fetchTeamImpliedRunsMap(
  games: Array<Pick<Game, "awayTeamId" | "homeTeamId">>,
): Promise<TeamImpliedRuns> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  const cacheKey = games
    .map((game) => `${game.awayTeamId}@${game.homeTeamId}`)
    .sort()
    .join("|");

  if (globalCache.__hrrTeamTotalsCacheV2?.[cacheKey]) {
    return globalCache.__hrrTeamTotalsCacheV2[cacheKey];
  }

  if (!apiKey) return {};

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

    globalCache.__hrrTeamTotalsCacheV2 = {
      ...(globalCache.__hrrTeamTotalsCacheV2 ?? {}),
      [cacheKey]: result,
    };

    return result;
  } catch {
    return {};
  }
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

async function buildFreshBoard(
  targetDate: string,
  limit: number,
): Promise<DailyHRRProbabilityBoardResponse> {
  const season = getSeasonFromDate(targetDate);
  const [liveData, batterContactMap, pitcherContactMap] = await Promise.all([
    fetchLiveMLBData(targetDate),
    fetchSavantBatterContactMap(season),
    fetchSavantPitcherContactMap(season),
  ]);

  const impliedRunsByGame = await fetchTeamImpliedRunsMap(liveData.games);
  const batterList = Object.values(liveData.batters);

  const rows = (
    await mapWithConcurrency(
      batterList,
      8,
      async (batter): Promise<RawHRRRow | null> => {
        if (!batter.id || !batter.teamId) return null;

        const game =
          liveData.games.find((entry) => entry.id === batter.gameId) ??
          liveData.games.find(
            (entry) =>
              entry.awayTeamId === batter.teamId ||
              entry.homeTeamId === batter.teamId,
          );
        if (!game) return null;

        const isHome = game.homeTeamId === batter.teamId;
        const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
        const pitcher = pitcherId ? liveData.pitchers[pitcherId] : undefined;
        const matchup = buildStructuredGameContext({
          gamePk: game.id,
          awayTeamId: game.awayTeamId,
          homeTeamId: game.homeTeamId,
        }).matchupLabel;

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
              ? fetchPitcherHitsAllowedPerStart(pitcherId, season).catch(
                  () => null,
                )
              : Promise.resolve(null),
          ]);

        const recentWindow = batterLogs.slice(0, 15);
        const recentPlateAppearances = recentWindow.reduce(
          (sum, log) => sum + log.plateAppearances,
          0,
        );
        const recentAtBats = recentWindow.reduce((sum, log) => sum + log.atBats, 0);
        const recentHits = recentWindow.reduce((sum, log) => sum + log.hits, 0);
        const recentWalks = recentWindow.reduce((sum, log) => sum + log.walks, 0);
        const recentStrikeouts = recentWindow.reduce(
          (sum, log) => sum + log.strikeOuts,
          0,
        );
        const recentRuns = recentWindow.reduce((sum, log) => sum + log.runs, 0);
        const recentRbi = recentWindow.reduce((sum, log) => sum + log.rbi, 0);
        const recentExtraBaseHits = recentWindow.reduce(
          (sum, log) => sum + log.doubles + log.triples + log.homeRuns,
          0,
        );

        const strikeoutRate =
          recentPlateAppearances > 0
            ? recentStrikeouts / recentPlateAppearances
            : 0.23;
        const contactRate =
          recentPlateAppearances > 0
            ? 1 - strikeoutRate
            : clamp(0.67 + batter.season.avg * 0.45, 0.58, 0.9);
        const estimatedObp =
          batter.season.obp > 0
            ? batter.season.obp
            : recentPlateAppearances > 0
              ? (recentHits + recentWalks) / recentPlateAppearances
              : 0.31;
        const lineDriveRate =
          (batterContactMap[batter.id]?.sweetSpotPct ??
            batter.statcast.sweetSpotPct ??
            28) / 100;
        const hitRate =
          recentAtBats > 0 ? recentHits / recentAtBats : batter.season.avg;
        const extraBaseHitRate =
          recentAtBats > 0
            ? recentExtraBaseHits / recentAtBats
            : clamp(
                batter.season.iso > 0 ? batter.season.iso * 0.5 : 0.08,
                0.04,
                0.24,
              );

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

        const orderProfile = getBattingOrderProfile(batter.lineupSpot);
        const lineupMissing = batter.lineupSpot == null;
        const pitcherMissing = !pitcher;
        const confidencePenalty =
          (lineupMissing ? 0.03 : 0) + (pitcherMissing ? 0.02 : 0);
        const rankingPenalty =
          orderProfile.rankingPenalty + (pitcherMissing ? 0.015 : 0);
        const confidence: DailyHRRProbabilityBoardRow["confidence"] =
          lineupMissing && pitcherMissing
            ? "Low"
            : lineupMissing || pitcherMissing || !batter.lineupConfirmed
              ? "Medium"
              : "High";

        const playerQualityComponent =
          normalizeMetric(contactRate, 0.62, 0.86) * 0.35 +
          normalizeMetric(
            estimatedObp > 0 ? estimatedObp : hitRate,
            0.25,
            0.42,
          ) * 0.3 +
          Math.max(
            normalizeMetric(batter.statcast.hardHitRate, 30, 58),
            normalizeMetric(batter.statcast.barrelRate, 4, 18),
          ) * 0.35;

        const contactComponent =
          normalizeMetric(contactRate, 0.62, 0.86) * 0.45 +
          (1 - normalizeMetric(strikeoutRate, 0.12, 0.34)) * 0.25 +
          normalizeMetric(hitRate, 0.18, 0.38) * 0.3;
        const obpComponent = normalizeMetric(estimatedObp, 0.29, 0.42);
        const powerComponent =
          normalizeMetric(batter.season.iso, 0.09, 0.3) * 0.35 +
          normalizeMetric(batter.statcast.hardHitRate, 30, 58) * 0.25 +
          normalizeMetric(batter.statcast.xSlugging, 0.32, 0.62) * 0.25 +
          normalizeMetric(extraBaseHitRate, 0.04, 0.22) * 0.15;
        const runProductionComponent =
          normalizeMetric(
            recentPlateAppearances > 0
              ? (recentRuns + recentRbi) / recentPlateAppearances
              : batter.season.rbi / Math.max(batter.season.games, 1) / 4,
            0.08,
            0.4,
          ) * 0.6 +
          normalizeMetric(teamTotal, 3.4, 6.2) * 0.22;
        const pitcherAttackComponent =
          normalizeMetric(pitcher?.whip ?? null, 1.05, 1.55) * 0.35 +
          normalizeMetric(pitcherHitsAllowed ?? null, 4.5, 8.5) * 0.35 +
          normalizeMetric(pitcherHardHitAllowed, 30, 46) * 0.3;
        const environmentComponent =
          normalizeMetric(teamTotal, 3.4, 6.4) * 0.32 +
          normalizeMetric(game.weather.hrImpactScore, -1.5, 1.5) * 0.22 +
          normalizeMetric(pitcherAttackComponent, 0.25, 0.85) * 0.14;

        const floorSignal =
          playerQualityComponent * 0.26 +
          contactComponent * 0.26 +
          obpComponent * 0.16 +
          orderProfile.floorBoost * 0.2 +
          normalizeMetric(teamTotal, 3.4, 6.2) * 0.07 +
          pitcherAttackComponent * 0.05;

        const balancedSignal =
          playerQualityComponent * 0.24 +
          contactComponent * 0.16 +
          powerComponent * 0.23 +
          orderProfile.balancedBoost * 0.2 +
          environmentComponent * 0.09 +
          runProductionComponent * 0.08;

        const ceilingSignal =
          playerQualityComponent * 0.16 +
          powerComponent * 0.33 +
          normalizeMetric(extraBaseHitRate, 0.04, 0.22) * 0.13 +
          runProductionComponent * 0.18 +
          orderProfile.ceilingBoost * 0.12 +
          environmentComponent * 0.08;

        const globalProbabilityPenalty =
          orderProfile.probabilityPenalty + (lineupMissing ? 0.03 : 0);

        const probability1Plus = clamp(
          (0.12 + floorSignal * 0.5 - confidencePenalty - globalProbabilityPenalty) * 100,
          8,
          88,
        );
        const probability2PlusBase = clamp(
          (0.02 +
            balancedSignal * 0.36 -
            confidencePenalty * 0.45 -
            globalProbabilityPenalty * 0.6) * 100,
          2,
          68,
        );
        const probability3PlusBase = clamp(
          (0.008 +
            ceilingSignal * 0.24 -
            confidencePenalty * 0.3 -
            globalProbabilityPenalty * 0.45) * 100,
          0.8,
          42,
        );

        const probability2Plus = clamp(
          Math.min(probability1Plus - 2.5, probability2PlusBase),
          1,
          68,
        );
        const probability3Plus = clamp(
          Math.min(probability2Plus - 2, probability3PlusBase),
          0.8,
          42,
        );
        const summaryTag = pickSummaryTag(
          probability1Plus,
          probability2Plus,
          probability3Plus,
        );

        const rankingScore =
          probability2Plus * 0.65 +
          probability3Plus * 0.25 +
          probability1Plus * 0.1 -
          rankingPenalty * 100;

        return {
          batterId: batter.id,
          playerName: batter.name,
          matchup,
          gameTime: game.timeET ?? game.time ?? null,
          probability1Plus: roundTo(probability1Plus, 1),
          probability2Plus: roundTo(probability2Plus, 1),
          probability3Plus: roundTo(probability3Plus, 1),
          battingOrder: batter.lineupSpot ?? null,
          teamTotal: teamTotal != null ? roundTo(teamTotal, 2) : null,
          opposingPitcher: pitcher?.name ?? null,
          summaryTag,
          confidence,
          lineupConfirmed: batter.lineupConfirmed !== false,
          rankingScore,
        };
      },
    )
  ).filter((row): row is RawHRRRow => Boolean(row));

  const sortedRows = [...rows]
    .sort((a, b) => {
      if (b.rankingScore !== a.rankingScore) {
        return b.rankingScore - a.rankingScore;
      }
      if (b.probability2Plus !== a.probability2Plus) {
        return b.probability2Plus - a.probability2Plus;
      }
      if (b.probability3Plus !== a.probability3Plus) {
        return b.probability3Plus - a.probability3Plus;
      }
      return b.probability1Plus - a.probability1Plus;
    })
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      batterId: row.batterId,
      playerName: row.playerName,
      matchup: row.matchup,
      gameTime: row.gameTime,
      probability1Plus: row.probability1Plus,
      probability2Plus: row.probability2Plus,
      probability3Plus: row.probability3Plus,
      battingOrder: row.battingOrder,
      teamTotal: row.teamTotal,
      opposingPitcher: row.opposingPitcher,
      summaryTag: row.summaryTag,
      confidence: row.confidence,
      lineupConfirmed: row.lineupConfirmed,
    }));

  const confirmedCount = rows.filter((row) => row.lineupConfirmed).length;

  return {
    targetDate,
    generatedAt: new Date().toISOString(),
    confirmedCount,
    unconfirmedCount: rows.length - confirmedCount,
    rows: sortedRows,
  };
}

export async function buildDailyHRRProbabilityBoard(options?: {
  targetDate?: string;
  limit?: number;
}): Promise<DailyHRRProbabilityBoardResponse> {
  const targetDate = options?.targetDate ?? getTodayETDateString();
  const limit = options?.limit ?? 50;
  const cacheKey = `${CACHE_VERSION}:${targetDate}:${limit}`;

  const cached = globalCache.__hrrProbabilityBoardCache?.[cacheKey];
  if (cached && Date.now() - cached.builtAtMs < BOARD_CACHE_TTL_MS) {
    return cached.response;
  }

  const inflight = globalCache.__hrrProbabilityBoardInflight?.[cacheKey];
  if (inflight) {
    return inflight;
  }

  const request = buildFreshBoard(targetDate, limit)
    .then((response) => {
      globalCache.__hrrProbabilityBoardCache![cacheKey] = {
        builtAtMs: Date.now(),
        response,
      };
      return response;
    })
    .finally(() => {
      delete globalCache.__hrrProbabilityBoardInflight![cacheKey];
    });

  globalCache.__hrrProbabilityBoardInflight![cacheKey] = request;
  return request;
}
