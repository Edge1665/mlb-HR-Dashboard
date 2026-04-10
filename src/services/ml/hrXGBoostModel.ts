import { XGBoost } from '@fractal-solutions/xgboost-js';
import {
  calculateBacktestMetrics,
  createSlateEnvironmentBacktestContext,
} from './hrBacktest';
import {
  HR_MODEL_FEATURES,
  featureVectorFromExample,
  type HRModelFeatureName,
} from './hrFeatureEngineering';
import {
  getSeasonSampleWeight,
  normalizeSeasonSampleWeights,
  type SeasonSampleWeights,
} from './hrSeasonWeights';
import type {
  HRBacktestMetrics,
  HRPredictionWithLabel,
  HRTrainingExample,
} from './types';

type CalibrationBucket = {
  rawMin: number;
  rawMax: number;
  avgRaw: number;
  actualRate: number;
  count: number;
};

type CalibrationModel = {
  globalPositiveRate: number;
  buckets: CalibrationBucket[];
};

export interface XGBoostModelSummary {
  featureNames: string[];
  params: {
    learningRate: number;
    maxDepth: number;
    minChildWeight: number;
    numRounds: number;
    positiveBoostFactor: number;
    negativeSampleRate: number;
    probabilityPower: number;
    seasonSampleWeights: SeasonSampleWeights;
  };
  featureImportance: Record<string, number>;
  trainedAt: string;
  trainSize: number;
  calibrationSize: number;
  testSize: number;
  calibration: CalibrationModel;
  modelJson: {
    trees: unknown[];
    params: Record<string, unknown>;
  };
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.000001, Math.min(0.999999, value));
}

function createXGBoostModel(options?: {
  learningRate?: number;
  maxDepth?: number;
  minChildWeight?: number;
  numRounds?: number;
}) {
  return new XGBoost({
    learningRate: options?.learningRate ?? 0.08,
    maxDepth: options?.maxDepth ?? 5,
    minChildWeight: options?.minChildWeight ?? 1,
    numRounds: options?.numRounds ?? 180,
  });
}

function standardizeRows(rows: number[][]): {
  standardizedRows: number[][];
  means: number[];
  stds: number[];
} {
  if (rows.length === 0) {
    return { standardizedRows: [], means: [], stds: [] };
  }

  const featureCount = rows[0].length;
  const means = new Array(featureCount).fill(0);
  const stds = new Array(featureCount).fill(1);

  for (let j = 0; j < featureCount; j += 1) {
    const values = rows.map((row) => row[j]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance) || 1;

    means[j] = mean;
    stds[j] = std;
  }

  const standardizedRows = rows.map((row) =>
    row.map((value, j) => (value - means[j]) / stds[j])
  );

  return { standardizedRows, means, stds };
}

function applyStandardization(row: number[], means: number[], stds: number[]): number[] {
  return row.map((value, j) => (value - means[j]) / (stds[j] || 1));
}

export type HRProbabilityMode = 'raw_calibrated' | 'conservative';

function buildSampleWeights(
  examples: HRTrainingExample[],
  positiveBoostFactor = 6,
  negativeSampleRate = 1.0,
  seasonSampleWeights?: SeasonSampleWeights
): number[] {
  const normalizedSeasonWeights = normalizeSeasonSampleWeights(seasonSampleWeights);

  return examples.map((example) => {
    const seasonWeight = getSeasonSampleWeight(example.gameDate, normalizedSeasonWeights);
    const classWeight =
      example.label === 1 ? positiveBoostFactor : negativeSampleRate;

    return seasonWeight * classWeight;
  });
}

function sortExamplesByDate(examples: HRTrainingExample[]): HRTrainingExample[] {
  return [...examples].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
}

export function splitChronologically(
  examples: HRTrainingExample[],
  options?: {
    trainFraction?: number;
    calibrationFraction?: number;
  }
) {
  const sorted = sortExamplesByDate(examples);
  const trainFraction = options?.trainFraction ?? 0.7;
  const calibrationFraction = options?.calibrationFraction ?? 0.15;
  const testFraction = 1 - trainFraction - calibrationFraction;

  if (trainFraction <= 0 || calibrationFraction <= 0 || testFraction <= 0) {
    throw new Error(
      'trainFraction and calibrationFraction must leave a positive remainder for the test split.'
    );
  }

  const total = sorted.length;
  const proposedTrainEnd = Math.floor(total * trainFraction);
  const proposedCalibrationEnd = Math.floor(total * (trainFraction + calibrationFraction));

  const trainEnd = Math.min(Math.max(100, proposedTrainEnd), total - 100);
  const calibrationEnd = Math.min(
    Math.max(trainEnd + 50, proposedCalibrationEnd),
    total - 50
  );

  const trainExamples = sorted.slice(0, trainEnd);
  const calibrationExamples = sorted.slice(trainEnd, calibrationEnd);
  const testExamples = sorted.slice(calibrationEnd);

  if (trainExamples.length < 100 || calibrationExamples.length < 50 || testExamples.length < 50) {
    throw new Error(
      `Need at least 100 train, 50 calibration, and 50 test examples. Got ${trainExamples.length}/${calibrationExamples.length}/${testExamples.length}.`
    );
  }

  return {
    trainExamples,
    calibrationExamples,
    testExamples,
  };
}

