import {
  HR_MODEL_FEATURES,
  type HRModelFeatureName,
} from './hrFeatureEngineering';
import {
  runTimeSplitBacktestXGBoost,
  type HRProbabilityMode,
} from './hrXGBoostModel';
import type {
  HRBacktestMetrics,
  HRPredictionWithLabel,
  HRTrainingExample,
} from './types';

const DEFAULT_POSITIVE_BOOST_FACTOR = 6;
const DEFAULT_PROBABILITY_POWER = 0.85;
const DEFAULT_CONSERVATIVE_SHRINKAGE = 0.25;

const COMPOSITE_FEATURES_TO_REMOVE: readonly HRModelFeatureName[] = [
  'recentHardHits',
  'recentExtraBaseHits',
  'platoonPowerInteraction',
  'environmentScore',
];

const RECENT_HR_NOISE_FEATURES_TO_REMOVE: readonly HRModelFeatureName[] = [
  'last7HR',
  'last30HR',
];

export interface HRXGBoostExperimentConfig {
  name: string;
  featureNames: readonly HRModelFeatureName[];
  positiveBoostFactor?: number;
  probabilityPower?: number;
  conservativeShrinkage?: number;
  comparisonRole?: 'recommended_candidate' | 'baseline' | 'variant';
}

export interface HRXGBoostExperimentCalibrationSummary {
  populatedBucketCount: number;
  meanAbsoluteBucketGap: number;
  weightedCalibrationGap: number;
  maxBucketGap: number;
}

export interface HRXGBoostExperimentPhaseSummary {
  sampleSize: number;
  slateCount: number;
  positiveRate: number;
  logLoss: number;
  brierScore: number;
  accuracyAt50: number;
  top5HitRate: number;
  top10HitRate: number;
  calibration: HRXGBoostExperimentCalibrationSummary;
  separation: {
    averageTop5ProbabilityRange: number;
    averageTop10ProbabilityRange: number;
    averageTop10ProbabilityStdDev: number;
  };
  stability: {
    averageNextSlateTop5Overlap: number;
    averageNextSlateTop10Overlap: number;
    averageTopPickRepeatRate: number;
  };
}

export interface HRXGBoostExperimentResult {
  name: string;
  featureCount: number;
  featureNames: readonly HRModelFeatureName[];
  positiveBoostFactor: number;
  probabilityPower: number;
  conservativeShrinkage: number;
  split: {
    trainSize: number;
    calibrationSize: number;
    testSize: number;
  };
  train: HRXGBoostExperimentPhaseSummary;
  calibration: HRXGBoostExperimentPhaseSummary;
  test: HRXGBoostExperimentPhaseSummary;
  trainMetrics: HRBacktestMetrics;
  calibrationMetrics: HRBacktestMetrics;
  testMetrics: HRBacktestMetrics;
}

export interface HRXGBoostExperimentRunResult {
  experiments: HRXGBoostExperimentResult[];
  baselineName: string | null;
  recommendedCandidateName: string | null;
  featureComparison: {
    baselineFeatureNames: readonly HRModelFeatureName[];
    recommendedCandidateFeatureNames: readonly HRModelFeatureName[];
    removedFromRecommendedCandidate: readonly HRModelFeatureName[];
    addedInRecommendedCandidate: readonly HRModelFeatureName[];
  } | null;
}

function excludeFeatures(
  excludedFeatures: readonly HRModelFeatureName[]
): HRModelFeatureName[] {
  const excluded = new Set(excludedFeatures);
  return HR_MODEL_FEATURES.filter((featureName) => !excluded.has(featureName));
}

