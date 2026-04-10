import { predictHRProbability, trainHRLogisticModel } from './hrLogisticModel';
import type {
  HRBacktestMetrics,
  HRBacktestSlateSummary,
  HRBacktestStrategyResult,
  HRPredictionWithLabel,
  HRSlateEnvironmentMetrics,
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

function summarizeTopN(
  predictions: HRPredictionWithLabel[],
  count: number
): {
  hitCount: number;
  hitRate: number;
  averagePredictedProbability: number;
} {
  const topPredictions = predictions.slice(0, count);
  const hitCount = topPredictions.reduce((sum, entry) => sum + entry.actualLabel, 0);

  return {
    hitCount,
    hitRate: topPredictions.length === 0 ? 0 : hitCount / topPredictions.length,
    averagePredictedProbability: average(
      topPredictions.map((entry) => entry.predictedProbability)
    ),
  };
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * fraction))
  );

  return sortedValues[index];
}

function environmentLabelFromThresholds(
  value: number,
  lowThreshold: number,
  highThreshold: number
): 'low_hr' | 'medium_hr' | 'high_hr' {
  if (value <= lowThreshold) {
    return 'low_hr';
  }

  if (value >= highThreshold) {
    return 'high_hr';
  }

  return 'medium_hr';
}

type SlateEnvironmentThresholds = {
  lowThreshold: number;
  highThreshold: number;
};

type SlateEnvironmentLabel = HRBacktestSlateSummary['actualEnvironmentLabel'];

type SlateEnvironmentTrainingRow = {
  features: number[];
  label: SlateEnvironmentLabel;
};

type SlateEnvironmentModel = {
  weights: number[][];
  biases: number[];
  means: number[];
  stds: number[];
};

function dotProduct(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function softmax(logits: number[]): number[] {
  if (logits.length === 0) {
    return [];
  }

  const maxLogit = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - maxLogit));
  const sumExp = exps.reduce((sum, value) => sum + value, 0) || 1;

  return exps.map((value) => value / sumExp);
}

function labelToIndex(label: SlateEnvironmentLabel): number {
  switch (label) {
    case 'low_hr':
      return 0;
    case 'medium_hr':
      return 1;
    case 'high_hr':
      return 2;
  }
}

function indexToLabel(index: number): SlateEnvironmentLabel {
  if (index <= 0) return 'low_hr';
  if (index >= 2) return 'high_hr';
  return 'medium_hr';
}

function standardizeSlateFeatureRows(rows: number[][]): {
  standardizedRows: number[][];
  means: number[];
  stds: number[];
} {
  if (rows.length === 0) {
    return {
      standardizedRows: [],
      means: [],
      stds: [],
    };
  }

  const featureCount = rows[0].length;
  const means = new Array(featureCount).fill(0);
  const stds = new Array(featureCount).fill(1);

  for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
    const values = rows.map((row) => row[featureIndex]);
    const mean = average(values);
    const variance = average(values.map((value) => (value - mean) ** 2));
    means[featureIndex] = mean;
    stds[featureIndex] = Math.sqrt(variance) || 1;
  }

  return {
    standardizedRows: rows.map((row) =>
      row.map((value, featureIndex) => (value - means[featureIndex]) / stds[featureIndex])
    ),
    means,
    stds,
  };
}

function applySlateFeatureStandardization(
  row: number[],
  means: number[],
  stds: number[]
): number[] {
  return row.map((value, featureIndex) => (value - means[featureIndex]) / (stds[featureIndex] || 1));
}

function buildSlateEnvironmentThresholds(
  slateSummaries: HRBacktestSlateSummary[]
): SlateEnvironmentThresholds {
  const sortedTotalActualHRs = slateSummaries
    .map((slate) => slate.totalActualHRs)
    .sort((a, b) => a - b);

  return {
    lowThreshold: percentile(sortedTotalActualHRs, 0.25),
    highThreshold: percentile(sortedTotalActualHRs, 0.75),
  };
}