function enforceMonotonicCalibration(buckets: CalibrationBucket[]): CalibrationBucket[] {
  if (buckets.length <= 1) {
    return buckets;
  }

  const blocks = buckets.map((bucket, index) => ({
    start: index,
    end: index,
    count: bucket.count,
    weightedRateSum: bucket.actualRate * bucket.count,
  }));

  let cursor = 0;
  while (cursor < blocks.length - 1) {
    const currentAvg = blocks[cursor].weightedRateSum / blocks[cursor].count;
    const nextAvg = blocks[cursor + 1].weightedRateSum / blocks[cursor + 1].count;

    if (currentAvg <= nextAvg) {
      cursor += 1;
      continue;
    }

    blocks[cursor] = {
      start: blocks[cursor].start,
      end: blocks[cursor + 1].end,
      count: blocks[cursor].count + blocks[cursor + 1].count,
      weightedRateSum:
        blocks[cursor].weightedRateSum + blocks[cursor + 1].weightedRateSum,
    };
    blocks.splice(cursor + 1, 1);

    if (cursor > 0) {
      cursor -= 1;
    }
  }

  const calibrated = buckets.map((bucket) => ({ ...bucket }));
  for (const block of blocks) {
    const pooledRate = block.weightedRateSum / block.count;
    for (let i = block.start; i <= block.end; i += 1) {
      calibrated[i].actualRate = pooledRate;
    }
  }

  return calibrated;
}

function buildCalibrationModel(
  predictions: Array<{ raw: number; actual: 0 | 1 }>
): CalibrationModel {
  if (predictions.length === 0) {
    return {
      globalPositiveRate: 0.05,
      buckets: [],
    };
  }

  const sorted = [...predictions].sort((a, b) => a.raw - b.raw);
  const globalPositiveRate =
    sorted.reduce((sum, item) => sum + item.actual, 0) / sorted.length;

  const bucketCount = Math.min(12, Math.max(6, Math.floor(sorted.length / 120)));
  const bucketSize = Math.max(25, Math.floor(sorted.length / bucketCount));

  const buckets: CalibrationBucket[] = [];

  for (let start = 0; start < sorted.length; start += bucketSize) {
    const slice = sorted.slice(start, Math.min(sorted.length, start + bucketSize));
    if (slice.length === 0) continue;

    const avgRaw = slice.reduce((sum, item) => sum + item.raw, 0) / slice.length;
    const empiricalRate = slice.reduce((sum, item) => sum + item.actual, 0) / slice.length;

    // smooth small buckets toward global rate
    const smoothingWeight = slice.length / (slice.length + 40);
    const smoothedRate =
      empiricalRate * smoothingWeight + globalPositiveRate * (1 - smoothingWeight);

    buckets.push({
      rawMin: slice[0].raw,
      rawMax: slice[slice.length - 1].raw,
      avgRaw,
      actualRate: smoothedRate,
      count: slice.length,
    });
  }

  return {
    globalPositiveRate,
    buckets: enforceMonotonicCalibration(buckets),
  };
}

function applyCalibration(rawPrediction: number, calibration: CalibrationModel): number {
  if (!calibration.buckets.length) {
    return clampProbability(rawPrediction);
  }

  const raw = clampProbability(rawPrediction);

  if (raw <= calibration.buckets[0].rawMax) {
    return clampProbability(calibration.buckets[0].actualRate);
  }

  for (let i = 1; i < calibration.buckets.length; i += 1) {
    const prev = calibration.buckets[i - 1];
    const curr = calibration.buckets[i];

    if (raw <= curr.rawMax) {
      const denom = curr.avgRaw - prev.avgRaw;
      if (Math.abs(denom) < 1e-9) {
        return clampProbability(curr.actualRate);
      }

      const t = (raw - prev.avgRaw) / denom;
      const interpolated = prev.actualRate + t * (curr.actualRate - prev.actualRate);
      return clampProbability(interpolated);
    }
  }

  return clampProbability(calibration.buckets[calibration.buckets.length - 1].actualRate);
}

