import type { HRPredictionInput } from '@/services/hrPredictionService';
import type { HRTrainingExample } from './types';

export const HR_MODEL_FEATURES = [
  'seasonHRPerGame',
  'barrelRate',
  'exitVelocityAvg',
  'iso',
  'hardHitRate',
  'xSlugging',
  'pitcherHr9',
  'parkHrFactor',
  'projectedAtBats',
  'platoonEdge',
  'last7HR',
  'last14HR',
  'last30HR',
  'recentHardHits',
  'recentExtraBaseHits',
  'recentHrTrend',
  'recentPowerScore',
  'pitcherRecentRisk',
  'platoonPowerInteraction',
  'environmentScore',
  'recentGamesWithHR',
  'multiHRGamesLast30',
  'recentPitcherHr9',
] as const;

export type HRModelFeatureName = (typeof HR_MODEL_FEATURES)[number];

const LINEUP_PA_MAP: Record<number, number> = {
  1: 4.4,
  2: 4.3,
  3: 4.2,
  4: 4.1,
  5: 3.9,
  6: 3.8,
  7: 3.7,
  8: 3.6,
  9: 3.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  return numerator / denominator;
}

function regressRate(
  observedRate: number,
  sampleSize: number,
  priorRate: number,
  stabilization: number
): number {
  const stabilizedWeight = safeDivide(sampleSize, sampleSize + stabilization, 0);
  return observedRate * stabilizedWeight + priorRate * (1 - stabilizedWeight);
}

export function getProjectedAtBats(lineupPosition?: number | null): number {
  if (lineupPosition == null) return 3.8;
  return LINEUP_PA_MAP[lineupPosition] ?? 3.8;
}

export function getPlatoonEdge(
  bats?: 'L' | 'R' | 'S',
  pitcherThrows?: 'L' | 'R'
): number {
  if (!bats || !pitcherThrows) return 0;
  if (bats === 'S') return 1;
  return bats !== pitcherThrows ? 1 : 0;
}

export function buildHRFeatureExample(
  input: HRPredictionInput,
  label: 0 | 1,
  gameDate: string
): HRTrainingExample {
  const seasonGames = input.power?.seasonGames ?? 0;
  const seasonHrRateRaw = safeDivide(input.power?.seasonHR ?? 0, seasonGames, 0.12);
  const seasonHRPerGame = regressRate(seasonHrRateRaw, seasonGames, 0.12, 40);

  const teamGames = input.teamOffense?.teamGames ?? 0;
  const teamHrRateRaw = safeDivide(input.teamOffense?.teamSeasonHR ?? 0, teamGames, 1.1);
  const teamHrPerGame = regressRate(teamHrRateRaw, teamGames, 1.1, 40);

  const barrelRate = clamp(input.power?.barrelRate ?? 8, 0, 30);
  const exitVelocityAvg = clamp(input.power?.exitVelocityAvg ?? 89, 70, 100);
  const iso = clamp(input.power?.iso ?? 0.16, 0, 0.5);
  const hardHitRate = clamp(input.power?.hardHitRate ?? 37, 0, 80);
  const flyBallRate = clamp(input.power?.flyBallRate ?? 35, 0, 80);
  const xSlugging = clamp(input.power?.xSlugging ?? 0.42, 0.2, 0.8);

  const pitcherHr9 = clamp(input.pitcher?.hr9 ?? 1.1, 0, 3);
  const pitcherFbPct = clamp(input.pitcher?.fbPct ?? 36, 10, 70);

  const parkHrFactor = clamp(input.ballpark?.hrFactor ?? 1, 0.7, 1.5);

  // Tightened weather range so it cannot blow up final probabilities.
  const weatherHrImpactScore = clamp(input.weather?.hrImpactScore ?? 0, -2, 2);

  const projectedAtBats = getProjectedAtBats(input.lineupPosition);
  const platoonEdge = getPlatoonEdge(input.platoon?.bats, input.platoon?.pitcherThrows);

  const last7HR = clamp(input.recentForm?.last7HR ?? 0, 0, 10);
  const last14HR = clamp(input.recentForm?.last14HR ?? 0, 0, 15);
  const last30HR = clamp(input.recentForm?.last30HR ?? 0, 0, 25);

  const recentHardHits = clamp(
    (barrelRate * 0.45) + (hardHitRate * 0.12) + (last7HR * 1.8),
    0,
    25
  );

  const recentExtraBaseHits = clamp(
    (last7HR * 1.75) + (last14HR * 0.9) + (xSlugging * 6),
    0,
    25
  );

  const fbMatchupFactor = clamp(
    (flyBallRate / 100) * (pitcherFbPct / 100) * 100,
    0,
    100
  );

  const recentHrTrend = clamp(
    (last7HR * 0.6) + (last14HR * 0.28) + (last30HR * 0.12),
    0,
    12
  );

  const recentPowerScore = clamp(
    (barrelRate * 0.55) +
      (hardHitRate * 0.15) +
      ((exitVelocityAvg - 85) * 0.7) +
      (iso * 26) +
      (xSlugging * 12),
    0,
    45
  );

  const pitcherRecentRisk = clamp(
    (pitcherHr9 * 0.8) + (pitcherFbPct / 100) * 1.5,
    0,
    6
  );

  const platoonPowerInteraction = clamp(
    platoonEdge *
      (
        (iso * 45) +
        (barrelRate * 0.7) +
        (hardHitRate * 0.18) +
        (xSlugging * 10) +
        (last14HR * 0.9)
      ),
    0,
    35
  );

  const environmentScore = clamp(
    (parkHrFactor * 10) +
      (weatherHrImpactScore * 0.8) +
      (projectedAtBats * 1.2) +
      (teamHrPerGame * 2.2),
    0,
    25
  );

  return {
    batterId: input.batterId,
    batterName: input.batterName,
    gameDate,

    seasonHRPerGame,
    barrelRate,
    exitVelocityAvg,
    iso,
    hardHitRate,
    flyBallRate,
    xSlugging,

    pitcherHr9,
    pitcherFbPct,

    parkHrFactor,
    weatherHrImpactScore,
    projectedAtBats,
    platoonEdge,
    teamHrPerGame,

    last7HR,
    last14HR,
    last30HR,

    recentHardHits,
    recentExtraBaseHits,
    fbMatchupFactor,
    recentHrTrend,
    recentPowerScore,
    pitcherRecentRisk,
    platoonPowerInteraction,
    environmentScore,

    recentGamesWithHR: 0,
    multiHRGamesLast30: 0,
    recentPitcherHr9: pitcherHr9,

    label,
  };
}
export function featureVectorFromExample(
  example: HRTrainingExample,
  featureNames: readonly HRModelFeatureName[] = HR_MODEL_FEATURES
): number[] {
  return featureNames.map((featureName) => {
    const value = example[featureName];

    if (value === null || value === undefined || Number.isNaN(value)) {
      return 0;
    }

    return value;
  });
}