function extractSlateEnvironmentFeatures(slate: HRBacktestSlateSummary): number[] {
  return [
    slate.averageParkHrFactor,
    slate.averageWeatherHrImpactScore,
    slate.averagePitcherHr9,
    slate.averageSeasonHrPerGame,
    slate.estimatedGameCount,
    slate.averagePredictedHrProbability,
  ];
}

function trainSlateEnvironmentModel(
  trainingRows: SlateEnvironmentTrainingRow[],
  options?: {
    iterations?: number;
    learningRate?: number;
    l2Penalty?: number;
  }
): SlateEnvironmentModel {
  if (trainingRows.length < 10) {
    throw new Error('Need at least 10 slates to train the slate environment model.');
  }

  const iterations = options?.iterations ?? 2500;
  const learningRate = options?.learningRate ?? 0.08;
  const l2Penalty = options?.l2Penalty ?? 0.0005;
  const rawRows = trainingRows.map((row) => row.features);
  const { standardizedRows, means, stds } = standardizeSlateFeatureRows(rawRows);
  const classCount = 3;
  const featureCount = standardizedRows[0]?.length ?? 0;
  const weights = Array.from({ length: classCount }, () =>
    new Array(featureCount).fill(0)
  );
  const biases = new Array(classCount).fill(0);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weightGradients = Array.from({ length: classCount }, () =>
      new Array(featureCount).fill(0)
    );
    const biasGradients = new Array(classCount).fill(0);

    for (let rowIndex = 0; rowIndex < standardizedRows.length; rowIndex += 1) {
      const row = standardizedRows[rowIndex];
      const targetClass = labelToIndex(trainingRows[rowIndex].label);
      const logits = weights.map((classWeights, classIndex) =>
        dotProduct(classWeights, row) + biases[classIndex]
      );
      const probabilities = softmax(logits);

      for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
        const target = classIndex === targetClass ? 1 : 0;
        const error = probabilities[classIndex] - target;

        biasGradients[classIndex] += error;

        for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
          weightGradients[classIndex][featureIndex] += error * row[featureIndex];
        }
      }
    }

    for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
      for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
        const l2Gradient = l2Penalty * weights[classIndex][featureIndex];
        weights[classIndex][featureIndex] -=
          learningRate *
          (weightGradients[classIndex][featureIndex] / standardizedRows.length + l2Gradient);
      }

      biases[classIndex] -= learningRate * (biasGradients[classIndex] / standardizedRows.length);
    }
  }

  return {
    weights,
    biases,
    means,
    stds,
  };
}

function predictSlateEnvironmentLabel(
  model: SlateEnvironmentModel,
  features: number[]
): {
  label: SlateEnvironmentLabel;
  score: number;
} {
  const standardizedFeatures = applySlateFeatureStandardization(
    features,
    model.means,
    model.stds
  );
  const logits = model.weights.map((classWeights, classIndex) =>
    dotProduct(classWeights, standardizedFeatures) + model.biases[classIndex]
  );
  const probabilities = softmax(logits);
  const bestIndex = probabilities.reduce(
    (best, probability, index, values) =>
      probability > values[best] ? index : best,
    0
  );

  return {
    label: indexToLabel(bestIndex),
    score: probabilities[1] * 0.5 + probabilities[2],
  };
}

