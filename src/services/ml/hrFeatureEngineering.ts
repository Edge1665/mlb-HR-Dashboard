import type { HRPredictionInput } from '@/services/hrPredictionService';
import type { HRTrainingExample } from './types';

const HR_MODEL_CORE_FEATURES = [
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

export const HR_MODEL_EXPERIMENTAL_WEATHER_FEATURES = [
  'temperature',
  'humidity',
  'windSpeed',
  'windOutToCenter',
  'windInFromCenter',
  'crosswind',
  'pullSideWindBoost',
  'airDensityProxy',
  'densityAltitude',
] as const;

export const HR_MODEL_EXPERIMENTAL_PARK_FEATURES = [
  'parkIdNumeric',
  'parkHrFactorVsHand',
  'averageFenceDistance',
  'fenceDistanceIndex',
  'estimatedHrParksForTypical400FtFly',
] as const;

export const HR_MODEL_EXPERIMENTAL_MATCHUP_FEATURES = [
  'handednessInteraction',
  'pitchMixMatchupScore',
  'pitcherVulnerabilityVsHand',
  'batterVsPitchMixPower',
] as const;

export const HR_MODEL_EXPERIMENTAL_FEATURES = [
  ...HR_MODEL_EXPERIMENTAL_WEATHER_FEATURES,
  ...HR_MODEL_EXPERIMENTAL_PARK_FEATURES,
  ...HR_MODEL_EXPERIMENTAL_MATCHUP_FEATURES,
] as const;

export const HR_MODEL_FEATURES = [
  ...HR_MODEL_CORE_FEATURES,
  ...HR_MODEL_EXPERIMENTAL_FEATURES,
] as const;

export type HRModelFeatureName = (typeof HR_MODEL_FEATURES)[number];

export const HR_MODEL_FEATURES_V1_BASELINE: readonly HRModelFeatureName[] = [
  ...HR_MODEL_CORE_FEATURES,
];

export const HR_MODEL_FEATURES_REDUCED_COMPOSITES: readonly HRModelFeatureName[] =
  HR_MODEL_CORE_FEATURES.filter(
    (featureName) =>
      ![
        'recentHardHits',
        'recentExtraBaseHits',
        'platoonPowerInteraction',
        'environmentScore',
      ].includes(featureName)
  );

export const HR_MODEL_FEATURES_V2_CLEAN: readonly HRModelFeatureName[] =
  HR_MODEL_FEATURES_REDUCED_COMPOSITES;

export const HR_MODEL_FEATURES_PRODUCTION_DEFAULT: readonly HRModelFeatureName[] =
  [...HR_MODEL_FEATURES_V2_CLEAN];

export const HR_MODEL_FEATURES_PARK_ONLY_SAFE_V1: readonly HRModelFeatureName[] = [
  ...HR_MODEL_FEATURES_V2_CLEAN,
  'parkHrFactorVsHand',
  'averageFenceDistance',
  'fenceDistanceIndex',
  'estimatedHrParksForTypical400FtFly',
];

export const HR_MODEL_FEATURES_ENV_MATCHUP_V1: readonly HRModelFeatureName[] = [
  ...HR_MODEL_FEATURES_V2_CLEAN,
  ...HR_MODEL_EXPERIMENTAL_FEATURES,
];

export const HR_MODEL_FEATURE_SET_REGISTRY = {
  production_default: HR_MODEL_FEATURES_PRODUCTION_DEFAULT,
  park_only_safe_v1: HR_MODEL_FEATURES_PARK_ONLY_SAFE_V1,
  env_matchup_v1: HR_MODEL_FEATURES_ENV_MATCHUP_V1,
} as const satisfies Record<string, readonly HRModelFeatureName[]>;

export type HRModelFeatureSetName = keyof typeof HR_MODEL_FEATURE_SET_REGISTRY;

export function getHRModelFeatureSet(
  featureSetName: HRModelFeatureSetName = 'production_default'
): readonly HRModelFeatureName[] {
  return HR_MODEL_FEATURE_SET_REGISTRY[featureSetName];
}

export const HR_MODEL_FEATURES_LESS_RECENT_HR_NOISE: readonly HRModelFeatureName[] =
  HR_MODEL_CORE_FEATURES.filter(
    (featureName) => !['last7HR', 'last30HR'].includes(featureName)
  );

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

function parseParkIdNumeric(value: string | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeOptionalRate(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function getPullDirectionSign(bats?: 'L' | 'R' | 'S'): number {
  if (bats === 'L') return -1;
  return 1;
}

function getPitchMixWeightedSkill(
  pitcherPitchMix?: Partial<Record<'FF' | 'SI' | 'FC' | 'SL' | 'CU' | 'CH' | 'FS' | 'KC', number>>,
  batterPitchTypeSkill?: Partial<Record<'FF' | 'SI' | 'FC' | 'SL' | 'CU' | 'CH' | 'FS' | 'KC', number>>
): { weightedSkill: number; knownUsage: number } {
  const pitchTypes: Array<'FF' | 'SI' | 'FC' | 'SL' | 'CU' | 'CH' | 'FS' | 'KC'> = [
    'FF',
    'SI',
    'FC',
    'SL',
    'CU',
    'CH',
    'FS',
    'KC',
  ];

  let weightedTotal = 0;
  let totalUsage = 0;

  for (const pitchType of pitchTypes) {
    const usage = pitcherPitchMix?.[pitchType];
    if (usage == null || !Number.isFinite(usage) || usage <= 0) continue;
    const skill = batterPitchTypeSkill?.[pitchType] ?? 0;
    weightedTotal += usage * skill;
    totalUsage += usage;
  }

  return {
    weightedSkill: totalUsage > 0 ? weightedTotal / totalUsage : 0,
    knownUsage: totalUsage,
  };
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
  const temperature = clamp(input.weather?.temp ?? 70, 20, 110);
  const humidity = clamp(input.weather?.humidity ?? 50, 0, 100);
  const windSpeed = clamp(input.weather?.windSpeed ?? 0, 0, 40);
  const windOutToCenter = clamp(input.weather?.windOutToCenter ?? 0, 0, 40);
  const windInFromCenter = clamp(input.weather?.windInFromCenter ?? 0, 0, 40);
  const crosswind = clamp(input.weather?.crosswind ?? 0, -40, 40);
  const densityAltitude = clamp(input.weather?.densityAltitude ?? 0, -2000, 12000);
  const airDensityProxy = clamp(input.weather?.airDensityProxy ?? 1, 0.82, 1.12);

  const projectedAtBats = getProjectedAtBats(input.lineupPosition);
  const platoonEdge = getPlatoonEdge(input.platoon?.bats, input.platoon?.pitcherThrows);
  const handednessInteraction = clamp(input.platoon?.handednessInteraction ?? 0, -1, 1);
  // Treat missing/placeholder pull-rate values as unknown so we fall back to neutral.
  const pullRate = clamp(normalizeOptionalRate(input.power?.pullRate) ?? 40, 20, 65);
  const pullSideWindBoost = clamp(
    windOutToCenter * 0.05 +
      getPullDirectionSign(input.platoon?.bats) * crosswind * 0.02 +
      (pullRate - 40) * 0.015,
    -2,
    2
  );
  const parkIdNumeric = parseParkIdNumeric(input.ballpark?.id);
  const parkHrFactorVsHand = clamp(
    input.platoon?.bats === 'L'
      ? input.ballpark?.hrFactorVsLeft ?? parkHrFactor
      : input.ballpark?.hrFactorVsRight ?? parkHrFactor,
    0.7,
    1.5
  );
  const averageFenceDistance = clamp(input.ballpark?.averageFenceDistance ?? 352, 300, 430);
  const fenceDistanceIndex = clamp(input.ballpark?.fenceDistanceIndex ?? 0, -2, 2);
  const estimatedHrParksForTypical400FtFly = clamp(
    input.ballpark?.estimatedHrParksForTypical400FtFly ?? 15,
    1,
    30
  );

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
      (pullSideWindBoost * 0.6) +
      ((1 - airDensityProxy) * 12) +
      (projectedAtBats * 1.2) +
      (teamHrPerGame * 2.2),
    0,
    25
  );

  const pitchMixMatchup = getPitchMixWeightedSkill(
    input.pitchTypeMatchup?.pitcherPitchMix,
    input.pitchTypeMatchup?.batterPitchTypeSkill
  );
  const pitchMixMatchupScore = clamp(pitchMixMatchup.weightedSkill, -2, 2);
  const batterVsPitchMixPower = clamp(
    pitchMixMatchup.knownUsage > 0 ? pitchMixMatchup.weightedSkill : 0,
    -2,
    2
  );
  const pitcherVulnerabilityVsHand = clamp(
    input.platoon?.bats === 'L'
      ? input.pitcher?.hr9AllowedVsLeft ?? input.pitcher?.hr9 ?? 1.1
      : input.pitcher?.hr9AllowedVsRight ?? input.pitcher?.hr9 ?? 1.1,
    0,
    3
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
    temperature,
    humidity,
    windSpeed,
    windOutToCenter,
    windInFromCenter,
    crosswind,
    pullSideWindBoost,
    airDensityProxy,
    densityAltitude,
    parkIdNumeric,
    parkHrFactorVsHand,
    averageFenceDistance,
    fenceDistanceIndex,
    estimatedHrParksForTypical400FtFly,
    projectedAtBats,
    platoonEdge,
    handednessInteraction,
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
    pitchMixMatchupScore,
    pitcherVulnerabilityVsHand,
    batterVsPitchMixPower,

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