function getConservativeProbability(
  calibratedPrediction: number,
  calibration: CalibrationModel
): number {
  const globalRate = clampProbability(calibration.globalPositiveRate || 0.1);
  return clampProbability(globalRate + (calibratedPrediction - globalRate) * 0.45);
}

export function predictHRXGBoostProbabilityDetails(
  model: XGBoost,
  example: HRTrainingExample,
  standardization: {
    means: number[];
    stds: number[];
  },
  calibration: CalibrationModel,
  probabilityPower = 0.85,
  featureNames: readonly HRModelFeatureName[] = HR_MODEL_FEATURES
): {
  rawCalibratedProbability: number;
  conservativeProbability: number;
} {
  const rawVector = featureVectorFromExample(example, featureNames);
  const standardizedVector = applyStandardization(
    rawVector,
    standardization.means,
    standardization.stds
  );

  const rawPrediction = clampProbability(model.predictSingle(standardizedVector));
  const rankedPrediction = clampProbability(rawPrediction ** probabilityPower);
  const calibratedPrediction = applyCalibration(rankedPrediction, calibration);
  const conservativeProbability = getConservativeProbability(
    calibratedPrediction,
    calibration
  );

  return {
    rawCalibratedProbability: calibratedPrediction,
    conservativeProbability,
  };
}

export async function trainHRXGBoostModel(
  trainingExamples: HRTrainingExample[],
  options?: {
    learningRate?: number;
    maxDepth?: number;
    minChildWeight?: number;
    numRounds?: number;
    calibrationExamples?: HRTrainingExample[];
    positiveBoostFactor?: number;
    negativeSampleRate?: number;
    probabilityPower?: number;
    featureNames?: readonly HRModelFeatureName[];
    seasonSampleWeights?: SeasonSampleWeights;
    testExamples?: HRTrainingExample[];
  }
): Promise<{
  model: XGBoost;
  summary: XGBoostModelSummary;
  standardization: {
    means: number[];
    stds: number[];
  };
  calibration: CalibrationModel;
}> {
  if (trainingExamples.length < 100) {
    throw new Error('Need at least 100 historical examples before training the HR XGBoost model.');
  }

  const params = {
    learningRate: options?.learningRate ?? 0.08,
    maxDepth: options?.maxDepth ?? 5,
    minChildWeight: options?.minChildWeight ?? 1,
    numRounds: options?.numRounds ?? 180,
    positiveBoostFactor: options?.positiveBoostFactor ?? 6,
    negativeSampleRate: options?.negativeSampleRate ?? 1.0,
    probabilityPower: options?.probabilityPower ?? 0.85,
    seasonSampleWeights: normalizeSeasonSampleWeights(options?.seasonSampleWeights),
  };
  const featureNames = options?.featureNames ?? HR_MODEL_FEATURES;

  const sampleWeight = buildSampleWeights(
    trainingExamples,
    params.positiveBoostFactor,
    params.negativeSampleRate,
    params.seasonSampleWeights
  );

  const rawX = trainingExamples.map((example) => featureVectorFromExample(example, featureNames));
  const y = trainingExamples.map((example) => example.label);

  const { standardizedRows, means, stds } = standardizeRows(rawX);

  const model = createXGBoostModel(params);
  await (
    model as XGBoost & {
      fit: (X: number[][], y: number[], sampleWeight?: number[]) => Promise<void> | void;
    }
  ).fit(standardizedRows, y, sampleWeight);

  let featureImportance: Record<string, number> = {};
  try {
    featureImportance = model.getFeatureImportance?.() ?? {};
  } catch {
    featureImportance = {};
  }

  const calibrationExamples = options?.calibrationExamples ?? [];

  const calibrationRawPredictions = calibrationExamples.map((example) => {
    const standardizedVector = applyStandardization(
      featureVectorFromExample(example, featureNames),
      means,
      stds
    );

    const rawPrediction = clampProbability(
      model.predictSingle(standardizedVector) ** params.probabilityPower
    );

    return {
      raw: rawPrediction,
      actual: example.label,
    };
  });

  const calibration = buildCalibrationModel(calibrationRawPredictions);

  return {
    model,
    summary: {
      featureNames: [...featureNames],
      params,
      featureImportance,
      trainedAt: new Date().toISOString(),
      trainSize: trainingExamples.length,
      calibrationSize: calibrationExamples.length,
      testSize: options?.testExamples?.length ?? 0,
      calibration,
      modelJson: model.toJSON(),
    },
    standardization: {
      means,
      stds,
    },
    calibration,
  };
}