function buildBaseSlateSummaries(
  predictions: HRPredictionWithLabel[]
): HRBacktestSlateSummary[] {
  const byDate = new Map<string, HRPredictionWithLabel[]>();

  for (const prediction of predictions) {
    const current = byDate.get(prediction.gameDate) ?? [];
    current.push(prediction);
    byDate.set(prediction.gameDate, current);
  }

  const slateSummaries = Array.from(byDate.entries())
    .map(([gameDate, dailyPredictions]) => {
      const rankedPredictions = [...dailyPredictions].sort(
        (a, b) => b.predictedProbability - a.predictedProbability
      );
      const top5 = summarizeTopN(rankedPredictions, 5);
      const top10 = summarizeTopN(rankedPredictions, 10);
      const totalActualHRs = rankedPredictions.reduce(
        (sum, entry) => sum + entry.actualLabel,
        0
      );

      const slateSummary: HRBacktestSlateSummary = {
        gameDate,
        predictionCount: rankedPredictions.length,
        estimatedGameCount: Math.max(1, Math.round(rankedPredictions.length / 18)),
        totalActualHRs,
        top5HitCount: top5.hitCount,
        top5HitRate: top5.hitRate,
        top5AveragePredictedProbability: top5.averagePredictedProbability,
        top10HitCount: top10.hitCount,
        top10HitRate: top10.hitRate,
        top10AveragePredictedProbability: top10.averagePredictedProbability,
        averageParkHrFactor: average(rankedPredictions.map((entry) => entry.parkHrFactor)),
        averageWeatherHrImpactScore: average(
          rankedPredictions.map((entry) => entry.weatherHrImpactScore)
        ),
        averagePitcherHr9: average(rankedPredictions.map((entry) => entry.pitcherHr9)),
        averageSeasonHrPerGame: average(
          rankedPredictions.map((entry) => entry.seasonHRPerGame)
        ),
        averagePredictedHrProbability: average(
          rankedPredictions.map((entry) => entry.predictedProbability)
        ),
        predictedHrEnvironmentScore: 0,
        actualEnvironmentLabel: 'medium_hr',
        predictedEnvironmentLabel: 'medium_hr',
      };

      return slateSummary;
    })
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

  return slateSummaries;
}

function applySlateEnvironmentModel(
  slateSummaries: HRBacktestSlateSummary[],
  actualThresholds: SlateEnvironmentThresholds,
  environmentModel: SlateEnvironmentModel
): HRBacktestSlateSummary[] {
  return slateSummaries.map((slate) => {
    const prediction = predictSlateEnvironmentLabel(
      environmentModel,
      extractSlateEnvironmentFeatures(slate)
    );

    const updatedSlate: HRBacktestSlateSummary = {
      ...slate,
      predictedHrEnvironmentScore: prediction.score,
      actualEnvironmentLabel: environmentLabelFromThresholds(
        slate.totalActualHRs,
        actualThresholds.lowThreshold,
        actualThresholds.highThreshold
      ),
      predictedEnvironmentLabel: prediction.label,
    };

    return updatedSlate;
  });
}

export function evaluateBacktestSlateSummaries(
  predictions: HRPredictionWithLabel[],
  context: {
    actualThresholds: SlateEnvironmentThresholds;
    environmentModel: SlateEnvironmentModel;
  }
): HRBacktestSlateSummary[] {
  return applySlateEnvironmentModel(
    buildBaseSlateSummaries(predictions),
    context.actualThresholds,
    context.environmentModel
  );
}

