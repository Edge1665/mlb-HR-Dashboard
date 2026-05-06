import { buildPredictionInput } from "@/services/hrPredictionService";
import { fetchLiveMLBData } from "@/services/liveMLBDataService";
import {
  buildHRFeatureExample,
  type HRModelFeatureName,
} from "@/services/ml/hrFeatureEngineering";
import { predictHRXGBoostProbabilityDetails } from "@/services/ml/hrXGBoostModel";
import {
  fetchBatterGameLogs,
  fetchRecentBatterGameLogSummary,
} from "@/services/mlbPlayerGameLogService";
import { fetchRecentPitcherFormSummary } from "@/services/mlbPitcherRecentFormService";
import { getHRProbabilityTier } from "@/services/ml/hrPredictionTiers";
import {
  buildDailyHrOddsLookup,
  findBestOddsMatch,
  type DailyOddsLookup,
} from "@/services/oddsApiService";
import type { HRTrainingExample } from "@/services/ml/types";
import {
  loadHRModelArtifact,
  trainAndSaveHRModelArtifact,
} from "@/services/hrModelArtifactService";
import {
  DEFAULT_SEASON_SAMPLE_WEIGHTS,
  areSeasonSampleWeightsEqual,
  normalizeSeasonSampleWeights,
  serializeSeasonSampleWeights,
  type SeasonSampleWeights,
} from "@/services/ml/hrSeasonWeights";
import {
  buildPriorRankMap,
  fetchPriorBoardReference,
  getBoardStabilityFields,
} from "@/services/hrBoardStabilityService";
import {
  summarizeLiveSlateEnvironment,
  type LiveSlateEnvironmentSummary,
} from "@/services/ml/hrSlateEnvironmentService";
import { buildMlbPlayerResearchProfile } from "@/features/mlbResearch/builders";
import {
  buildStructuredGameContext,
  getOpponentTeamIdForPlayer,
} from "@/services/gamePresentation";
import type {
  MLBPlayerResearchProfile,
  MLBResearchScores,
} from "@/features/mlbResearch/types";

export type DailyBoardSortMode =
  | "model"
  | "probability"
  | "edge"
  | "value"
  | "best";
export type DailyBoardLineupMode = "confirmed" | "all";
export type DailyBoardLineupConfidence =
  | "confirmed"
  | "likely"
  | "uncertain"
  | "low_probability";

export type HRTierLabel =
  | "Tier 1 - Core"
  | "Tier 2 - Strong"
  | "Tier 3 - Value/Longshot"
  | "Tier 4 - Fringe";

export type ValueTierLabel =
  | "Positive Value"
  | "Fair"
  | "Overpriced"
  | "No Odds";

export interface DailyBoardExclusionRecord {
  batterId: string;
  batterName: string;
  reason:
    | "not confirmed lineup"
    | "game already started"
    | "missing odds"
    | "missing probable pitcher"
    | "missing player stats"
    | "filtered by display limit"
    | "missing linked game"
    | "other";
  detail?: string | null;
}

const DEFAULT_CONSERVATIVE_SHRINKAGE = 0.25;

export interface DailyHRBoardRow {
  rank: number;
  batterId: string;
  batterName: string;
  batterPosition: string | null;
  batterBats: "L" | "R" | "S" | null;
  lineupSpot: number | null;
  teamId: string;
  opponentTeamId: string;
  awayTeamId: string;
  homeTeamId: string;
  gameId: string;
  gamePk: string;
  gameTime: string | null;
  matchupLabel: string;
  venueName: string | null;
  ballparkName: string | null;
  opposingPitcherName: string | null;
  opposingPitcherThrows: "L" | "R" | null;
  modelScore: number;
  rawModelProbability: number;
  rawCalibratedProbability: number;
  conservativeProbability: number;
  calibratedHrProbability: number;
  predictedProbability: number;
  tier: string;
  hrTier: HRTierLabel;
  hrTierReason: string;
  reasons: string[];
  sportsbookOddsAmerican: number | null;
  sportsbookImpliedProbability: number | null;
  impliedProbability: number | null;
  modelEdge: number | null;
  edge: number | null;
  modelEdgeRaw: number | null;
  valueScore: number | null;
  valueTier: ValueTierLabel;
  valueTag:
    | "strong_value"
    | "slight_value"
    | "fair"
    | "negative_value"
    | "no_odds";
  morningRank: number | null;
  currentRank: number | null;
  rankChange: number | null;
  wasInMorningTop10: boolean;
  wasInMorningTop20: boolean;
  combinedScore: number | null;
  sportsbook: string | null;
  lineupConfirmed: boolean;
  lineupConfidence: DailyBoardLineupConfidence;
  environment: {
    temp: number | null;
    condition: string | null;
    windSpeed: number | null;
    windDirection: string | null;
    windToward: "in" | "out" | "crosswind" | "neutral" | null;
    windOutToCenter: number | null;
    windInFromCenter: number | null;
    crosswind: number | null;
    precipitation: number | null;
    hrImpact: "positive" | "neutral" | "negative" | null;
    hrImpactScore: number | null;
    parkHrFactor: number;
  };
  environmentDebug: {
    homeTeam: string;
    awayTeam: string;
    parkName: string | null;
    parkFactor: number;
    temperature: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    environmentScore: number;
    environmentContributionToFinalScore: number;
  };
  features: {
    seasonHRPerGame: number;
    barrelRate: number;
    hardHitRate: number;
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
  research: MLBPlayerResearchProfile;
  researchScores: MLBResearchScores;
}

export interface DailyHRBoardDiagnostics {
  snapshotType: string | null;
  lineupMode: DailyBoardLineupMode;
  totalCandidatesBeforeFilters: number;
  totalCandidatesAfterFilters: number;
  artifactVersion: string;
  calibrationBucketCount: number;
  globalPositiveRate: number;
  probabilitySummary: {
    rawMin: number;
    rawMedian: number;
    rawMax: number;
    calibratedMin: number;
    calibratedMedian: number;
    calibratedMax: number;
  };
  tierCounts: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
  };
  valueCounts: {
    positiveValue: number;
    fair: number;
    overpriced: number;
    noOdds: number;
  };
  exclusionCounts: Record<string, number>;
  exclusions: DailyBoardExclusionRecord[];
}

