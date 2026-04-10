import { HR_MODEL_FEATURES, type HRModelFeatureName } from './hrFeatureEngineering';
import { runTimeSplitBacktestXGBoost } from './hrXGBoostModel';
import type { HRTrainingExample } from './types';

export interface FeatureAblationScenario {
  name: string;
  excludeFeatures: HRModelFeatureName[];
}

export const DEFAULT_ABLATION_SCENARIOS: FeatureAblationScenario[] = [
  { name: 'full_model', excludeFeatures: [] },
  { name: 'minus_recent_pitcher_hr9', excludeFeatures: ['recentPitcherHr9'] },
  { name: 'minus_recent_games_with_hr', excludeFeatures: ['recentGamesWithHR'] },
  { name: 'minus_last14_hr', excludeFeatures: ['last14HR'] },
  { name: 'minus_last30_hr', excludeFeatures: ['last30HR'] },
  { name: 'minus_projected_at_bats', excludeFeatures: ['projectedAtBats'] },
  {
    name: 'minus_recent_form_group',
    excludeFeatures: [
      'last14HR',
      'last30HR',
      'recentGamesWithHR',
    ],
  },
];

export const QUICK_ABLATION_SCENARIOS: FeatureAblationScenario[] = [
  { name: 'full_model', excludeFeatures: [] },
  { name: 'minus_recent_games_with_hr', excludeFeatures: ['recentGamesWithHR'] },
  {
    name: 'minus_recent_form_group',
    excludeFeatures: [
      'last14HR',
      'last30HR',
      'recentGamesWithHR',
    ],
  },
];

function toFeatureSubset(excludeFeatures: readonly HRModelFeatureName[]): HRModelFeatureName[] {
  const excluded = new Set(excludeFeatures);
  return HR_MODEL_FEATURES.filter((featureName) => !excluded.has(featureName));
}

export async function runHRFeatureAblation(
  examples: HRTrainingExample[],
  scenarios: FeatureAblationScenario[] = DEFAULT_ABLATION_SCENARIOS,
  options?: {
    trainFraction?: number;
    calibrationFraction?: number;
  }
) {
  const results = [];

  for (const scenario of scenarios) {
    const featureNames = toFeatureSubset(scenario.excludeFeatures);
    const backtest = await runTimeSplitBacktestXGBoost(examples, {
      featureNames,
      trainFraction: options?.trainFraction,
      calibrationFraction: options?.calibrationFraction,
    });

    results.push({
      scenario: scenario.name,
      featureCount: featureNames.length,
      featureNames,
      excludedFeatures: scenario.excludeFeatures,
      trainMetrics: backtest.trainMetrics,
      calibrationMetrics: backtest.calibrationMetrics,
      testMetrics: backtest.testMetrics,
    });
  }

  const baseline = results.find((result) => result.scenario === 'full_model') ?? results[0];

  return {
    baselineScenario: baseline.scenario,
    results: results.map((result) => ({
      ...result,
      deltasFromBaseline: {
        testTop10HitRate: result.testMetrics.top10HitRate - baseline.testMetrics.top10HitRate,
        testLogLoss: result.testMetrics.logLoss - baseline.testMetrics.logLoss,
        testBrierScore: result.testMetrics.brierScore - baseline.testMetrics.brierScore,
      },
    })),
  };
}