function buildEnvironmentMetrics(
  slateSummaries: HRBacktestSlateSummary[]
): HRSlateEnvironmentMetrics {
  const lowHrSlates = slateSummaries.filter(
    (slate) => slate.actualEnvironmentLabel === 'low_hr'
  );
  const mediumHrSlates = slateSummaries.filter(
    (slate) => slate.actualEnvironmentLabel === 'medium_hr'
  );
  const highHrSlates = slateSummaries.filter(
    (slate) => slate.actualEnvironmentLabel === 'high_hr'
  );
  const predictedLowHrSlates = slateSummaries.filter(
    (slate) => slate.predictedEnvironmentLabel === 'low_hr'
  );
  const predictedMediumHrSlates = slateSummaries.filter(
    (slate) => slate.predictedEnvironmentLabel === 'medium_hr'
  );
  const predictedHighHrSlates = slateSummaries.filter(
    (slate) => slate.predictedEnvironmentLabel === 'high_hr'
  );
  const correctPredictedClassifications = slateSummaries.filter(
    (slate) => slate.predictedEnvironmentLabel === slate.actualEnvironmentLabel
  ).length;
  const rankedByPredictedScore = [...slateSummaries].sort(
    (left, right) => right.predictedHrEnvironmentScore - left.predictedHrEnvironmentScore
  );
  const top25Count = Math.max(1, Math.ceil(rankedByPredictedScore.length * 0.25));
  const bottom25Start = Math.max(0, rankedByPredictedScore.length - top25Count);
  const top20Count = Math.max(1, Math.ceil(rankedByPredictedScore.length * 0.2));
  const bottom20Start = Math.max(0, rankedByPredictedScore.length - top20Count);
  const top10Count = Math.max(1, Math.ceil(rankedByPredictedScore.length * 0.1));
  const bottom10Start = Math.max(0, rankedByPredictedScore.length - top10Count);
  const top25Slates = rankedByPredictedScore.slice(0, top25Count);
  const middle50Slates = rankedByPredictedScore.slice(top25Count, bottom25Start);
  const bottom25Slates = rankedByPredictedScore.slice(bottom25Start);
  const top20Slates = rankedByPredictedScore.slice(0, top20Count);
  const bottom20Slates = rankedByPredictedScore.slice(bottom20Start);
  const top10Slates = rankedByPredictedScore.slice(0, top10Count);
  const bottom10Slates = rankedByPredictedScore.slice(bottom10Start);

  return {
    lowHrTop10HitRate: average(lowHrSlates.map((slate) => slate.top10HitRate)),
    mediumHrTop10HitRate: average(mediumHrSlates.map((slate) => slate.top10HitRate)),
    highHrTop10HitRate: average(highHrSlates.map((slate) => slate.top10HitRate)),
    predictedLowHrTop10HitRate: average(
      predictedLowHrSlates.map((slate) => slate.top10HitRate)
    ),
    predictedMediumHrTop10HitRate: average(
      predictedMediumHrSlates.map((slate) => slate.top10HitRate)
    ),
    predictedHighHrTop10HitRate: average(
      predictedHighHrSlates.map((slate) => slate.top10HitRate)
    ),
    predictedClassificationAccuracy:
      slateSummaries.length === 0
        ? 0
        : correctPredictedClassifications / slateSummaries.length,
    percentileHitRates: {
      top25: average(top25Slates.map((slate) => slate.top10HitRate)),
      middle50: average(middle50Slates.map((slate) => slate.top10HitRate)),
      bottom25: average(bottom25Slates.map((slate) => slate.top10HitRate)),
      top20: average(top20Slates.map((slate) => slate.top10HitRate)),
      bottom20: average(bottom20Slates.map((slate) => slate.top10HitRate)),
      top10: average(top10Slates.map((slate) => slate.top10HitRate)),
      bottom10: average(bottom10Slates.map((slate) => slate.top10HitRate)),
    },
  };
}

