import type {
  HRTrainingExample,
  LogisticModelArtifact,
  StandardizationParams,
} from './types';
import { HR_MODEL_FEATURES, featureVectorFromExample } from './hrFeatureEngineering';

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], valuesMean: number): number {
  const variance =
    values.reduce((sum, value) => sum + (value - valuesMean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

function standardizeExamples(
  examples: HRTrainingExample[]
): { rows: number[][]; standardization: Record<string, StandardizationParams> } {
  const standardization: Record<string, StandardizationParams> = {};

  for (const featureName of HR_MODEL_FEATURES) {
    const values = examples.map((example) => example[featureName]);
    const featureMean = mean(values);
    const featureStd = standardDeviation(values, featureMean) || 1;

    standardization[featureName] = {
      mean: featureMean,
      stdDev: featureStd,
    };
  }

  const rows = examples.map((example) =>
    HR_MODEL_FEATURES.map((featureName) => {
      const params = standardization[featureName];
      return (example[featureName] - params.mean) / params.stdDev;
    })
  );

  return { rows, standardization };
}

export function trainHRLogisticModel(
  trainingExamples: HRTrainingExample[],
  options?: {
    iterations?: number;
    learningRate?: number;
    l2Penalty?: number;
    validationExamples?: HRTrainingExample[];
  }
): LogisticModelArtifact {
  if (trainingExamples.length < 50) {
    throw new Error('Need at least 50 historical examples before training the HR logistic model.');
  }

  const iterations = options?.iterations ?? 2500;
  const learningRate = options?.learningRate ?? 0.03;
  const l2Penalty = options?.l2Penalty ?? 0.0005;
  const { rows, standardization } = standardizeExamples(trainingExamples);

  const weights = new Array(HR_MODEL_FEATURES.length).fill(0);
  let bias = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const weightGradients = new Array(HR_MODEL_FEATURES.length).fill(0);
    let biasGradient = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const label = trainingExamples[rowIndex].label;
      const prediction = sigmoid(dotProduct(weights, row) + bias);
      const error = prediction - label;

      biasGradient += error;

      for (let featureIndex = 0; featureIndex < row.length; featureIndex += 1) {
        weightGradients[featureIndex] += error * row[featureIndex];
      }
    }

    for (let featureIndex = 0; featureIndex < weights.length; featureIndex += 1) {
      const l2Gradient = l2Penalty * weights[featureIndex];
      weights[featureIndex] -=
        learningRate * (weightGradients[featureIndex] / rows.length + l2Gradient);
    }

    bias -= learningRate * (biasGradient / rows.length);
  }

  return {
    featureNames: [...HR_MODEL_FEATURES],
    weights,
    bias,
    standardization,
    metadata: {
      trainedAt: new Date().toISOString(),
      iterations,
      learningRate,
      trainSize: trainingExamples.length,
      validationSize: options?.validationExamples?.length ?? 0,
    },
  };
}

export function predictHRProbability(
  model: LogisticModelArtifact,
  example: HRTrainingExample
): number {
  const standardizedVector = featureVectorFromExample(example).map((rawValue, index) => {
    const featureName = model.featureNames[index];
    const params = model.standardization[featureName];
    return (rawValue - params.mean) / params.stdDev;
  });

  return sigmoid(dotProduct(model.weights, standardizedVector) + model.bias);
}
