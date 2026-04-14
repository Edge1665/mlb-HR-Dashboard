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
  temperature: number;
  humidity: number;
  windSpeed: number;
  windOutToCenter: number;
  windInFromCenter: number;
  crosswind: number;
  pullSideWindBoost: number;
  airDensityProxy: number;
  densityAltitude: number;
  parkIdNumeric: number;
  parkHrFactorVsHand: number;
  averageFenceDistance: number;
  fenceDistanceIndex: number;
  estimatedHrParksForTypical400FtFly: number;
  projectedAtBats: number;
  platoonEdge: number;
  handednessInteraction: number;
  teamHrPerGame: number;

  last7HR: number;
  last14HR: number;
  last30HR: number;

  recentHardHits: number;
  recentExtraBaseHits: number;
  fbMatchupFactor: number;
  recentHrTrend: number;
  recentPowerScore: number;
  pitcherRecentRisk: number;
  platoonPowerInteraction: number;
  environmentScore: number;
  pitchMixMatchupScore: number;
  pitcherVulnerabilityVsHand: number;
  batterVsPitchMixPower: number;

  recentGamesWithHR: number;
  multiHRGamesLast30: number;
  recentPitcherHr9: number;

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

export type HRSlateEnvironmentLabel = 'low_hr' | 'medium_hr' | 'high_hr';

export interface HRSlateExposureRecommendation {
  minHitters: number;
  maxHitters: number;
  shouldConsiderSkip: boolean;
  summary: string;
}

export interface HRBacktestMetrics {
  sampleSize: number;
  positiveRate: number;
  logLoss: number;
  brierScore: number;
  accuracyAt50: number;
  top10HitRate: number;
  averageTop5HitRatePerSlate: number;
  averageTop10HitRatePerSlate: number;
  slateCount: number;
  environmentMetrics: HRSlateEnvironmentMetrics;
  strategyResults: HRBacktestStrategyResult[];
  bestSlates: HRBacktestSlateSummary[];
  worstSlates: HRBacktestSlateSummary[];
  calibrationBuckets: Array<{
    bucketMin: number;
    bucketMax: number;
    count: number;
    avgPredicted: number;
    actualRate: number;
  }>;
}

export interface HRBacktestSlateSummary {
  gameDate: string;
  predictionCount: number;
  estimatedGameCount: number;
  totalActualHRs: number;
  top5HitCount: number;
  top5HitRate: number;
  top5AveragePredictedProbability: number;
  top10HitCount: number;
  top10HitRate: number;
  top10AveragePredictedProbability: number;
  averageParkHrFactor: number;
  averageWeatherHrImpactScore: number;
  averagePitcherHr9: number;
  averageSeasonHrPerGame: number;
  averagePredictedHrProbability: number;
  predictedHrEnvironmentScore: number;
  actualEnvironmentLabel: HRSlateEnvironmentLabel;
  predictedEnvironmentLabel: HRSlateEnvironmentLabel;
}

export interface HRSlateEnvironmentMetrics {
  lowHrTop10HitRate: number;
  mediumHrTop10HitRate: number;
  highHrTop10HitRate: number;
  predictedLowHrTop10HitRate: number;
  predictedMediumHrTop10HitRate: number;
  predictedHighHrTop10HitRate: number;
  predictedClassificationAccuracy: number;
  percentileHitRates: {
    top25: number;
    middle50: number;
    bottom25: number;
    top20: number;
    bottom20: number;
    top10: number;
    bottom10: number;
  };
}

export interface HRBacktestStrategyResult {
  strategy: 'A' | 'B' | 'C';
  description: string;
  totalHits: number;
  totalBets: number;
  hitRate: number;
  roi: number;
}

export interface HRPredictionWithLabel {
  batterId: string;
  batterName: string;
  gameDate: string;
  predictedProbability: number;
  actualLabel: 0 | 1;
  parkHrFactor: number;
  weatherHrImpactScore: number;
  pitcherHr9: number;
  seasonHRPerGame: number;
}
