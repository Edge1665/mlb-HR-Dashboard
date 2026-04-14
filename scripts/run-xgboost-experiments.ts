import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function formatPhaseSummary(
  label: 'train' | 'calibration' | 'test',
  summary: {
    sampleSize: number;
    slateCount: number;
    logLoss: number;
    brierScore: number;
    accuracyAt50: number;
    top5HitRate: number;
    top10HitRate: number;
    calibration: {
      weightedCalibrationGap: number;
      meanAbsoluteBucketGap: number;
      maxBucketGap: number;
      populatedBucketCount: number;
    };
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
) {
  return [
    `  ${label}:`,
    `sampleSize=${summary.sampleSize}`,
    `slates=${summary.slateCount}`,
    `top5HitRate=${summary.top5HitRate.toFixed(4)}`,
    `top10HitRate=${summary.top10HitRate.toFixed(4)}`,
    `logLoss=${summary.logLoss.toFixed(4)}`,
    `brier=${summary.brierScore.toFixed(4)}`,
    `accuracyAt50=${summary.accuracyAt50.toFixed(4)}`,
    `weightedCalibrationGap=${summary.calibration.weightedCalibrationGap.toFixed(4)}`,
    `meanBucketGap=${summary.calibration.meanAbsoluteBucketGap.toFixed(4)}`,
    `maxBucketGap=${summary.calibration.maxBucketGap.toFixed(4)}`,
    `calibrationBuckets=${summary.calibration.populatedBucketCount}`,
    `top5Range=${summary.separation.averageTop5ProbabilityRange.toFixed(4)}`,
    `top10Range=${summary.separation.averageTop10ProbabilityRange.toFixed(4)}`,
    `top10StdDev=${summary.separation.averageTop10ProbabilityStdDev.toFixed(4)}`,
    `nextSlateTop5Overlap=${summary.stability.averageNextSlateTop5Overlap.toFixed(4)}`,
    `nextSlateTop10Overlap=${summary.stability.averageNextSlateTop10Overlap.toFixed(4)}`,
    `topPickRepeatRate=${summary.stability.averageTopPickRepeatRate.toFixed(4)}`,
  ].join(' | ');
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'));

  const [
    { fetchTrainingExamplesFromSnapshots },
    {
      runHRXGBoostExperiments,
      HR_XGBOOST_EXPERIMENT_CONFIGS,
      HR_XGBOOST_POSITIVE_BOOST_SWEEP_CONFIGS,
      HR_XGBOOST_CONSERVATIVE_SHRINKAGE_SWEEP_CONFIGS,
    },
  ] = await Promise.all([
    import('@/services/hrTrainingSnapshotService'),
    import('@/services/ml/hrXGBoostExperimentService'),
  ]);

  const experimentSet = process.env.HR_XGBOOST_EXPERIMENT_SET ?? 'default';
  const experimentConfigs =
    experimentSet === 'positive_boost_sweep'
      ? HR_XGBOOST_POSITIVE_BOOST_SWEEP_CONFIGS
      : experimentSet === 'conservative_shrinkage_sweep'
        ? HR_XGBOOST_CONSERVATIVE_SHRINKAGE_SWEEP_CONFIGS
      : HR_XGBOOST_EXPERIMENT_CONFIGS;

  console.log('Loading HR training examples...');
  const examples = await fetchTrainingExamplesFromSnapshots({ minRows: 250 });
  console.log(`Loaded ${examples.length} labeled examples.\n`);

  console.log(`Experiment set: ${experimentSet}`);
  console.log(`Running ${experimentConfigs.length} XGBoost experiments...\n`);
  const result = await runHRXGBoostExperiments(examples, experimentConfigs);

  console.log(`Baseline: ${result.baselineName ?? 'n/a'}`);
  console.log('');

  for (const experiment of result.experiments) {
    console.log(`Experiment: ${experiment.name}`);
    console.log(
      [
        '  config:',
        `featureCount=${experiment.featureCount}`,
        `positiveBoostFactor=${experiment.positiveBoostFactor}`,
        `probabilityPower=${experiment.probabilityPower}`,
        `conservativeShrinkage=${experiment.conservativeShrinkage}`,
      ].join(' | ')
    );
    console.log(
      [
        '  split:',
        `train=${experiment.split.trainSize}`,
        `calibration=${experiment.split.calibrationSize}`,
        `test=${experiment.split.testSize}`,
      ].join(' | ')
    );
    console.log(formatPhaseSummary('train', experiment.train));
    console.log(formatPhaseSummary('calibration', experiment.calibration));
    console.log(formatPhaseSummary('test', experiment.test));
    console.log('');
  }

  const outputDir = path.join(process.cwd(), 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(
    outputDir,
    `xgboost_experiment_results_${experimentSet}.json`
  );
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Saved experiment results to ${outputPath}`);
}

main().catch((error) => {
  console.error('XGBoost experiment run failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
