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
import {
  buildPriorRankMap,
  fetchPriorBoardReference,
  getBoardStabilityFields,
} from '@/services/hrBoardStabilityService';
import {
  summarizeLiveSlateEnvironment,
  type LiveSlateEnvironmentSummary,
} from '@/services/ml/hrSlateEnvironmentService';

export type DailyBoardSortMode = 'model' | 'edge' | 'best';
export type DailyBoardLineupMode = 'confirmed' | 'all';

const DEFAULT_CONSERVATIVE_SHRINKAGE = 0.25;

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
  valueTag: 'strong_value' | 'slight_value' | 'fair' | 'negative_value' | 'no_odds';
  morningRank: number | null;
  currentRank: number | null;
  rankChange: number | null;
  wasInMorningTop10: boolean;
  wasInMorningTop20: boolean;
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

export interface DailyHRBoardResponse {
  targetDate: string;
  sportsbooks: string[];
  generatedAt: string;
  trainingStartDate: string;
  trainingExampleCount: number;
  modelTrainedAt: string;
  seasonSampleWeights: SeasonSampleWeights;
  odds: DailyHROddsStatus;
  sortMode: DailyBoardSortMode;
  lineupMode: DailyBoardLineupMode;
  confirmedCount: number;
  unconfirmedCount: number;
  slateEnvironment: LiveSlateEnvironmentSummary;
  predictedSlateEnvironment: LiveSlateEnvironmentSummary['slateClass'];
  recommendedTopPlaysMin: number;
  recommendedTopPlaysMax: number;
  shouldConsiderSkippingSlate: boolean;
  rows: DailyHRBoardRow[];
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

interface GameEnvironmentAdjustment {
  multiplier: number;
  weatherScore: number;
  parkFactor: number;
  averagePitcherHr9: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function remapDisplayedHrProbability(internalProbability: number): number {
  const clamped = clamp(internalProbability, 0, 0.6);

  if (clamped <= 0) {
    return 0;
  }

  // Preserve ordering but compress the display layer into a realistic single-game HR range.
  const maxDisplayProbability = 0.28;
  const shape = 2.2;
  const normalized =
    (1 - Math.exp(-shape * clamped)) / (1 - Math.exp(-shape * 0.6));

  return clamp(maxDisplayProbability * normalized, 0, maxDisplayProbability);
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

function enrichReasonsWithGameEnvironment(
  reasons: string[],
  gameEnvironment: GameEnvironmentAdjustment
): string[] {
  const enhanced = [...reasons];

  if (gameEnvironment.multiplier >= 1.07) {
    enhanced.push(`HR-friendly game environment (${gameEnvironment.multiplier.toFixed(2)}x)`);
  } else if (gameEnvironment.multiplier <= 0.95) {
    enhanced.push(`HR-suppressing game environment (${gameEnvironment.multiplier.toFixed(2)}x)`);
  }

  return enhanced.slice(0, 4);
}

function buildGameEnvironmentAdjustment(params: {
  weatherScore?: number | null;
  parkFactor?: number | null;
  awayPitcherHr9?: number | null;
  homePitcherHr9?: number | null;
}): GameEnvironmentAdjustment {
  const weatherScore = clamp(params.weatherScore ?? 0, -2, 2);
  const parkFactor = clamp(params.parkFactor ?? 1, 0.7, 1.5);
  const pitcherHr9Values = [params.awayPitcherHr9, params.homePitcherHr9].filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  const averagePitcherHr9 =
    pitcherHr9Values.length > 0
      ? pitcherHr9Values.reduce((sum, value) => sum + value, 0) / pitcherHr9Values.length
      : 1.1;

  // Shared slate-level context:
  // weather carries the most weight, park is next, and the two probable starters
  // add a modest game-wide signal without overpowering the hitter-specific model.
  const weatherAdjustment = weatherScore * 0.035;
  const parkAdjustment = (parkFactor - 1) * 0.22;
  const pitcherAdjustment = clamp((averagePitcherHr9 - 1.1) * 0.045, -0.04, 0.05);
  const multiplier = clamp(
    1 + weatherAdjustment + parkAdjustment + pitcherAdjustment,
    0.88,
    1.14
  );

  return {
    multiplier,
    weatherScore,
    parkFactor,
    averagePitcherHr9,
  };
}

function getValueTag(edge: number | null): DailyHRBoardRow['valueTag'] {
  if (edge == null || !Number.isFinite(edge)) {
    return 'no_odds';
  }

  if (edge >= 0.03) {
    return 'strong_value';
  }

  if (edge > 0) {
    return 'slight_value';
  }

  if (edge >= -0.02) {
    return 'fair';
  }

  return 'negative_value';
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

  const sorted = [...rows];

  if (sortMode === 'best') {
    sorted.sort((a, b) => {
      if (b.modelScore !== a.modelScore) {
        return b.modelScore - a.modelScore;
      }

      if (b.rawCalibratedProbability !== a.rawCalibratedProbability) {
        return b.rawCalibratedProbability - a.rawCalibratedProbability;
      }

      const aEdge = a.edge ?? -999;
      const bEdge = b.edge ?? -999;
      if (bEdge !== aEdge) return bEdge - aEdge;

      return b.modelScore - a.modelScore;
    });

    return sorted;
  }

  sorted.sort((a, b) => {
    if (b.modelScore !== a.modelScore) {
      return b.modelScore - a.modelScore;
    }

    if (b.predictedProbability !== a.predictedProbability) {
      return b.predictedProbability - a.predictedProbability;
    }

    if (b.rawCalibratedProbability !== a.rawCalibratedProbability) {
      return b.rawCalibratedProbability - a.rawCalibratedProbability;
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
      currentRank: index + 1,
      rankChange: row.morningRank != null ? row.morningRank - (index + 1) : null,
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
  const gameEnvironmentById = new Map<string, GameEnvironmentAdjustment>();

  for (const game of games) {
    const ballpark = game.ballparkId ? ballparks[game.ballparkId] : undefined;
    const awayPitcherHr9 = game.awayPitcherId ? pitchers[game.awayPitcherId]?.hr9 : undefined;
    const homePitcherHr9 = game.homePitcherId ? pitchers[game.homePitcherId]?.hr9 : undefined;

    gameEnvironmentById.set(
      String(game.id),
      buildGameEnvironmentAdjustment({
        weatherScore: game.weather?.hrImpactScore,
        parkFactor: ballpark?.hrFactor,
        awayPitcherHr9,
        homePitcherHr9,
      })
    );
  }

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
        artifact.params.conservativeShrinkage ?? DEFAULT_CONSERVATIVE_SHRINKAGE,
        artifact.featureNames as HRModelFeatureName[]
      );
      const rawCalibratedProbability = probabilityDetails.rawCalibratedProbability;
      const conservativeProbability = probabilityDetails.conservativeProbability;
      const gameEnvironment =
        gameEnvironmentById.get(String(game.id)) ??
        buildGameEnvironmentAdjustment({
          weatherScore: game.weather?.hrImpactScore,
          parkFactor: ballpark?.hrFactor,
          awayPitcherHr9: game.awayPitcherId ? pitchers[game.awayPitcherId]?.hr9 : undefined,
          homePitcherHr9: game.homePitcherId ? pitchers[game.homePitcherId]?.hr9 : undefined,
        });
      const adjustedProbability = clamp(
        conservativeProbability * gameEnvironment.multiplier,
        0,
        0.6
      );
      const modelScore = adjustedProbability;
      const displayedProbability = remapDisplayedHrProbability(adjustedProbability);

      const odds = findBestOddsMatch(oddsLookup.byPlayerName, example.batterName);
      const impliedProbability = odds?.impliedProbability ?? null;
      const edge =
        impliedProbability != null ? adjustedProbability - impliedProbability : null;

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
        predictedProbability: displayedProbability,
        tier: getHRProbabilityTier(adjustedProbability),
        reasons: enrichReasonsWithGameEnvironment(buildReasons(example), gameEnvironment),
        sportsbookOddsAmerican: odds?.americanOdds ?? null,
        impliedProbability,
        edge,
        valueTag: getValueTag(edge),
        ...getBoardStabilityFields(String(example.batterId), null),
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
}): Promise<DailyHRBoardResponse> {
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
  let priorRankMap: Map<string, number> | null = null;

  try {
    const priorReference = await fetchPriorBoardReference({
      targetDate: cachedBoard.targetDate,
      boardType: sortMode,
    });
    priorRankMap = priorReference ? buildPriorRankMap(priorReference.rows) : null;
  } catch (error) {
    console.warn(
      '[hrDailyBoardService] Failed to load prior board reference; continuing without stability context.',
      error
    );
    priorRankMap = null;
  }

  const applyStabilityContext = (rows: DailyHRBoardRow[]) =>
    rows.map((row) => ({
      ...row,
      ...getBoardStabilityFields(row.batterId, priorRankMap),
    }));

  const confirmedStableRows = applyStabilityContext(confirmedRows);
  const curatedAllStableRows = applyStabilityContext(curatedAllRows);
  let effectiveLineupMode = lineupMode;
  let stabilityAdjustedRows =
    lineupMode === 'confirmed'
      ? confirmedStableRows
      : curatedAllStableRows;

  const confirmedFinalRows = finalizeRows(confirmedStableRows, sortMode, limit);
  if (
    sortMode === 'best' &&
    lineupMode === 'confirmed' &&
    confirmedFinalRows.length < Math.min(limit, 10)
  ) {
    effectiveLineupMode = 'all';
    stabilityAdjustedRows = curatedAllStableRows;
  }

  const confirmedCount = cachedBoard.rows.filter((row) => row.lineupConfirmed).length;
  const unconfirmedCount = cachedBoard.rows.length - confirmedCount;
  const slateEnvironment = summarizeLiveSlateEnvironment(
    stabilityAdjustedRows.map((row) => ({
      gameId: row.gameId,
      predictedProbability: row.modelScore,
      seasonHRPerGame: row.features.seasonHRPerGame,
      parkHrFactor: row.features.parkHrFactor,
      weatherHrImpactScore: row.features.weatherHrImpactScore,
      pitcherHr9: row.features.pitcherHr9,
    }))
  );

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
    slateEnvironment,
    predictedSlateEnvironment: slateEnvironment.slateClass,
    recommendedTopPlaysMin: slateEnvironment.recommendedExposure.minHitters,
    recommendedTopPlaysMax: slateEnvironment.recommendedExposure.maxHitters,
    shouldConsiderSkippingSlate:
      slateEnvironment.recommendedExposure.shouldConsiderSkip,
    rows: finalizeRows(stabilityAdjustedRows, sortMode, limit),
  };
}