function buildSlatePercentileGroups(slateSummaries: HRBacktestSlateSummary[]): {
  top25: Set<string>;
  middle50: Set<string>;
  bottom25: Set<string>;
  top20: Set<string>;
  bottom20: Set<string>;
  top10: Set<string>;
  bottom10: Set<string>;
} {
  const rankedByPredictedScore = [...slateSummaries].sort(
    (left, right) => right.predictedHrEnvironmentScore - left.predictedHrEnvironmentScore
  );
  const top25Count = Math.max(1, Math.ceil(rankedByPredictedScore.length * 0.25));
  const bottom25Start = Math.max(0, rankedByPredictedScore.length - top25Count);
  const top20Count = Math.max(1, Math.ceil(rankedByPredictedScore.length * 0.2));
  const bottom20Start = Math.max(0, rankedByPredictedScore.length - top20Count);
  const top10Count = Math.max(1, Math.ceil(rankedByPredictedScore.length * 0.1));
  const bottom10Start = Math.max(0, rankedByPredictedScore.length - top10Count);

  return {
    top25: new Set(rankedByPredictedScore.slice(0, top25Count).map((slate) => slate.gameDate)),
    middle50: new Set(
      rankedByPredictedScore.slice(top25Count, bottom25Start).map((slate) => slate.gameDate)
    ),
    bottom25: new Set(rankedByPredictedScore.slice(bottom25Start).map((slate) => slate.gameDate)),
    top20: new Set(rankedByPredictedScore.slice(0, top20Count).map((slate) => slate.gameDate)),
    bottom20: new Set(
      rankedByPredictedScore.slice(bottom20Start).map((slate) => slate.gameDate)
    ),
    top10: new Set(rankedByPredictedScore.slice(0, top10Count).map((slate) => slate.gameDate)),
    bottom10: new Set(
      rankedByPredictedScore.slice(bottom10Start).map((slate) => slate.gameDate)
    ),
  };
}

export function getSlatePercentileGroups(slateSummaries: HRBacktestSlateSummary[]) {
  return buildSlatePercentileGroups(slateSummaries);
}

function summarizeStrategySelections(
  strategy: 'A' | 'B' | 'C',
  description: string,
  selections: HRPredictionWithLabel[]
): HRBacktestStrategyResult {
  const totalBets = selections.length;
  const totalHits = selections.reduce((sum, prediction) => sum + prediction.actualLabel, 0);
  const hitRate = totalBets === 0 ? 0 : totalHits / totalBets;
  const roi = totalBets === 0 ? 0 : (totalHits - (totalBets - totalHits)) / totalBets;

  return {
    strategy,
    description,
    totalHits,
    totalBets,
    hitRate,
    roi,
  };
}

function buildStrategyResults(
  predictions: HRPredictionWithLabel[],
  slateSummaries: HRBacktestSlateSummary[]
): HRBacktestStrategyResult[] {
  const predictionsByDate = new Map<string, HRPredictionWithLabel[]>();

  for (const prediction of predictions) {
    const current = predictionsByDate.get(prediction.gameDate) ?? [];
    current.push(prediction);
    predictionsByDate.set(prediction.gameDate, current);
  }

  const percentileGroups = buildSlatePercentileGroups(slateSummaries);
  const strategyASelections: HRPredictionWithLabel[] = [];
  const strategyBSelections: HRPredictionWithLabel[] = [];
  const strategyCSelections: HRPredictionWithLabel[] = [];

  for (const slate of slateSummaries) {
    const rankedPredictions = [...(predictionsByDate.get(slate.gameDate) ?? [])].sort(
      (left, right) => right.predictedProbability - left.predictedProbability
    );

    strategyASelections.push(...rankedPredictions.slice(0, 10));

    if (percentileGroups.top20.has(slate.gameDate)) {
      strategyBSelections.push(...rankedPredictions.slice(0, 10));
      strategyCSelections.push(...rankedPredictions.slice(0, 5));
      continue;
    }

    if (percentileGroups.bottom20.has(slate.gameDate)) {
      continue;
    }

    strategyCSelections.push(...rankedPredictions.slice(0, 3));
  }

  return [
    summarizeStrategySelections('A', 'Bet top 10 players every slate', strategyASelections),
    summarizeStrategySelections(
      'B',
      'Bet top 10 only on slates in the top 20% of predicted HR environment',
      strategyBSelections
    ),
    summarizeStrategySelections(
      'C',
      'Bet top 5 on top 20% slates, top 3 on middle slates, skip bottom 20%',
      strategyCSelections
    ),
  ];
}

function compareSlatePerformance(
  left: HRBacktestSlateSummary,
  right: HRBacktestSlateSummary
): number {
  return (
    right.top10HitRate - left.top10HitRate ||
    right.top10HitCount - left.top10HitCount ||
    right.top5HitRate - left.top5HitRate ||
    right.top5HitCount - left.top5HitCount ||
    right.top10AveragePredictedProbability - left.top10AveragePredictedProbability ||
    right.top5AveragePredictedProbability - left.top5AveragePredictedProbability ||
    left.gameDate.localeCompare(right.gameDate)
  );
}

