import { buildPredictionInput } from '@/services/hrPredictionService';
import { fetchLiveMLBData } from '@/services/liveMLBDataService';
import { buildHRFeatureExample, type HRModelFeatureName } from '@/services/ml/hrFeatureEngineering';
import { predictHRXGBoostProbabilityDetails } from '@/services/ml/hrXGBoostModel';
import { fetchRecentBatterGameLogSummary } from '@/services/mlbPlayerGameLogService';
import { fetchRecentPitcherFormSummary } from '@/services/mlbPitcherRecentFormService';
import { getHRProbabilityTier } from '@/services/ml/hrPredictionTiers';
import {
  buildDailyHrOddsLookup,
  findBestOddsMatch,
  type DailyOddsLookup,
} from '@/services/oddsApiService';
import type { HRTrainingExample } from '@/services/ml/types';
import {
  loadHRModelArtifact,
  trainAndSaveHRModelArtifact,
} from '@/services/hrModelArtifactService';
import {
  DEFAULT_SEASON_SAMPLE_WEIGHTS,
  areSeasonSampleWeightsEqual,
  normalizeSeasonSampleWeights,
  serializeSeasonSampleWeights,
  type SeasonSampleWeights,
} from '@/services/ml/hrSeasonWeights';

export type DailyBoardSortMode = 'model' | 'edge' | 'best';
export type DailyBoardLineupMode = 'confirmed' | 'all';

export interface DailyHRBoardRow {
  rank: number;
  batterId: string;
  batterName: string;
  batterPosition: string | null;
  batterBats: 'L' | 'R' | 'S' | null;
  lineupSpot: number | null;
  teamId: string;
  opponentTeamId: string;
  gameId: string;
  gameTime: string | null;
  ballparkName: string | null;
  opposingPitcherName: string | null;
  opposingPitcherThrows: 'L' | 'R' | null;
  modelScore: number;
  rawCalibratedProbability: number;
  conservativeProbability: number;
  predictedProbability: number;
  tier: string;
  reasons: string[];
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  edge: number | null;
  combinedScore: number | null;
  sportsbook: string | null;
  lineupConfirmed: boolean;
  features: {
    seasonHRPerGame: number;
    barrelRate: number;
    iso: number;
    pitcherHr9: number;
    parkHrFactor: number;
    weatherHrImpactScore: number;
    last7HR: number;
    recentGamesWithHR: number;
    recentPowerScore: number;
    projectedAtBats: number;
    platoonEdge: number;
  };
}

export interface DailyHROddsStatus {
  status: 'live' | 'cached' | 'unavailable';
  cachedAt: string | null;
  cacheTtlMinutes: number;
}

interface CachedBoardPayload {
  builtAtMs: number;
  targetDate: string;
  sportsbooks: string[];
  generatedAt: string;
  trainingStartDate: string;
  trainingExampleCount: number;
  modelTrainedAt: string;
  seasonSampleWeights: SeasonSampleWeights;
  odds: DailyHROddsStatus;
  rows: DailyHRBoardRow[];
}

const BOARD_CACHE_TTL_MS = 60 * 1000;
const LIVE_BOARD_CACHE_VERSION = 'live-board-v3';

const globalCache = globalThis as typeof globalThis & {
  __hrDailyBoardCache?: Record<string, CachedBoardPayload>;
};

if (!globalCache.__hrDailyBoardCache) {
  globalCache.__hrDailyBoardCache = {};
}

