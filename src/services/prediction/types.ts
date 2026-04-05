/**
 * Shared Prediction Types
 *
 * These interfaces are shared across all event prediction models
 * (home run, hit, RBI, single, double, triple, etc.).
 *
 * Each model has its own service file under src/services/prediction/
 * and imports these shared types.
 */

import type { ConfidenceTier, PlatoonAdvantage } from '@/types';

// ─── Re-export core types so model files only need one import ─────────────────
export type { ConfidenceTier, PlatoonAdvantage };

// ─── Supported event types ────────────────────────────────────────────────────

/**
 * All supported prediction event types.
 * Add new event types here as models are implemented.
 */
export type PredictionEventType =
  | 'home_run' |'hit' |'rbi' |'single' |'double' |'triple';

// ─── Shared input building blocks ─────────────────────────────────────────────
// These are identical to the interfaces in hrPredictionService.ts.
// They live here so future models can import from a single location
// without creating a circular dependency on the HR service.

export interface BatterPowerProfile {
  seasonHR?: number;
  seasonGames?: number;
  iso?: number;
  barrelRate?: number;
  exitVelocityAvg?: number;
  hardHitRate?: number;
  flyBallRate?: number;
  hrFbRate?: number;
  xSlugging?: number;
}

export interface BatterContactProfile {
  /** Season batting average */
  avg?: number;
  /** Season OBP */
  obp?: number;
  /** Season SLG */
  slg?: number;
  /** Season OPS */
  ops?: number;
  /** Season RBI */
  rbi?: number;
  /** Season games played */
  seasonGames?: number;
  /** K% (0–100) */
  strikeoutRate?: number;
  /** BB% (0–100) */
  walkRate?: number;
  /** Contact rate % (0–100) */
  contactRate?: number;
  /** Line-drive rate % (0–100) */
  lineDriveRate?: number;
  /** Ground-ball rate % (0–100) */
  groundBallRate?: number;
  /** xBA */
  xBA?: number;
  /** xwOBA */
  xwOBA?: number;
}

export interface BatterRecentForm {
  last7HR?: number;
  last7OPS?: number;
  last7Avg?: number;
  last14HR?: number;
  last14OPS?: number;
  last14Avg?: number;
  last30HR?: number;
  last30OPS?: number;
}

export interface PlatoonSplits {
  bats?: 'L' | 'R' | 'S';
  pitcherThrows?: 'L' | 'R';
  /** vs LHP */
  hrVsLeft?: number;
  paVsLeft?: number;
  avgVsLeft?: number;
  slgVsLeft?: number;
  opsVsLeft?: number;
  /** vs RHP */
  hrVsRight?: number;
  paVsRight?: number;
  avgVsRight?: number;
  slgVsRight?: number;
  opsVsRight?: number;
}

export interface PitcherProfile {
  throws?: 'L' | 'R';
  hr9?: number;
  hrFbRate?: number;
  fbPct?: number;
  era?: number;
  whip?: number;
  kPer9?: number;
  bbPer9?: number;
  recentHr9?: number;
  recentEra?: number;
}

export interface BallparkContext {
  hrFactor?: number;
  elevation?: number;
  name?: string;
}

export interface WeatherContext {
  temp?: number;
  windSpeed?: number;
  windToward?: 'out' | 'in' | 'crosswind' | 'neutral';
  hrImpact?: 'positive' | 'neutral' | 'negative';
  hrImpactScore?: number;
}

export interface TeamOffensiveContext {
  teamSeasonHR?: number;
  teamGames?: number;
  teamOPS?: number;
  teamAvg?: number;
  teamRuns?: number;
}

// ─── Shared output building blocks ────────────────────────────────────────────

export interface FeatureContribution {
  feature: string;
  rawValue: string;
  /** Multiplier delta from 1.0 (e.g. +0.12 means +12%) */
  adjustment: number;
  direction: 'positive' | 'neutral' | 'negative';
}

/**
 * Generic prediction output — all event models return this shape.
 * The `eventType` field identifies which model produced the result.
 */
export interface EventPredictionOutput {
  batterId: string;
  batterName: string;
  eventType: PredictionEventType;
  /** Probability percentage (0–100) */
  probability: number;
  confidenceTier: ConfidenceTier;
  platoonAdvantage: PlatoonAdvantage;
  keyFactors: string[];
  featureBreakdown: FeatureContribution[];
  /** 0–1 fraction of available data points used */
  dataCompleteness: number;
  projectedAtBats: number;
  matchupScore: number;
  parkFactorUsed: number;
  weatherImpactUsed: number;
  /** Optional plain-English explanation */
  explanation?: string;
}

// ─── Base input shape shared by all models ────────────────────────────────────

export interface BasePredictionInput {
  batterId: string;
  batterName: string;
  lineupPosition?: number | null;
  power?: BatterPowerProfile;
  contact?: BatterContactProfile;
  recentForm?: BatterRecentForm;
  platoon?: PlatoonSplits;
  pitcher?: PitcherProfile;
  ballpark?: BallparkContext;
  weather?: WeatherContext;
  teamOffense?: TeamOffensiveContext;
}
