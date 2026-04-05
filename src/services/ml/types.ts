export interface HRTrainingExample {
  batterId: string;
  batterName: string;
  gameDate: string;
  seasonHRPerGame: number;
  barrelRate: number;
  exitVelocityAvg: number;
  iso: number;
  hardHitRate: number;
  flyBallRate: number;
  xSlugging: number;
  pitcherHr9: number;
  pitcherFbPct: number;
  parkHrFactor: number;
  weatherHrImpactScore: number;
  projectedAtBats: number;
  platoonEdge: number;
  teamHrPerGame: number;
  last7HR: number;
  last14HR: number;
  last30HR: number;
  label: 0 | 1;
}

export interface StandardizationParams {
  mean: number;
  stdDev: number;
}

export interface LogisticModelArtifact {
  featureNames: string[];
  weights: number[];
  bias: number;
  standardization: Record<string, StandardizationParams>;
  metadata: {
    trainedAt: string;
    iterations: number;
    learningRate: number;
    trainSize: number;
    validationSize: number;
  };
}

export interface HRBacktestMetrics {
  sampleSize: number;
  positiveRate: number;
  logLoss: number;
  brierScore: number;
  accuracyAt50: number;
  top10HitRate: number;
  calibrationBuckets: Array<{
    bucketMin: number;
    bucketMax: number;
    count: number;
    avgPredicted: number;
    actualRate: number;
  }>;
}

export interface HRPredictionWithLabel {
  batterId: string;
  batterName: string;
  gameDate: string;
  predictedProbability: number;
  actualLabel: 0 | 1;
}