function getTodayETDateString(): string {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getSeasonFromDate(value: string): number {
  const [year] = value.slice(0, 10).split('-').map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
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

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function buildReasons(example: HRTrainingExample): string[] {
  const reasons: string[] = [];

  if (example.barrelRate >= 12) {
    reasons.push(`Strong barrel rate (${example.barrelRate.toFixed(1)}%)`);
  }

  if (example.iso >= 0.22) {
    reasons.push(`Strong ISO (${example.iso.toFixed(3)})`);
  }

  if (example.pitcherHr9 >= 1.3) {
    reasons.push(`Pitcher allows HRs (${example.pitcherHr9.toFixed(2)} HR/9)`);
  }

  if (example.parkHrFactor >= 1.08) {
    reasons.push(`Favorable HR park (${example.parkHrFactor.toFixed(2)})`);
  }

  if (example.last7HR >= 2) {
    reasons.push(`Recent HR form (${example.last7HR} HR in last 7)`);
  }

  if (example.recentGamesWithHR >= 0.2) {
    reasons.push(`Homered in ${(example.recentGamesWithHR * 100).toFixed(0)}% of recent games`);
  }

  if (example.platoonEdge >= 1) {
    reasons.push('Has platoon advantage');
  }

  if (example.projectedAtBats >= 4.1) {
    reasons.push(`High projected volume (${example.projectedAtBats.toFixed(1)} AB)`);
  }

  if (example.weatherHrImpactScore >= 0.8) {
    reasons.push(`Weather boost (${example.weatherHrImpactScore.toFixed(1)})`);
  }

  if (example.weatherHrImpactScore <= -0.8) {
    reasons.push(`Poor weather (${example.weatherHrImpactScore.toFixed(1)})`);
  }

  return reasons.slice(0, 4);
}

function getCombinedScore(row: DailyHRBoardRow): number | null {
  if (row.edge == null || row.edge <= 0) return null;

  const positiveEdge = row.edge;
  return row.predictedProbability + positiveEdge * 1.5;
}

function sortRows(rows: DailyHRBoardRow[], sortMode: DailyBoardSortMode): DailyHRBoardRow[] {
  if (sortMode === 'edge') {
    const filtered = rows.filter(
      (row) =>
        row.sportsbookOddsAmerican != null &&
        row.edge != null &&
        row.edge > 0
    );

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aEdge = a.edge ?? -999;
      const bEdge = b.edge ?? -999;
      if (bEdge !== aEdge) return bEdge - aEdge;
      return b.modelScore - a.modelScore;
    });

    return sorted;
  }

  if (sortMode === 'best') {
    const filtered = rows.filter(
      (row) =>
        row.sportsbookOddsAmerican != null &&
        row.edge != null &&
        row.edge > 0
    );

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aScore = a.combinedScore ?? -999;
      const bScore = b.combinedScore ?? -999;
      if (bScore !== aScore) return bScore - aScore;

      const aEdge = a.edge ?? -999;
      const bEdge = b.edge ?? -999;
      if (bEdge !== aEdge) return bEdge - aEdge;

      return b.modelScore - a.modelScore;
    });

    return sorted;
  }

  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (b.modelScore !== a.modelScore) {
      return b.modelScore - a.modelScore;
    }

    const aHasOdds = a.sportsbookOddsAmerican != null ? 1 : 0;
    const bHasOdds = b.sportsbookOddsAmerican != null ? 1 : 0;
    if (bHasOdds !== aHasOdds) {
      return bHasOdds - aHasOdds;
    }

    const aEdge = a.edge ?? -999;
    const bEdge = b.edge ?? -999;
    return bEdge - aEdge;
  });

  return sorted;
}

function finalizeRows(rows: DailyHRBoardRow[], sortMode: DailyBoardSortMode, limit: number): DailyHRBoardRow[] {
  return sortRows(rows, sortMode)
    .slice(0, limit)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      rawCalibratedProbability: Number(row.rawCalibratedProbability.toFixed(3)),
      conservativeProbability: Number(row.conservativeProbability.toFixed(3)),
      predictedProbability: Number(row.predictedProbability.toFixed(3)),
      impliedProbability:
        row.impliedProbability != null ? Number(row.impliedProbability.toFixed(3)) : null,
      edge: row.edge != null ? Number(row.edge.toFixed(3)) : null,
      combinedScore:
        row.combinedScore != null ? Number(row.combinedScore.toFixed(3)) : null,
    }));
}