function summarizeCalibration(
  metrics: HRBacktestMetrics
): HRXGBoostExperimentCalibrationSummary {
  const populatedBuckets = metrics.calibrationBuckets.filter((bucket) => bucket.count > 0);

  if (populatedBuckets.length === 0) {
    return {
      populatedBucketCount: 0,
      meanAbsoluteBucketGap: 0,
      weightedCalibrationGap: 0,
      maxBucketGap: 0,
    };
  }

  const absoluteGaps = populatedBuckets.map((bucket) =>
    Math.abs(bucket.avgPredicted - bucket.actualRate)
  );
  const totalCount = populatedBuckets.reduce((sum, bucket) => sum + bucket.count, 0) || 1;
  const weightedCalibrationGap = populatedBuckets.reduce((sum, bucket) => {
    const gap = Math.abs(bucket.avgPredicted - bucket.actualRate);
    return sum + gap * (bucket.count / totalCount);
  }, 0);

  return {
    populatedBucketCount: populatedBuckets.length,
    meanAbsoluteBucketGap:
      absoluteGaps.reduce((sum, value) => sum + value, 0) / absoluteGaps.length,
    weightedCalibrationGap,
    maxBucketGap: Math.max(...absoluteGaps),
  };
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getStandardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function summarizeSeparation(predictions: HRPredictionWithLabel[]) {
  const byDate = new Map<string, HRPredictionWithLabel[]>();

  for (const prediction of predictions) {
    const rows = byDate.get(prediction.gameDate) ?? [];
    rows.push(prediction);
    byDate.set(prediction.gameDate, rows);
  }

  const top5Ranges: number[] = [];
  const top10Ranges: number[] = [];
  const top10StdDevs: number[] = [];

  for (const rows of byDate.values()) {
    const rankedRows = [...rows].sort(
      (left, right) => right.predictedProbability - left.predictedProbability
    );
    const top5 = rankedRows.slice(0, 5).map((row) => row.predictedProbability);
    const top10 = rankedRows.slice(0, 10).map((row) => row.predictedProbability);

    if (top5.length > 1) {
      top5Ranges.push(top5[0] - top5[top5.length - 1]);
    }

    if (top10.length > 1) {
      top10Ranges.push(top10[0] - top10[top10.length - 1]);
      top10StdDevs.push(getStandardDeviation(top10));
    }
  }

  return {
    averageTop5ProbabilityRange: average(top5Ranges),
    averageTop10ProbabilityRange: average(top10Ranges),
    averageTop10ProbabilityStdDev: average(top10StdDevs),
  };
}

function summarizeStability(predictions: HRPredictionWithLabel[]) {
  const byDate = new Map<string, HRPredictionWithLabel[]>();

  for (const prediction of predictions) {
    const rows = byDate.get(prediction.gameDate) ?? [];
    rows.push(prediction);
    byDate.set(prediction.gameDate, rows);
  }

  const dates = [...byDate.keys()].sort((left, right) => left.localeCompare(right));

  if (dates.length < 2) {
    return {
      averageNextSlateTop5Overlap: 0,
      averageNextSlateTop10Overlap: 0,
      averageTopPickRepeatRate: 0,
    };
  }

  let top5OverlapSum = 0;
  let top10OverlapSum = 0;
  let topPickRepeatCount = 0;
  let comparisonCount = 0;

  for (let index = 1; index < dates.length; index += 1) {
    const previousRows = [...(byDate.get(dates[index - 1]) ?? [])].sort(
      (left, right) => right.predictedProbability - left.predictedProbability
    );
    const currentRows = [...(byDate.get(dates[index]) ?? [])].sort(
      (left, right) => right.predictedProbability - left.predictedProbability
    );

    const previousTop5 = new Set(previousRows.slice(0, 5).map((row) => row.batterId));
    const currentTop5 = new Set(currentRows.slice(0, 5).map((row) => row.batterId));
    const previousTop10 = new Set(previousRows.slice(0, 10).map((row) => row.batterId));
    const currentTop10 = new Set(currentRows.slice(0, 10).map((row) => row.batterId));

    const top5Overlap = [...currentTop5].filter((batterId) =>
      previousTop5.has(batterId)
    ).length;
    const top10Overlap = [...currentTop10].filter((batterId) =>
      previousTop10.has(batterId)
    ).length;

    top5OverlapSum += top5Overlap / 5;
    top10OverlapSum += top10Overlap / 10;
    topPickRepeatCount +=
      previousRows[0]?.batterId != null &&
      previousRows[0].batterId === currentRows[0]?.batterId
        ? 1
        : 0;
    comparisonCount += 1;
  }

  return {
    averageNextSlateTop5Overlap: top5OverlapSum / comparisonCount,
    averageNextSlateTop10Overlap: top10OverlapSum / comparisonCount,
    averageTopPickRepeatRate: topPickRepeatCount / comparisonCount,
  };
}

function summarizePhase(
  metrics: HRBacktestMetrics,
  predictions: HRPredictionWithLabel[]
): HRXGBoostExperimentPhaseSummary {
  return {
    sampleSize: metrics.sampleSize,
    slateCount: metrics.slateCount,
    positiveRate: metrics.positiveRate,
    logLoss: metrics.logLoss,
    brierScore: metrics.brierScore,
    accuracyAt50: metrics.accuracyAt50,
    top5HitRate: metrics.averageTop5HitRatePerSlate,
    top10HitRate: metrics.averageTop10HitRatePerSlate,
    calibration: summarizeCalibration(metrics),
    separation: summarizeSeparation(predictions),
    stability: summarizeStability(predictions),
  };
}

export const HR_XGBOOST_EXPERIMENT_CONFIGS: readonly HRXGBoostExperimentConfig[] = [
  {
    name: 'no_composite_features',
    featureNames: excludeFeatures(COMPOSITE_FEATURES_TO_REMOVE),
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
    comparisonRole: 'recommended_candidate',
  },
  {
    name: 'baseline_current',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
    comparisonRole: 'baseline',
  },
  {
    name: 'less_recent_hr_noise',
    featureNames: excludeFeatures(RECENT_HR_NOISE_FEATURES_TO_REMOVE),
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
    comparisonRole: 'variant',
  },
  {
    name: 'no_composites_plus_less_recent_noise',
    featureNames: excludeFeatures([
      ...COMPOSITE_FEATURES_TO_REMOVE,
      ...RECENT_HR_NOISE_FEATURES_TO_REMOVE,
    ]),
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
    comparisonRole: 'variant',
  },
  {
    name: 'no_composites_plus_less_recent_noise_plus_lower_positive_boost',
    featureNames: excludeFeatures([
      ...COMPOSITE_FEATURES_TO_REMOVE,
      ...RECENT_HR_NOISE_FEATURES_TO_REMOVE,
    ]),
    positiveBoostFactor: 5,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
    comparisonRole: 'variant',
  },
] as const;

export const HR_XGBOOST_POSITIVE_BOOST_SWEEP_CONFIGS: readonly HRXGBoostExperimentConfig[] = [
  {
    name: 'baseline_current_boost_6',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: 6,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
  },
  {
    name: 'baseline_current_boost_5',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: 5,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
  },
  {
    name: 'baseline_current_boost_4_5',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: 4.5,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: DEFAULT_CONSERVATIVE_SHRINKAGE,
  },
] as const;

export const HR_XGBOOST_CONSERVATIVE_SHRINKAGE_SWEEP_CONFIGS: readonly HRXGBoostExperimentConfig[] = [
  {
    name: 'baseline_current_shrink_0_25',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: 0.25,
  },
  {
    name: 'baseline_current_shrink_0_20',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: 0.20,
  },
  {
    name: 'baseline_current_shrink_0_15',
    featureNames: [...HR_MODEL_FEATURES],
    positiveBoostFactor: DEFAULT_POSITIVE_BOOST_FACTOR,
    probabilityPower: DEFAULT_PROBABILITY_POWER,
    conservativeShrinkage: 0.15,
  },
] as const;

export async function runHRXGBoostExperiments(
  examples: HRTrainingExample[],
  experiments: readonly HRXGBoostExperimentConfig[] = HR_XGBOOST_EXPERIMENT_CONFIGS,
  options?: {
    trainFraction?: number;
    calibrationFraction?: number;
    probabilityMode?: HRProbabilityMode;
  }
): Promise<HRXGBoostExperimentRunResult> {
  const results: HRXGBoostExperimentResult[] = [];

  for (const experiment of experiments) {
    const backtest = await runTimeSplitBacktestXGBoost(examples, {
      trainFraction: options?.trainFraction,
      calibrationFraction: options?.calibrationFraction,
      probabilityMode: options?.probabilityMode,
      featureNames: experiment.featureNames,
      positiveBoostFactor:
        experiment.positiveBoostFactor ?? DEFAULT_POSITIVE_BOOST_FACTOR,
      probabilityPower: experiment.probabilityPower ?? DEFAULT_PROBABILITY_POWER,
      conservativeShrinkage:
        experiment.conservativeShrinkage ?? DEFAULT_CONSERVATIVE_SHRINKAGE,
    });

    results.push({
      name: experiment.name,
      featureCount: experiment.featureNames.length,
      featureNames: [...experiment.featureNames],
      positiveBoostFactor:
        experiment.positiveBoostFactor ?? DEFAULT_POSITIVE_BOOST_FACTOR,
      probabilityPower: experiment.probabilityPower ?? DEFAULT_PROBABILITY_POWER,
      conservativeShrinkage:
        experiment.conservativeShrinkage ?? DEFAULT_CONSERVATIVE_SHRINKAGE,
      split: backtest.split,
      train: summarizePhase(backtest.trainMetrics, backtest.trainPredictions),
      calibration: summarizePhase(
        backtest.calibrationMetrics,
        backtest.calibrationPredictions
      ),
      test: summarizePhase(backtest.testMetrics, backtest.testPredictions),
      trainMetrics: backtest.trainMetrics,
      calibrationMetrics: backtest.calibrationMetrics,
      testMetrics: backtest.testMetrics,
    });
  }

  const baselineExperiment =
    experiments.find((experiment) => experiment.comparisonRole === 'baseline') ??
    experiments.find((experiment) => experiment.name === 'baseline_current') ??
    experiments[0];
  const recommendedCandidate =
    experiments.find(
      (experiment) => experiment.comparisonRole === 'recommended_candidate'
    ) ?? experiments[0];

  const baselineFeatureNames = baselineExperiment
    ? [...baselineExperiment.featureNames]
    : [];
  const recommendedCandidateFeatureNames = recommendedCandidate
    ? [...recommendedCandidate.featureNames]
    : [];
  const recommendedFeatureSet = new Set(recommendedCandidateFeatureNames);
  const baselineFeatureSet = new Set(baselineFeatureNames);

  return {
    experiments: results,
    baselineName: baselineExperiment?.name ?? null,
    recommendedCandidateName: recommendedCandidate?.name ?? null,
    featureComparison:
      baselineExperiment && recommendedCandidate
        ? {
            baselineFeatureNames,
            recommendedCandidateFeatureNames,
            removedFromRecommendedCandidate: baselineFeatureNames.filter(
              (featureName) => !recommendedFeatureSet.has(featureName)
            ),
            addedInRecommendedCandidate: recommendedCandidateFeatureNames.filter(
              (featureName) => !baselineFeatureSet.has(featureName)
            ),
          }
        : null,
  };
}