export interface DailyHROddsStatus {
  status: "live" | "cached" | "unavailable";
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
  predictedSlateEnvironment: LiveSlateEnvironmentSummary["slateClass"];
  recommendedTopPlaysMin: number;
  recommendedTopPlaysMax: number;
  shouldConsiderSkippingSlate: boolean;
  includeFringe: boolean;
  diagnostics: DailyHRBoardDiagnostics;
  rows: DailyHRBoardRow[];
  fullRows: DailyHRBoardRow[];
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
  artifactVersion: string;
  calibrationBucketCount: number;
  globalPositiveRate: number;
  buildExclusions: DailyBoardExclusionRecord[];
  rows: DailyHRBoardRow[];
}

interface GameEnvironmentAdjustment {
  multiplier: number;
  weatherScore: number;
  parkFactor: number;
  averagePitcherHr9: number;
}

const BOARD_CACHE_TTL_MS = 60 * 1000;
const LIVE_BOARD_CACHE_VERSION = "live-board-v3";
const BENCH_LIKE_POSITIONS = new Set(["PH", "PR", "BN", "BENCH"]);

const globalCache = globalThis as typeof globalThis & {
  __hrDailyBoardCache?: Record<string, CachedBoardPayload>;
};

if (!globalCache.__hrDailyBoardCache) {
  globalCache.__hrDailyBoardCache = {};
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
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

function getHrTierDetails(
  rank: number,
  totalCandidates: number,
): Pick<DailyHRBoardRow, "hrTier" | "hrTierReason"> {
  const displayedCandidateCount = Math.min(totalCandidates, 25);
  const tier1Threshold = Math.max(5, Math.ceil(displayedCandidateCount * 0.1));

  if (rank <= tier1Threshold) {
    return {
      hrTier: "Tier 1 - Core",
      hrTierReason: "Top ranked model candidate",
    };
  }

  if (rank <= 12) {
    return {
      hrTier: "Tier 2 - Strong",
      hrTierReason: "Strong model profile but not elite",
    };
  }

  if (rank <= 25) {
    return {
      hrTier: "Tier 3 - Value/Longshot",
      hrTierReason: "Useful value/longshot candidate",
    };
  }

  return {
    hrTier: "Tier 4 - Fringe",
    hrTierReason: "Fringe candidate",
  };
}

function getValueTier(
  edge: number | null,
  valueScore: number | null,
): ValueTierLabel {
  if (edge == null || valueScore == null) {
    return "No Odds";
  }

  if (edge >= 0.02 && valueScore >= 1.5) {
    return "Positive Value";
  }

  if (edge >= -0.015) {
    return "Fair";
  }

  return "Overpriced";
}

function getValueTagFromTier(
  valueTier: ValueTierLabel,
): DailyHRBoardRow["valueTag"] {
  if (valueTier === "Positive Value") {
    return "strong_value";
  }

  if (valueTier === "Fair") {
    return "fair";
  }

  if (valueTier === "Overpriced") {
    return "negative_value";
  }

  return "no_odds";
}

function calculateValueScore(params: {
  calibratedHrProbability: number;
  impliedProbability: number | null;
  sportsbookOddsAmerican: number | null;
}): number | null {
  if (
    params.impliedProbability == null ||
    params.sportsbookOddsAmerican == null ||
    !Number.isFinite(params.impliedProbability)
  ) {
    return null;
  }

  const edge = params.calibratedHrProbability - params.impliedProbability;
  const edgeComponent = clamp(edge * 220, -8, 14);
  const probabilityComponent = clamp(
    (params.calibratedHrProbability - 0.08) * 120,
    -3,
    8,
  );
  const plusMoneyBoost =
    params.sportsbookOddsAmerican > 0
      ? clamp((Math.min(params.sportsbookOddsAmerican, 550) - 100) / 90, 0, 5)
      : clamp((params.sportsbookOddsAmerican + 200) / 110, -2, 1);
  const extremeLongshotPenalty =
    params.sportsbookOddsAmerican > 650
      ? clamp((params.sportsbookOddsAmerican - 650) / 100, 0, 6)
      : 0;

  return roundTo(
    edgeComponent + probabilityComponent + plusMoneyBoost - extremeLongshotPenalty,
    3,
  );
}

function summarizeProbabilityValues(
  rows: DailyHRBoardRow[],
): DailyHRBoardDiagnostics["probabilitySummary"] {
  if (rows.length === 0) {
    return {
      rawMin: 0,
      rawMedian: 0,
      rawMax: 0,
      calibratedMin: 0,
      calibratedMedian: 0,
      calibratedMax: 0,
    };
  }

  const rawValues = rows.map((row) => row.rawModelProbability);
  const calibratedValues = rows.map((row) => row.calibratedHrProbability);

  return {
    rawMin: roundTo(Math.min(...rawValues), 4),
    rawMedian: roundTo(getMedian(rawValues), 4),
    rawMax: roundTo(Math.max(...rawValues), 4),
    calibratedMin: roundTo(Math.min(...calibratedValues), 4),
    calibratedMedian: roundTo(getMedian(calibratedValues), 4),
    calibratedMax: roundTo(Math.max(...calibratedValues), 4),
  };
}

function getSeasonFromDate(value: string): number {
  const [year] = value.slice(0, 10).split("-").map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
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
    reasons.push(
      `Homered in ${(example.recentGamesWithHR * 100).toFixed(0)}% of recent games`,
    );
  }

  if (example.platoonEdge >= 1) {
    reasons.push("Has platoon advantage");
  }

  if (example.projectedAtBats >= 4.1) {
    reasons.push(
      `High projected volume (${example.projectedAtBats.toFixed(1)} AB)`,
    );
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
  gameEnvironment: GameEnvironmentAdjustment,
): string[] {
  const enhanced = [...reasons];

  if (gameEnvironment.multiplier >= 1.07) {
    enhanced.push(
      `HR-friendly game environment (${gameEnvironment.multiplier.toFixed(2)}x)`,
    );
  } else if (gameEnvironment.multiplier <= 0.95) {
    enhanced.push(
      `HR-suppressing game environment (${gameEnvironment.multiplier.toFixed(2)}x)`,
    );
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
  const pitcherHr9Values = [
    params.awayPitcherHr9,
    params.homePitcherHr9,
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  const averagePitcherHr9 =
    pitcherHr9Values.length > 0
      ? pitcherHr9Values.reduce((sum, value) => sum + value, 0) /
        pitcherHr9Values.length
      : 1.1;

  // Shared slate-level context:
  // weather carries the most weight, park is next, and the two probable starters
  // add a modest game-wide signal without overpowering the hitter-specific model.
  const weatherAdjustment = weatherScore * 0.035;
  const parkAdjustment = (parkFactor - 1) * 0.22;
  const pitcherAdjustment = clamp(
    (averagePitcherHr9 - 1.1) * 0.045,
    -0.04,
    0.05,
  );
  const multiplier = clamp(
    1 + weatherAdjustment + parkAdjustment + pitcherAdjustment,
    0.88,
    1.14,
  );

  return {
    multiplier,
    weatherScore,
    parkFactor,
    averagePitcherHr9,
  };
}

function getValueTag(edge: number | null): DailyHRBoardRow["valueTag"] {
  if (edge == null || !Number.isFinite(edge)) {
    return "no_odds";
  }

  if (edge >= 0.03) {
    return "strong_value";
  }

  if (edge > 0) {
    return "slight_value";
  }

  if (edge >= -0.02) {
    return "fair";
  }

  return "negative_value";
}

function classifyLineupConfidence(params: {
  lineupConfirmed: boolean;
  lineupSpot: number | null;
  position: string | null;
  gameLineupStatus: "confirmed" | "projected" | "unknown";
}): DailyBoardLineupConfidence {
  const normalizedPosition = params.position?.trim().toUpperCase() ?? null;
  const hasPostedLineupSpot =
    typeof params.lineupSpot === "number" && params.lineupSpot > 0;

  if (normalizedPosition && BENCH_LIKE_POSITIONS.has(normalizedPosition)) {
    return "low_probability";
  }

  if (params.lineupConfirmed || params.gameLineupStatus === "confirmed") {
    return "confirmed";
  }

  if (hasPostedLineupSpot && params.gameLineupStatus === "projected") {
    return "likely";
  }

  if (hasPostedLineupSpot || normalizedPosition) {
    return "uncertain";
  }

  return "low_probability";
}

function sortRows(
  rows: DailyHRBoardRow[],
  sortMode: DailyBoardSortMode,
): DailyHRBoardRow[] {
  if (sortMode === "edge") {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const aEdge = a.edge ?? -999;
      const bEdge = b.edge ?? -999;
      if (bEdge !== aEdge) return bEdge - aEdge;
      return b.calibratedHrProbability - a.calibratedHrProbability;
    });

    return sorted;
  }

  if (sortMode === "probability") {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (b.calibratedHrProbability !== a.calibratedHrProbability) {
        return b.calibratedHrProbability - a.calibratedHrProbability;
      }

      return b.modelScore - a.modelScore;
    });

    return sorted;
  }

  if (sortMode === "value") {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const aValue = a.valueScore ?? -999;
      const bValue = b.valueScore ?? -999;
      if (bValue !== aValue) return bValue - aValue;

      const aEdge = a.modelEdge ?? -999;
      const bEdge = b.modelEdge ?? -999;
      if (bEdge !== aEdge) return bEdge - aEdge;

      return b.calibratedHrProbability - a.calibratedHrProbability;
    });

    return sorted;
  }

  const sorted = [...rows];

  if (sortMode === "best") {
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

function finalizeRows(
  rows: DailyHRBoardRow[],
  sortMode: DailyBoardSortMode,
  limit: number,
): DailyHRBoardRow[] {
  const sortedRows = sortRows(rows, sortMode);

  return sortedRows
    .map((row, index) => {
      const hrTierDetails = getHrTierDetails(index + 1, sortedRows.length);

      return {
      ...row,
      rank: index + 1,
      currentRank: index + 1,
      rankChange:
        row.morningRank != null ? row.morningRank - (index + 1) : null,
      ...hrTierDetails,
      rawModelProbability: roundTo(row.rawModelProbability, 4),
      rawCalibratedProbability: Number(row.rawCalibratedProbability.toFixed(3)),
      conservativeProbability: Number(row.conservativeProbability.toFixed(3)),
      calibratedHrProbability: Number(row.calibratedHrProbability.toFixed(3)),
      predictedProbability: Number(row.predictedProbability.toFixed(3)),
      sportsbookImpliedProbability:
        row.sportsbookImpliedProbability != null
          ? Number(row.sportsbookImpliedProbability.toFixed(3))
          : null,
      impliedProbability:
        row.impliedProbability != null
          ? Number(row.impliedProbability.toFixed(3))
          : null,
      modelEdge:
        row.modelEdge != null ? Number(row.modelEdge.toFixed(3)) : null,
      edge: row.edge != null ? Number(row.edge.toFixed(3)) : null,
      modelEdgeRaw:
        row.modelEdgeRaw != null ? Number(row.modelEdgeRaw.toFixed(3)) : null,
      valueScore:
        row.valueScore != null ? Number(row.valueScore.toFixed(3)) : null,
      combinedScore:
        row.combinedScore != null ? Number(row.combinedScore.toFixed(3)) : null,
      environmentDebug: {
        ...row.environmentDebug,
        parkFactor: roundTo(row.environmentDebug.parkFactor, 3),
        environmentScore: roundTo(row.environmentDebug.environmentScore, 3),
        environmentContributionToFinalScore: roundTo(
          row.environmentDebug.environmentContributionToFinalScore,
          4,
        ),
      },
    };
    })
    .slice(0, limit);
}

function filterRowsByLineupMode(
  rows: DailyHRBoardRow[],
  lineupMode: DailyBoardLineupMode,
): DailyHRBoardRow[] {
  if (lineupMode === "all") {
    return rows;
  }

  return rows.filter((row) => row.lineupConfirmed);
}

function isBettableHrCandidate(player: DailyHRBoardRow): boolean {
  const passesQualitySignal =
    player.features.barrelRate >= 8 ||
    player.features.hardHitRate >= 40 ||
    player.features.iso >= 0.18 ||
    player.features.seasonHRPerGame >= 0.18;

  return passesQualitySignal && player.features.projectedAtBats >= 3.5;
}

function filterDisplayedRowsByBettableProfile(
  rows: DailyHRBoardRow[],
  includeFringe: boolean,
): DailyHRBoardRow[] {
  if (includeFringe) {
    console.info("[hrDailyBoardService] Fringe filter bypassed", {
      beforeCount: rows.length,
      afterCount: rows.length,
      includeFringe,
    });
    return rows;
  }

  const filteredRows = rows.filter(isBettableHrCandidate);

  console.info("[hrDailyBoardService] Applied bettable HR filter", {
    beforeCount: rows.length,
    afterCount: filteredRows.length,
    includeFringe,
  });

  return filteredRows;
}

function buildBoardDiagnostics(params: {
  snapshotType: string | null;
  lineupMode: DailyBoardLineupMode;
  totalCandidatesBeforeFilters: number;
  filteredRows: DailyHRBoardRow[];
  artifactVersion: string;
  calibrationBucketCount: number;
  globalPositiveRate: number;
  buildExclusions: DailyBoardExclusionRecord[];
  lineupExclusions: DailyBoardExclusionRecord[];
  displayLimitExclusions: DailyBoardExclusionRecord[];
}): DailyHRBoardDiagnostics {
  const allExclusions = [
    ...params.buildExclusions,
    ...params.lineupExclusions,
    ...params.displayLimitExclusions,
  ];
  const exclusionCounts = allExclusions.reduce<Record<string, number>>(
    (accumulator, entry) => {
      accumulator[entry.reason] = (accumulator[entry.reason] ?? 0) + 1;
      return accumulator;
    },
    {},
  );
  const probabilitySummary =
    params.filteredRows.length > 0
      ? summarizeProbabilityValues(params.filteredRows)
      : {
          rawMin: 0,
          rawMedian: 0,
          rawMax: 0,
          calibratedMin: 0,
          calibratedMedian: 0,
          calibratedMax: 0,
        };

  const tierCounts = params.filteredRows.reduce(
    (accumulator, row) => {
      if (row.hrTier === "Tier 1 - Core") accumulator.tier1 += 1;
      else if (row.hrTier === "Tier 2 - Strong") accumulator.tier2 += 1;
      else if (row.hrTier === "Tier 3 - Value/Longshot") accumulator.tier3 += 1;
      else accumulator.tier4 += 1;

      return accumulator;
    },
    { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
  );

  const valueCounts = params.filteredRows.reduce(
    (accumulator, row) => {
      if (row.valueTier === "Positive Value") accumulator.positiveValue += 1;
      else if (row.valueTier === "Fair") accumulator.fair += 1;
      else if (row.valueTier === "Overpriced") accumulator.overpriced += 1;
      else accumulator.noOdds += 1;

      return accumulator;
    },
    { positiveValue: 0, fair: 0, overpriced: 0, noOdds: 0 },
  );

  return {
    snapshotType: params.snapshotType,
    lineupMode: params.lineupMode,
    totalCandidatesBeforeFilters: params.totalCandidatesBeforeFilters,
    totalCandidatesAfterFilters: params.filteredRows.length,
    artifactVersion: params.artifactVersion,
    calibrationBucketCount: params.calibrationBucketCount,
    globalPositiveRate: roundTo(params.globalPositiveRate, 4),
    probabilitySummary,
    tierCounts,
    valueCounts,
    exclusionCounts,
    exclusions: allExclusions,
  };
}

async function buildFreshBoard(options: {
  targetDate: string;
  trainingStartDate: string;
  sportsbooks?: string[];
  seasonSampleWeights?: SeasonSampleWeights;
}): Promise<CachedBoardPayload> {
  const { targetDate, trainingStartDate, sportsbooks } = options;
  const seasonSampleWeights = normalizeSeasonSampleWeights(
    options.seasonSampleWeights ?? DEFAULT_SEASON_SAMPLE_WEIGHTS,
  );
  const season = getSeasonFromDate(targetDate);
  let loadedArtifact = await loadHRModelArtifact();
  const buildExclusions: DailyBoardExclusionRecord[] = [];

  if (
    !loadedArtifact ||
    loadedArtifact.artifact.trainingStartDate !== trainingStartDate ||
    (loadedArtifact.artifact.calibration?.buckets?.length ?? 0) === 0 ||
    !areSeasonSampleWeightsEqual(
      loadedArtifact.artifact.seasonSampleWeights,
      seasonSampleWeights,
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

  const { batters, pitchers, games, ballparks, teams } =
    await fetchLiveMLBData(targetDate);
  const gameEnvironmentById = new Map<string, GameEnvironmentAdjustment>();

  for (const game of games) {
    const ballpark = game.ballparkId ? ballparks[game.ballparkId] : undefined;
    const awayPitcherHr9 = game.awayPitcherId
      ? pitchers[game.awayPitcherId]?.hr9
      : undefined;
    const homePitcherHr9 = game.homePitcherId
      ? pitchers[game.homePitcherId]?.hr9
      : undefined;

    gameEnvironmentById.set(
      String(game.id),
      buildGameEnvironmentAdjustment({
        weatherScore: game.weather?.hrImpactScore,
        parkFactor: ballpark?.hrFactor,
        awayPitcherHr9,
        homePitcherHr9,
      }),
    );
  }

  let oddsLookup: DailyOddsLookup = {
    byPlayerName: {},
    status: "unavailable",
    cachedAt: null,
    cacheTtlMinutes: 10,
  };
  try {
    oddsLookup = await buildDailyHrOddsLookup(
      games.map((g) => ({
        awayTeamId: String(g.awayTeamId),
        homeTeamId: String(g.homeTeamId),
      })),
      sportsbooks,
    );
  } catch (error) {
    console.warn(
      "[hrDailyBoardService] Failed to load odds lookup; continuing without odds.",
      error,
    );
    oddsLookup = {
      byPlayerName: {},
      status: "unavailable",
      cachedAt: null,
      cacheTtlMinutes: 10,
    };
  }

  const batterList = Object.values(batters);

  const predictionRows = await mapWithConcurrency(
    batterList,
    8,
    async (batter): Promise<DailyHRBoardRow | null> => {
      if (!batter?.id || !batter?.teamId) {
        buildExclusions.push({
          batterId: String(batter?.id ?? "unknown"),
          batterName: batter?.name ?? "Unknown batter",
          reason: "missing player stats",
          detail: "Missing batter id or team id.",
        });
        return null;
      }

      const game =
        games.find((g) => g.id === batter.gameId) ??
        games.find(
          (g) => g.awayTeamId === batter.teamId || g.homeTeamId === batter.teamId,
        );
      if (!game) {
        buildExclusions.push({
          batterId: String(batter.id),
          batterName: batter.name ?? "Unknown batter",
          reason: "missing linked game",
          detail: "No scheduled game was linked to the hitter.",
        });
        return null;
      }

      const isHome = game.homeTeamId === batter.teamId;
      const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
      const pitcher = pitcherId
        ? (pitchers[pitcherId] ?? undefined)
        : undefined;
      const ballpark = game.ballparkId
        ? (ballparks[game.ballparkId] ?? undefined)
        : undefined;
      const gameContext = buildStructuredGameContext({
        gamePk: game.id,
        awayTeamId: game.awayTeamId,
        homeTeamId: game.homeTeamId,
        venueName: ballpark?.name ?? null,
      });

      const input = buildPredictionInput(batter, pitcher, game, ballpark);
      const baseExample = buildHRFeatureExample(input, 0, targetDate);

      let batterGameLogs: Awaited<ReturnType<typeof fetchBatterGameLogs>> = [];
      let recentBatterLog = null;
      try {
        const logs = await fetchBatterGameLogs(String(batter.id), targetDate, {
          season,
        });
        batterGameLogs = logs;
        recentBatterLog = await fetchRecentBatterGameLogSummary(
          String(batter.id),
          targetDate,
          {
            season,
            gamesBack: 10,
          },
        );
      } catch {
        batterGameLogs = [];
        recentBatterLog = null;
      }

      let recentPitcherForm = null;
      try {
        if (pitcherId) {
          recentPitcherForm = await fetchRecentPitcherFormSummary(
            String(pitcherId),
            targetDate,
            {
              season,
              gamesBack: 3,
            },
          );
        }
      } catch {
        recentPitcherForm = null;
      }

      const example: HRTrainingExample = {
        ...baseExample,
        recentHardHits:
          recentBatterLog?.recentHardHitsProxy ?? baseExample.recentHardHits,
        recentExtraBaseHits:
          recentBatterLog?.recentExtraBaseHits ??
          baseExample.recentExtraBaseHits,
        recentHrTrend:
          recentBatterLog?.recentHrTrend ?? baseExample.recentHrTrend,
        recentPowerScore:
          recentBatterLog?.recentPowerScore ?? baseExample.recentPowerScore,
        recentGamesWithHR:
          recentBatterLog?.recentGamesWithHR ?? baseExample.recentGamesWithHR,
        multiHRGamesLast30:
          recentBatterLog?.multiHRGamesLast30 ?? baseExample.multiHRGamesLast30,
        recentPitcherHr9:
          recentPitcherForm?.recentHrPer9 ?? baseExample.recentPitcherHr9,
        label: 0,
      };

      const probabilityDetails = predictHRXGBoostProbabilityDetails(
        model,
        example,
        artifact.standardization,
        artifact.calibration,
        artifact.params.probabilityPower,
        artifact.params.conservativeShrinkage ?? DEFAULT_CONSERVATIVE_SHRINKAGE,
        artifact.featureNames as HRModelFeatureName[],
      );
      const rawModelProbability = probabilityDetails.rawModelProbability;
      const rawCalibratedProbability =
        probabilityDetails.rawCalibratedProbability;
      const conservativeProbability =
        probabilityDetails.conservativeProbability;
      const gameEnvironment =
        gameEnvironmentById.get(String(game.id)) ??
        buildGameEnvironmentAdjustment({
          weatherScore: game.weather?.hrImpactScore,
          parkFactor: ballpark?.hrFactor,
          awayPitcherHr9: game.awayPitcherId
            ? pitchers[game.awayPitcherId]?.hr9
            : undefined,
          homePitcherHr9: game.homePitcherId
            ? pitchers[game.homePitcherId]?.hr9
            : undefined,
        });
      const adjustedProbability = clamp(
        conservativeProbability * gameEnvironment.multiplier,
        0,
        0.6,
      );
      const modelScore = adjustedProbability;
      const calibratedHrProbability =
        remapDisplayedHrProbability(adjustedProbability);

      const odds = findBestOddsMatch(
        oddsLookup.byPlayerName,
        example.batterName,
      );
      const impliedProbability = odds?.impliedProbability ?? null;
      const sportsbookImpliedProbability = impliedProbability;
      const modelEdgeRaw =
        impliedProbability != null
          ? adjustedProbability - impliedProbability
          : null;
      const modelEdge =
        impliedProbability != null
          ? calibratedHrProbability - impliedProbability
          : null;
      const edge = modelEdge;
      const valueScore = calculateValueScore({
        calibratedHrProbability,
        impliedProbability,
        sportsbookOddsAmerican: odds?.americanOdds ?? null,
      });
      const valueTier = getValueTier(edge, valueScore);
      const team = teams[String(batter.teamId)];
      const opponentTeam =
        teams[
          getOpponentTeamIdForPlayer(game, String(batter.teamId))
        ];
      const gameLineupStatus = isHome
        ? game.lineupStatus.home
        : game.lineupStatus.away;
      const lineupConfirmed = batter.lineupConfirmed !== false;
      const lineupConfidence = classifyLineupConfidence({
        lineupConfirmed,
        lineupSpot: batter.lineupSpot ?? null,
        position: batter.position ?? null,
        gameLineupStatus,
      });
      const research = buildMlbPlayerResearchProfile({
        batter,
        pitcher,
        game,
        ballpark,
        team,
        opponentTeam,
        isHome,
        boardRow: {
          modelScore,
          predictedProbability: calibratedHrProbability,
          edge,
        },
        odds,
        oddsLookup,
        batterGameLogs,
        recentPitcherForm,
      });

      const row: DailyHRBoardRow = {
        rank: 0,
        batterId: String(example.batterId),
        batterName: example.batterName,
        batterPosition: batter.position ?? null,
        batterBats: batter.bats ?? null,
        lineupSpot: batter.lineupSpot ?? null,
        teamId: String(batter.teamId),
        opponentTeamId: getOpponentTeamIdForPlayer(game, String(batter.teamId)),
        awayTeamId: gameContext.awayTeamId,
        homeTeamId: gameContext.homeTeamId,
        gameId: String(game.id),
        gamePk: gameContext.gamePk,
        gameTime: game.timeET ?? game.time ?? null,
        matchupLabel: gameContext.matchupLabel,
        venueName: gameContext.venueName,
        ballparkName: ballpark?.name ?? null,
        opposingPitcherName: pitcher?.name ?? null,
        opposingPitcherThrows: pitcher?.throws ?? null,
        modelScore,
        rawModelProbability,
        rawCalibratedProbability,
        conservativeProbability,
        calibratedHrProbability,
        predictedProbability: calibratedHrProbability,
        tier: getHRProbabilityTier(adjustedProbability),
        hrTier: "Tier 4 - Fringe",
        hrTierReason: "Fringe candidate",
        reasons: enrichReasonsWithGameEnvironment(
          buildReasons(example),
          gameEnvironment,
        ),
        sportsbookOddsAmerican: odds?.americanOdds ?? null,
        sportsbookImpliedProbability,
        impliedProbability,
        modelEdge,
        edge,
        modelEdgeRaw,
        valueScore,
        valueTier,
        valueTag: getValueTagFromTier(valueTier),
        ...getBoardStabilityFields(String(example.batterId), null),
        combinedScore: null,
        sportsbook: odds?.sportsbook ?? null,
        lineupConfirmed,
        lineupConfidence,
        environment: {
          temp: game.weather?.temp ?? null,
          condition: game.weather?.condition ?? null,
          windSpeed: game.weather?.windSpeed ?? null,
          windDirection: game.weather?.windDirection ?? null,
          windToward: game.weather?.windToward ?? null,
          windOutToCenter: game.weather?.windOutToCenter ?? null,
          windInFromCenter: game.weather?.windInFromCenter ?? null,
          crosswind: game.weather?.crosswind ?? null,
          precipitation: game.weather?.precipitation ?? null,
          hrImpact: game.weather?.hrImpact ?? null,
          hrImpactScore: game.weather?.hrImpactScore ?? null,
          parkHrFactor: ballpark?.hrFactor ?? example.parkHrFactor,
        },
        environmentDebug: {
          homeTeam: String(game.homeTeamId),
          awayTeam: String(game.awayTeamId),
          parkName: ballpark?.name ?? null,
          parkFactor: ballpark?.hrFactor ?? example.parkHrFactor,
          temperature: game.weather?.temp ?? null,
          windSpeed: game.weather?.windSpeed ?? null,
          windDirection: game.weather?.windDirection ?? null,
          environmentScore: (gameEnvironment.multiplier - 1) * 100,
          environmentContributionToFinalScore:
            adjustedProbability - conservativeProbability,
        },
        features: {
          seasonHRPerGame: example.seasonHRPerGame,
          barrelRate: example.barrelRate,
          hardHitRate: example.hardHitRate,
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
        research,
        researchScores: research.scores,
      };

      return row;
    },
  );

  const validRows = predictionRows.filter(
    (row): row is DailyHRBoardRow => Boolean(row),
  );
  const rawSummary = summarizeProbabilityValues(validRows);

  console.info("[hrDailyBoardService] Live board artifact diagnostics", {
    artifactVersion: `v${artifact.version}`,
    calibrationBucketCount: artifact.calibration.buckets.length,
    globalPositiveRate: roundTo(artifact.calibration.globalPositiveRate, 4),
    rawProbabilitySummary: {
      min: rawSummary.rawMin,
      median: rawSummary.rawMedian,
      max: rawSummary.rawMax,
    },
    calibratedProbabilitySummary: {
      min: rawSummary.calibratedMin,
      median: rawSummary.calibratedMedian,
      max: rawSummary.calibratedMax,
    },
  });

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
    artifactVersion: `v${artifact.version}`,
    calibrationBucketCount: artifact.calibration.buckets.length,
    globalPositiveRate: artifact.calibration.globalPositiveRate,
    buildExclusions,
    rows: validRows,
  };
}

async function getCachedOrFreshBoard(options: {
  targetDate: string;
  trainingStartDate: string;
  sportsbooks?: string[];
  seasonSampleWeights?: SeasonSampleWeights;
}): Promise<CachedBoardPayload> {
  const booksKey = (options.sportsbooks ?? [])
    .map((book) => book.trim())
    .sort()
    .join(",");
  const seasonWeightsKey = serializeSeasonSampleWeights(
    options.seasonSampleWeights,
  );
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
  includeFringe?: boolean;
  sportsbooks?: string[];
  seasonSampleWeights?: SeasonSampleWeights;
}): Promise<DailyHRBoardResponse> {
  const targetDate = options?.targetDate ?? getTodayETDateString();
  const trainingStartDate = options?.trainingStartDate ?? "2024-03-28";
  const limit = options?.limit ?? 25;
  const sortMode = options?.sortMode ?? "model";
  const includeFringe = options?.includeFringe ?? false;
  const lineupMode =
    options?.lineupMode ?? (sortMode === "edge" ? "all" : "confirmed");

  const cachedBoard = await getCachedOrFreshBoard({
    targetDate,
    trainingStartDate,
    sportsbooks: options?.sportsbooks,
    seasonSampleWeights: options?.seasonSampleWeights,
  });

  const confirmedRows = filterRowsByLineupMode(cachedBoard.rows, "confirmed");
  const allRows = filterRowsByLineupMode(cachedBoard.rows, "all");
  let priorRankMap: Map<string, number> | null = null;

  try {
    const priorReference = await fetchPriorBoardReference({
      targetDate: cachedBoard.targetDate,
      boardType:
        sortMode === "probability" || sortMode === "value" ? "model" : sortMode,
    });
    priorRankMap = priorReference
      ? buildPriorRankMap(priorReference.rows)
      : null;
  } catch (error) {
    console.warn(
      "[hrDailyBoardService] Failed to load prior board reference; continuing without stability context.",
      error,
    );
    priorRankMap = null;
  }

  const applyStabilityContext = (rows: DailyHRBoardRow[]) =>
    rows.map((row) => ({
      ...row,
      ...getBoardStabilityFields(row.batterId, priorRankMap),
    }));

  const confirmedStableRows = applyStabilityContext(confirmedRows);
  const allStableRows = applyStabilityContext(allRows);
  let stabilityAdjustedRows =
    lineupMode === "confirmed" ? confirmedStableRows : allStableRows;

  const lineupExclusions: DailyBoardExclusionRecord[] =
    lineupMode === "confirmed"
      ? allStableRows
          .filter((row) => !row.lineupConfirmed)
          .map((row) => ({
            batterId: row.batterId,
            batterName: row.batterName,
            reason: "not confirmed lineup" as const,
            detail: "Excluded because confirmed-only mode is active.",
          }))
      : [];

  const confirmedCount = cachedBoard.rows.filter(
    (row) => row.lineupConfirmed,
  ).length;
  const unconfirmedCount = cachedBoard.rows.length - confirmedCount;
  const finalizedAllRows = finalizeRows(
    stabilityAdjustedRows,
    sortMode,
    stabilityAdjustedRows.length,
  );
  const displayLimitExclusions = finalizedAllRows
    .slice(limit)
    .map((row) => ({
      batterId: row.batterId,
      batterName: row.batterName,
      reason: "filtered by display limit" as const,
      detail: `Excluded from the visible board because it ranked outside the top ${limit}.`,
    }));
  const slateEnvironment = summarizeLiveSlateEnvironment(
    stabilityAdjustedRows.map((row) => ({
      gameId: row.gameId,
      predictedProbability: row.modelScore,
      seasonHRPerGame: row.features.seasonHRPerGame,
      parkHrFactor: row.features.parkHrFactor,
      weatherHrImpactScore: row.features.weatherHrImpactScore,
      pitcherHr9: row.features.pitcherHr9,
    })),
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
      status: cachedBoard.odds?.status ?? "unavailable",
      cachedAt: cachedBoard.odds?.cachedAt ?? null,
      cacheTtlMinutes: cachedBoard.odds?.cacheTtlMinutes ?? 10,
    },
    sortMode,
    lineupMode,
    confirmedCount,
    unconfirmedCount,
    slateEnvironment,
    predictedSlateEnvironment: slateEnvironment.slateClass,
    recommendedTopPlaysMin: slateEnvironment.recommendedExposure.minHitters,
    recommendedTopPlaysMax: slateEnvironment.recommendedExposure.maxHitters,
    shouldConsiderSkippingSlate:
      slateEnvironment.recommendedExposure.shouldConsiderSkip,
    includeFringe,
    diagnostics: buildBoardDiagnostics({
      snapshotType: options?.lineupMode === "confirmed" ? "confirmed_only" : "full_day",
      lineupMode,
      totalCandidatesBeforeFilters: cachedBoard.rows.length,
      filteredRows: finalizedAllRows,
      artifactVersion: cachedBoard.artifactVersion,
      calibrationBucketCount: cachedBoard.calibrationBucketCount,
      globalPositiveRate: cachedBoard.globalPositiveRate,
      buildExclusions: cachedBoard.buildExclusions,
      lineupExclusions,
      displayLimitExclusions,
    }),
    rows: finalizedAllRows.slice(0, limit),
    fullRows: finalizedAllRows,
  };
}