function filterRowsByLineupMode(
  rows: DailyHRBoardRow[],
  lineupMode: DailyBoardLineupMode
): DailyHRBoardRow[] {
  if (lineupMode === 'all') {
    return rows.filter((row) => {
      if (row.lineupConfirmed) return true;

      const hasStrongProbability = row.modelScore >= 0.12;
      const hasStrongPower =
        row.features.barrelRate >= 10 ||
        row.features.iso >= 0.185 ||
        row.features.recentPowerScore >= 20;
      const hasStrongContext =
        row.features.projectedAtBats >= 3.9 ||
        row.features.last7HR >= 1 ||
        row.features.recentGamesWithHR >= 0.15;

      return hasStrongProbability && hasStrongPower && hasStrongContext;
    });
  }

  return rows.filter((row) => row.lineupConfirmed);
}

async function buildFreshBoard(options: {
  targetDate: string;
  trainingStartDate: string;
  sportsbooks?: string[];
  seasonSampleWeights?: SeasonSampleWeights;
}): Promise<CachedBoardPayload> {
  const { targetDate, trainingStartDate, sportsbooks } = options;
  const seasonSampleWeights = normalizeSeasonSampleWeights(
    options.seasonSampleWeights ?? DEFAULT_SEASON_SAMPLE_WEIGHTS
  );
  const season = getSeasonFromDate(targetDate);
  let loadedArtifact = await loadHRModelArtifact();

  if (
    !loadedArtifact ||
    loadedArtifact.artifact.trainingStartDate !== trainingStartDate ||
    (loadedArtifact.artifact.calibration?.buckets?.length ?? 0) === 0 ||
    !areSeasonSampleWeightsEqual(
      loadedArtifact.artifact.seasonSampleWeights,
      seasonSampleWeights
    )
  ) {
    loadedArtifact = await trainAndSaveHRModelArtifact({
      trainingStartDate,
      trainingEndDate: targetDate,
      minRows: 500,
      seasonSampleWeights,
    });
  }

  const { artifact, model } = loadedArtifact;

  const { batters, pitchers, games, ballparks } = await fetchLiveMLBData(targetDate);

  let oddsLookup: DailyOddsLookup = {
    byPlayerName: {},
    status: 'unavailable',
    cachedAt: null,
    cacheTtlMinutes: 10,
  };
  try {
    oddsLookup = await buildDailyHrOddsLookup(
      games.map((g) => ({
        awayTeamId: String(g.awayTeamId),
        homeTeamId: String(g.homeTeamId),
      })),
      sportsbooks
    );
  } catch (error) {
    console.warn(
      '[hrDailyBoardService] Failed to load odds lookup; continuing without odds.',
      error
    );
    oddsLookup = {
      byPlayerName: {},
      status: 'unavailable',
      cachedAt: null,
      cacheTtlMinutes: 10,
    };
  }

  const batterList = Object.values(batters);

  const predictionRows = await mapWithConcurrency(
    batterList,
    8,
    async (batter): Promise<DailyHRBoardRow | null> => {
      if (!batter?.id || !batter?.teamId) return null;

      const game = games.find(
        (g) => g.awayTeamId === batter.teamId || g.homeTeamId === batter.teamId
      );
      if (!game) return null;

      const isHome = game.homeTeamId === batter.teamId;
      const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
      const pitcher = pitcherId ? (pitchers[pitcherId] ?? undefined) : undefined;
      const ballpark = game.ballparkId ? (ballparks[game.ballparkId] ?? undefined) : undefined;

      const input = buildPredictionInput(batter, pitcher, game, ballpark);
      const baseExample = buildHRFeatureExample(input, 0, targetDate);

      let recentBatterLog = null;
      try {
        recentBatterLog = await fetchRecentBatterGameLogSummary(String(batter.id), targetDate, {
          season,
          gamesBack: 10,
        });
      } catch {
        recentBatterLog = null;
      }

      let recentPitcherForm = null;
      try {
        if (pitcherId) {
          recentPitcherForm = await fetchRecentPitcherFormSummary(String(pitcherId), targetDate, {
            season,
            gamesBack: 3,
          });
        }
      } catch {
        recentPitcherForm = null;
      }

      const example: HRTrainingExample = {
        ...baseExample,
        recentHardHits: recentBatterLog?.recentHardHitsProxy ?? baseExample.recentHardHits,
        recentExtraBaseHits: recentBatterLog?.recentExtraBaseHits ?? baseExample.recentExtraBaseHits,
        recentHrTrend: recentBatterLog?.recentHrTrend ?? baseExample.recentHrTrend,
        recentPowerScore: recentBatterLog?.recentPowerScore ?? baseExample.recentPowerScore,
        recentGamesWithHR: recentBatterLog?.recentGamesWithHR ?? baseExample.recentGamesWithHR,
        multiHRGamesLast30: recentBatterLog?.multiHRGamesLast30 ?? baseExample.multiHRGamesLast30,
        recentPitcherHr9: recentPitcherForm?.recentHrPer9 ?? baseExample.recentPitcherHr9,
        label: 0,
      };

      const probabilityDetails = predictHRXGBoostProbabilityDetails(
        model,
        example,
        artifact.standardization,
        artifact.calibration,
        artifact.params.probabilityPower,
        artifact.featureNames as HRModelFeatureName[]
      );
      const modelScore = probabilityDetails.conservativeProbability;
      const rawCalibratedProbability = probabilityDetails.rawCalibratedProbability;
      const conservativeProbability = probabilityDetails.conservativeProbability;

      const odds = findBestOddsMatch(oddsLookup.byPlayerName, example.batterName);
      const impliedProbability = odds?.impliedProbability ?? null;
      const edge =
        impliedProbability != null ? conservativeProbability - impliedProbability : null;

      const row: DailyHRBoardRow = {
        rank: 0,
        batterId: String(example.batterId),
        batterName: example.batterName,
        batterPosition: batter.position ?? null,
        batterBats: batter.bats ?? null,
        lineupSpot: batter.lineupSpot ?? null,
        teamId: String(batter.teamId),
        opponentTeamId: String(isHome ? game.awayTeamId : game.homeTeamId),
        gameId: String(game.id),
        gameTime: game.timeET ?? game.time ?? null,
        ballparkName: ballpark?.name ?? null,
        opposingPitcherName: pitcher?.name ?? null,
        opposingPitcherThrows: pitcher?.throws ?? null,
        modelScore,
        rawCalibratedProbability,
        conservativeProbability,
        predictedProbability: conservativeProbability,
        tier: getHRProbabilityTier(conservativeProbability),
        reasons: buildReasons(example),
        sportsbookOddsAmerican: odds?.americanOdds ?? null,
        impliedProbability,
        edge,
        combinedScore: null,
        sportsbook: odds?.sportsbook ?? null,
        lineupConfirmed: batter.lineupConfirmed !== false,
        features: {
          seasonHRPerGame: example.seasonHRPerGame,
          barrelRate: example.barrelRate,
          iso: example.iso,
          pitcherHr9: example.pitcherHr9,
          parkHrFactor: example.parkHrFactor,
          weatherHrImpactScore: example.weatherHrImpactScore,
          last7HR: example.last7HR,
          recentGamesWithHR: example.recentGamesWithHR,
          recentPowerScore: example.recentPowerScore,
          projectedAtBats: example.projectedAtBats,
          platoonEdge: example.platoonEdge,
        },
      };

      row.combinedScore = getCombinedScore(row);
      return row;
    }
  );

  return {
    builtAtMs: Date.now(),
    targetDate,
    sportsbooks: sportsbooks ?? [],
    generatedAt: new Date().toISOString(),
    trainingStartDate: artifact.trainingStartDate,
    trainingExampleCount: artifact.trainingExampleCount,
    modelTrainedAt: artifact.trainedAt,
    seasonSampleWeights: artifact.seasonSampleWeights,
    odds: {
      status: oddsLookup.status,
      cachedAt: oddsLookup.cachedAt,
      cacheTtlMinutes: oddsLookup.cacheTtlMinutes,
    },
    rows: predictionRows.filter((row): row is DailyHRBoardRow => Boolean(row)),
  };
}

