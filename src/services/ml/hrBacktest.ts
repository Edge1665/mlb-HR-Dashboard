import { predictHRProbability, trainHRLogisticModel } from './hrLogisticModel';
import type {
  HRBacktestMetrics,
  HRPredictionWithLabel,
  HRTrainingExample,
  LogisticModelArtifact,
} from './types';

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function logLoss(predictions: HRPredictionWithLabel[]): number {
  const epsilon = 1e-8;

  return average(
    predictions.map((entry) => {
      const p = Math.min(Math.max(entry.predictedProbability, epsilon), 1 - epsilon);
      return -(entry.actualLabel * Math.log(p) + (1 - entry.actualLabel) * Math.log(1 - p));
    })
  );
}

function brierScore(predictions: HRPredictionWithLabel[]): number {
  return average(
    predictions.map((entry) => (entry.predictedProbability - entry.actualLabel) ** 2)
  );
}

function accuracyAt50(predictions: HRPredictionWithLabel[]): number {
  const correct = predictions.filter((entry) => {
    const predictedLabel = entry.predictedProbability >= 0.5 ? 1 : 0;
    return predictedLabel === entry.actualLabel;
  }).length;

  return predictions.length === 0 ? 0 : correct / predictions.length;
}

function buildCalibrationBuckets(
  predictions: HRPredictionWithLabel[]
): HRBacktestMetrics['calibrationBuckets'] {
  const buckets = Array.from({ length: 10 }, (_, index) => ({
    bucketMin: index / 10,
    bucketMax: (index + 1) / 10,
    values: [] as HRPredictionWithLabel[],
  }));

  for (const prediction of predictions) {
    const bucketIndex = Math.min(9, Math.floor(prediction.predictedProbability * 10));
    buckets[bucketIndex].values.push(prediction);
  }

  return buckets.map((bucket) => ({
    bucketMin: bucket.bucketMin,
    bucketMax: bucket.bucketMax,
    count: bucket.values.length,
    avgPredicted: average(bucket.values.map((value) => value.predictedProbability)),
    actualRate: average(bucket.values.map((value) => value.actualLabel)),
  }));
}

function top10HitRate(predictions: HRPredictionWithLabel[]): number {
  const byDate = new Map<string, HRPredictionWithLabel[]>();

  for (const prediction of predictions) {
    const current = byDate.get(prediction.gameDate) ?? [];
    current.push(prediction);
    byDate.set(prediction.gameDate, current);
  }

  const dailyTop10Rates = Array.from(byDate.values()).map((dailyPredictions) => {
    const top10 = [...dailyPredictions]
      .sort((a, b) => b.predictedProbability - a.predictedProbability)
      .slice(0, 10);

    return average(top10.map((entry) => entry.actualLabel));
  });

  return average(dailyTop10Rates);
}

export function calculateBacktestMetrics(
  predictions: HRPredictionWithLabel[]
): HRBacktestMetrics {
  return {
    sampleSize: predictions.length,
    positiveRate: average(predictions.map((entry) => entry.actualLabel)),
    logLoss: logLoss(predictions),
    brierScore: brierScore(predictions),
    accuracyAt50: accuracyAt50(predictions),
    top10HitRate: top10HitRate(predictions),
    calibrationBuckets: buildCalibrationBuckets(predictions),
  };
}

export function runTimeSplitBacktest(
  examples: HRTrainingExample[],
  options?: {
    trainFraction?: number;
    iterations?: number;
    learningRate?: number;
    l2Penalty?: number;
  }
): {
  model: LogisticModelArtifact;
  trainMetrics: HRBacktestMetrics;
  testMetrics: HRBacktestMetrics;
  trainPredictions: HRPredictionWithLabel[];
  testPredictions: HRPredictionWithLabel[];
} {
  if (examples.length < 100) {
    throw new Error('Need at least 100 examples to run a meaningful HR backtest.');
  }

  const sorted = [...examples].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const trainFraction = options?.trainFraction ?? 0.8;
  const splitIndex = Math.max(50, Math.floor(sorted.length * trainFraction));

  const trainExamples = sorted.slice(0, splitIndex);
  const testExamples = sorted.slice(splitIndex);

  const model = trainHRLogisticModel(trainExamples, {
    iterations: options?.iterations,
    learningRate: options?.learningRate,
    l2Penalty: options?.l2Penalty,
    validationExamples: testExamples,
  });

  const buildPredictions = (rows: HRTrainingExample[]): HRPredictionWithLabel[] =>
    rows.map((row) => ({
      batterId: row.batterId,
      batterName: row.batterName,
      gameDate: row.gameDate,
      predictedProbability: predictHRProbability(model, row),
      actualLabel: row.label,
    }));

  const trainPredictions = buildPredictions(trainExamples);
  const testPredictions = buildPredictions(testExamples);

  return {
    model,
    trainMetrics: calculateBacktestMetrics(trainPredictions),
    testMetrics: calculateBacktestMetrics(testPredictions),
    trainPredictions,
    testPredictions,
  };
}