export function calculateBacktestMetrics(
  predictions: HRPredictionWithLabel[],
  options?: {
    actualThresholds?: SlateEnvironmentThresholds;
    environmentModel?: SlateEnvironmentModel;
  }
): HRBacktestMetrics {
  const baseSlateSummaries = buildBaseSlateSummaries(predictions);
  const actualThresholds =
    options?.actualThresholds ?? buildSlateEnvironmentThresholds(baseSlateSummaries);
  const environmentModel =
    options?.environmentModel ??
    trainSlateEnvironmentModel(
      baseSlateSummaries.map((slate) => ({
        features: extractSlateEnvironmentFeatures(slate),
        label: environmentLabelFromThresholds(
          slate.totalActualHRs,
          actualThresholds.lowThreshold,
          actualThresholds.highThreshold
        ),
      }))
    );
  const slateSummaries = applySlateEnvironmentModel(
    baseSlateSummaries,
    actualThresholds,
    environmentModel
  );
  const environmentMetrics = buildEnvironmentMetrics(slateSummaries);
  const strategyResults = buildStrategyResults(predictions, slateSummaries);
  const bestSlates = [...slateSummaries].sort(compareSlatePerformance).slice(0, 5);
  const worstSlates = [...slateSummaries].sort(compareSlatePerformance).reverse().slice(0, 5);

  return {
    sampleSize: predictions.length,
    positiveRate: average(predictions.map((entry) => entry.actualLabel)),
    logLoss: logLoss(predictions),
    brierScore: brierScore(predictions),
    accuracyAt50: accuracyAt50(predictions),
    top10HitRate: average(slateSummaries.map((slate) => slate.top10HitRate)),
    averageTop5HitRatePerSlate: average(slateSummaries.map((slate) => slate.top5HitRate)),
    averageTop10HitRatePerSlate: average(slateSummaries.map((slate) => slate.top10HitRate)),
    slateCount: slateSummaries.length,
    environmentMetrics,
    strategyResults,
    bestSlates,
    worstSlates,
    calibrationBuckets: buildCalibrationBuckets(predictions),
  };
}

export function createSlateEnvironmentBacktestContext(
  trainingPredictions: HRPredictionWithLabel[]
): {
  actualThresholds: SlateEnvironmentThresholds;
  environmentModel: SlateEnvironmentModel;
} {
  const baseSlateSummaries = buildBaseSlateSummaries(trainingPredictions);
  const actualThresholds = buildSlateEnvironmentThresholds(baseSlateSummaries);
  const environmentModel = trainSlateEnvironmentModel(
    baseSlateSummaries.map((slate) => ({
      features: extractSlateEnvironmentFeatures(slate),
      label: environmentLabelFromThresholds(
        slate.totalActualHRs,
        actualThresholds.lowThreshold,
        actualThresholds.highThreshold
      ),
    }))
  );

  return {
    actualThresholds,
    environmentModel,
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
      parkHrFactor: row.parkHrFactor,
      weatherHrImpactScore: row.weatherHrImpactScore,
      pitcherHr9: row.pitcherHr9,
      seasonHRPerGame: row.seasonHRPerGame,
    }));

  const trainPredictions = buildPredictions(trainExamples);
  const testPredictions = buildPredictions(testExamples);
  const slateEnvironmentContext = createSlateEnvironmentBacktestContext(trainPredictions);

  return {
    model,
    trainMetrics: calculateBacktestMetrics(trainPredictions, slateEnvironmentContext),
    testMetrics: calculateBacktestMetrics(testPredictions, slateEnvironmentContext),
    trainPredictions,
    testPredictions,
  };
}