async function getCachedOrFreshBoard(options: {
  targetDate: string;
  trainingStartDate: string;
  sportsbooks?: string[];
  seasonSampleWeights?: SeasonSampleWeights;
}): Promise<CachedBoardPayload> {
  const booksKey = (options.sportsbooks ?? []).map((book) => book.trim()).sort().join(',');
  const seasonWeightsKey = serializeSeasonSampleWeights(options.seasonSampleWeights);
  const cacheKey = `${LIVE_BOARD_CACHE_VERSION}__${options.targetDate}__${options.trainingStartDate}__${booksKey}__${seasonWeightsKey}`;
  const existing = globalCache.__hrDailyBoardCache?.[cacheKey];

  if (existing && Date.now() - existing.builtAtMs < BOARD_CACHE_TTL_MS) {
    return existing;
  }

  const fresh = await buildFreshBoard(options);
  globalCache.__hrDailyBoardCache![cacheKey] = fresh;
  return fresh;
}

export async function buildDailyHRBoard(options?: {
  targetDate?: string;
  trainingStartDate?: string;
  limit?: number;
  sortMode?: DailyBoardSortMode;
  lineupMode?: DailyBoardLineupMode;
  sportsbooks?: string[];
  seasonSampleWeights?: SeasonSampleWeights;
}) {
  const targetDate = options?.targetDate ?? getTodayETDateString();
  const trainingStartDate = options?.trainingStartDate ?? '2024-03-28';
  const limit = options?.limit ?? 25;
  const sortMode = options?.sortMode ?? 'model';
  const lineupMode =
    options?.lineupMode ??
    (sortMode === 'edge' ? 'all' : 'confirmed');

  const cachedBoard = await getCachedOrFreshBoard({
    targetDate,
    trainingStartDate,
    sportsbooks: options?.sportsbooks,
    seasonSampleWeights: options?.seasonSampleWeights,
  });

  const confirmedRows = filterRowsByLineupMode(cachedBoard.rows, 'confirmed');
  const curatedAllRows = filterRowsByLineupMode(cachedBoard.rows, 'all');
  let effectiveLineupMode = lineupMode;
  let filteredRows =
    lineupMode === 'confirmed'
      ? confirmedRows
      : curatedAllRows;

  const confirmedFinalRows = finalizeRows(confirmedRows, sortMode, limit);
  if (
    sortMode === 'best' &&
    lineupMode === 'confirmed' &&
    confirmedFinalRows.length < Math.min(limit, 10)
  ) {
    effectiveLineupMode = 'all';
    filteredRows = curatedAllRows;
  }

  const confirmedCount = cachedBoard.rows.filter((row) => row.lineupConfirmed).length;
  const unconfirmedCount = cachedBoard.rows.length - confirmedCount;

  return {
    targetDate: cachedBoard.targetDate,
    sportsbooks: cachedBoard.sportsbooks,
    generatedAt: cachedBoard.generatedAt,
    trainingStartDate: cachedBoard.trainingStartDate,
    trainingExampleCount: cachedBoard.trainingExampleCount,
    modelTrainedAt: cachedBoard.modelTrainedAt,
    seasonSampleWeights: cachedBoard.seasonSampleWeights,
    odds: {
      status: cachedBoard.odds?.status ?? 'unavailable',
      cachedAt: cachedBoard.odds?.cachedAt ?? null,
      cacheTtlMinutes: cachedBoard.odds?.cacheTtlMinutes ?? 10,
    },
    sortMode,
    lineupMode: effectiveLineupMode,
    confirmedCount,
    unconfirmedCount,
    rows: finalizeRows(filteredRows, sortMode, limit),
  };
}