export function predictHRXGBoostProbability(
  model: XGBoost,
  example: HRTrainingExample,
  standardization: {
    means: number[];
    stds: number[];
  },
  calibration: CalibrationModel,
  probabilityPower = 0.85,
  featureNames: readonly HRModelFeatureName[] = HR_MODEL_FEATURES,
  probabilityMode: HRProbabilityMode = 'raw_calibrated'
): number {
  const details = predictHRXGBoostProbabilityDetails(
    model,
    example,
    standardization,
    calibration,
    probabilityPower,
    featureNames
  );

  return probabilityMode === 'conservative'
    ? details.conservativeProbability
    : details.rawCalibratedProbability;
}

export async function runTimeSplitBacktestXGBoost(
  examples: HRTrainingExample[],
  options?: {
    trainFraction?: number;
    calibrationFraction?: number;
    learningRate?: number;
    maxDepth?: number;
    minChildWeight?: number;
    numRounds?: number;
    positiveBoostFactor?: number;
    negativeSampleRate?: number;
    probabilityPower?: number;
    featureNames?: readonly HRModelFeatureName[];
    seasonSampleWeights?: SeasonSampleWeights;
    probabilityMode?: HRProbabilityMode;
  }
): Promise<{
  model: XGBoostModelSummary;
  trainMetrics: HRBacktestMetrics;
  calibrationMetrics: HRBacktestMetrics;
  testMetrics: HRBacktestMetrics;
  trainPredictions: HRPredictionWithLabel[];
  calibrationPredictions: HRPredictionWithLabel[];
  testPredictions: HRPredictionWithLabel[];
  split: {
    trainSize: number;
    calibrationSize: number;
    testSize: number;
  };
}> {
  if (examples.length < 250) {
    throw new Error('Need at least 250 examples to run a meaningful 3-way XGBoost HR backtest.');
  }

  const { trainExamples, calibrationExamples, testExamples } = splitChronologically(examples, {
    trainFraction: options?.trainFraction,
    calibrationFraction: options?.calibrationFraction,
  });

  const probabilityPower = options?.probabilityPower ?? 0.85;
  const probabilityMode = options?.probabilityMode ?? 'raw_calibrated';
  const featureNames = options?.featureNames ?? HR_MODEL_FEATURES;

  const { model, summary, standardization, calibration } = await trainHRXGBoostModel(
    trainExamples,
    {
      learningRate: options?.learningRate,
      maxDepth: options?.maxDepth,
      minChildWeight: options?.minChildWeight,
      numRounds: options?.numRounds,
      positiveBoostFactor: options?.positiveBoostFactor,
      negativeSampleRate: options?.negativeSampleRate,
      probabilityPower,
      calibrationExamples,
      featureNames,
      seasonSampleWeights: options?.seasonSampleWeights,
      testExamples,
    }
  );

  const buildPredictions = (rows: HRTrainingExample[]): HRPredictionWithLabel[] =>
    rows.map((row) => ({
      batterId: row.batterId,
      batterName: row.batterName,
      gameDate: row.gameDate,
      predictedProbability: predictHRXGBoostProbability(
        model,
        row,
        standardization,
        calibration,
        probabilityPower,
        featureNames,
        probabilityMode
      ),
      actualLabel: row.label,
      parkHrFactor: row.parkHrFactor,
      weatherHrImpactScore: row.weatherHrImpactScore,
      pitcherHr9: row.pitcherHr9,
      seasonHRPerGame: row.seasonHRPerGame,
    }));

  const trainPredictions = buildPredictions(trainExamples);
  const calibrationPredictions = buildPredictions(calibrationExamples);
  const testPredictions = buildPredictions(testExamples);
  const slateEnvironmentContext = createSlateEnvironmentBacktestContext(trainPredictions);

  return {
    model: summary,
    trainMetrics: calculateBacktestMetrics(trainPredictions, slateEnvironmentContext),
    calibrationMetrics: calculateBacktestMetrics(
      calibrationPredictions,
      slateEnvironmentContext
    ),
    testMetrics: calculateBacktestMetrics(testPredictions, slateEnvironmentContext),
    trainPredictions,
    calibrationPredictions,
    testPredictions,
    split: {
      trainSize: trainExamples.length,
      calibrationSize: calibrationExamples.length,
      testSize: testExamples.length,
    },
  };
}
