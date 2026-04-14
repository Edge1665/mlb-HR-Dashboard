import type {
  HRSlateEnvironmentLabel,
  HRSlateExposureRecommendation,
} from './types';

export interface SlateEnvironmentInputRow {
  gameId: string;
  predictedProbability: number;
  seasonHRPerGame: number;
  parkHrFactor: number;
  weatherHrImpactScore: number;
  pitcherHr9: number;
}

export interface LiveSlateEnvironmentSummary {
  estimatedGameCount: number;
  averagePredictedHrProbability: number;
  averageParkHrFactor: number;
  averageWeatherHrImpactScore: number;
  averagePitcherHr9: number;
  averageSeasonHrPerGame: number;
  predictedHrEnvironmentScore: number;
  slateClass: HRSlateEnvironmentLabel;
  recommendedExposure: HRSlateExposureRecommendation;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0.5;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function getSlateClass(
  predictedHrEnvironmentScore: number
): HRSlateEnvironmentLabel {
  if (predictedHrEnvironmentScore <= 0.42) {
    return 'low_hr';
  }

  if (predictedHrEnvironmentScore >= 0.58) {
    return 'high_hr';
  }

  return 'medium_hr';
}

export function getSlateExposureRecommendation(
  slateClass: HRSlateEnvironmentLabel
): HRSlateExposureRecommendation {
  switch (slateClass) {
    case 'high_hr':
      return {
        minHitters: 5,
        maxHitters: 10,
        shouldConsiderSkip: false,
        summary: 'Aggressive slate. Top 5 to top 10 hitters are in play.',
      };
    case 'medium_hr':
      return {
        minHitters: 3,
        maxHitters: 5,
        shouldConsiderSkip: false,
        summary: 'Normal slate. Focus on the top 3 to top 5 hitters.',
      };
    case 'low_hr':
      return {
        minHitters: 0,
        maxHitters: 2,
        shouldConsiderSkip: true,
        summary: 'Thin slate. Consider 0 to 2 hitters, or treat it as a skip slate.',
      };
  }
}

export function summarizeLiveSlateEnvironment(
  rows: readonly SlateEnvironmentInputRow[]
): LiveSlateEnvironmentSummary {
  const estimatedGameCount = new Set(rows.map((row) => row.gameId)).size;
  const averagePredictedHrProbability = average(
    rows.map((row) => row.predictedProbability)
  );
  const averageParkHrFactor = average(rows.map((row) => row.parkHrFactor));
  const averageWeatherHrImpactScore = average(
    rows.map((row) => row.weatherHrImpactScore)
  );
  const averagePitcherHr9 = average(rows.map((row) => row.pitcherHr9));
  const averageSeasonHrPerGame = average(rows.map((row) => row.seasonHRPerGame));

  // Use the same slate-level inputs the backtest environment model uses,
  // but keep live classification lightweight and inspectable.
  const predictedHrEnvironmentScore = clamp(
    normalize(averagePredictedHrProbability, 0.04, 0.16) * 0.28 +
      normalize(averageParkHrFactor, 0.9, 1.15) * 0.2 +
      normalize(averageWeatherHrImpactScore, -0.5, 0.8) * 0.14 +
      normalize(averagePitcherHr9, 0.9, 1.5) * 0.18 +
      normalize(averageSeasonHrPerGame, 0.08, 0.18) * 0.12 +
      normalize(estimatedGameCount, 5, 16) * 0.08,
    0,
    1
  );

  const slateClass = getSlateClass(predictedHrEnvironmentScore);

  return {
    estimatedGameCount,
    averagePredictedHrProbability,
    averageParkHrFactor,
    averageWeatherHrImpactScore,
    averagePitcherHr9,
    averageSeasonHrPerGame,
    predictedHrEnvironmentScore,
    slateClass,
    recommendedExposure: getSlateExposureRecommendation(slateClass),
  };
}
