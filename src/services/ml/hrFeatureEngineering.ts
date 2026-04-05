import type { HRPredictionInput } from '@/services/hrPredictionService';
import type { HRTrainingExample } from './types';

export const HR_MODEL_FEATURES = [
  'seasonHRPerGame',
  'barrelRate',
  'exitVelocityAvg',
  'iso',
  'hardHitRate',
  'flyBallRate',
  'xSlugging',
  'pitcherHr9',
  'pitcherFbPct',
  'parkHrFactor',
  'weatherHrImpactScore',
  'projectedAtBats',
  'platoonEdge',
  'teamHrPerGame',
  'last7HR',
  'last14HR',
  'last30HR',
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

  return {
    batterId: input.batterId,
    batterName: input.batterName,
    gameDate,
    seasonHRPerGame,
    barrelRate: clamp(input.power?.barrelRate ?? 8, 0, 30),
    exitVelocityAvg: clamp(input.power?.exitVelocityAvg ?? 89, 70, 100),
    iso: clamp(input.power?.iso ?? 0.16, 0, 0.5),
    hardHitRate: clamp(input.power?.hardHitRate ?? 37, 0, 80),
    flyBallRate: clamp(input.power?.flyBallRate ?? 35, 0, 80),
    xSlugging: clamp(input.power?.xSlugging ?? 0.42, 0.2, 0.8),
    pitcherHr9: clamp(input.pitcher?.hr9 ?? 1.1, 0, 3),
    pitcherFbPct: clamp(input.pitcher?.fbPct ?? 36, 10, 70),
    parkHrFactor: clamp(input.ballpark?.hrFactor ?? 1, 0.7, 1.5),
    weatherHrImpactScore: clamp(input.weather?.hrImpactScore ?? 0, -5, 5),
    projectedAtBats: getProjectedAtBats(input.lineupPosition),
    platoonEdge: getPlatoonEdge(input.platoon?.bats, input.platoon?.pitcherThrows),
    teamHrPerGame,
    last7HR: clamp(input.recentForm?.last7HR ?? 0, 0, 10),
    last14HR: clamp(input.recentForm?.last14HR ?? 0, 0, 15),
    last30HR: clamp(input.recentForm?.last30HR ?? 0, 0, 25),
    label,
  };
}

export function featureVectorFromExample(example: HRTrainingExample): number[] {
  return HR_MODEL_FEATURES.map((featureName) => example[featureName]);
}
