import fs from 'fs';
import path from 'path';
import type { HRBacktestMetrics, HRBacktestSlateSummary } from '@/services/ml/types';

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

function formatMetricBlock(title: string, metrics: HRBacktestMetrics) {
  const lines = [
    title,
    `  sampleSize: ${metrics.sampleSize}`,
    `  positiveRate: ${metrics.positiveRate.toFixed(4)}`,
    `  logLoss: ${metrics.logLoss.toFixed(4)}`,
    `  brierScore: ${metrics.brierScore.toFixed(4)}`,
    `  accuracyAt50: ${metrics.accuracyAt50.toFixed(4)}`,
    `  slateCount: ${metrics.slateCount}`,
    `  averageTop5HitRatePerSlate: ${metrics.averageTop5HitRatePerSlate.toFixed(4)}`,
    `  averageTop10HitRatePerSlate: ${metrics.averageTop10HitRatePerSlate.toFixed(4)}`,
    `  predictedClassificationAccuracy: ${metrics.environmentMetrics.predictedClassificationAccuracy.toFixed(4)}`,
    `  lowHrTop10HitRate: ${metrics.environmentMetrics.lowHrTop10HitRate.toFixed(4)}`,
    `  mediumHrTop10HitRate: ${metrics.environmentMetrics.mediumHrTop10HitRate.toFixed(4)}`,
    `  highHrTop10HitRate: ${metrics.environmentMetrics.highHrTop10HitRate.toFixed(4)}`,
    `  predictedLowHrTop10HitRate: ${metrics.environmentMetrics.predictedLowHrTop10HitRate.toFixed(4)}`,
    `  predictedMediumHrTop10HitRate: ${metrics.environmentMetrics.predictedMediumHrTop10HitRate.toFixed(4)}`,
    `  predictedHighHrTop10HitRate: ${metrics.environmentMetrics.predictedHighHrTop10HitRate.toFixed(4)}`,
    `  top25PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.top25.toFixed(4)}`,
    `  middle50PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.middle50.toFixed(4)}`,
    `  bottom25PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.bottom25.toFixed(4)}`,
    `  top20PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.top20.toFixed(4)}`,
    `  bottom20PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.bottom20.toFixed(4)}`,
    `  top10PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.top10.toFixed(4)}`,
    `  bottom10PredictedEnvTop10HitRate: ${metrics.environmentMetrics.percentileHitRates.bottom10.toFixed(4)}`,
  ];

  return lines.join('\n');
}

function formatSlateRow(slate: HRBacktestSlateSummary) {
  return [
    `  ${slate.gameDate}`,
    `predictions=${slate.predictionCount}`,
    `totalActualHRs=${slate.totalActualHRs}`,
    `actualEnv=${slate.actualEnvironmentLabel}`,
    `predictedEnv=${slate.predictedEnvironmentLabel}`,
    `top5Hits=${slate.top5HitCount}`,
    `top5HitRate=${slate.top5HitRate.toFixed(4)}`,
    `top5AvgProb=${slate.top5AveragePredictedProbability.toFixed(4)}`,
    `top10Hits=${slate.top10HitCount}`,
    `top10HitRate=${slate.top10HitRate.toFixed(4)}`,
    `top10AvgProb=${slate.top10AveragePredictedProbability.toFixed(4)}`,
    `avgParkHrFactor=${slate.averageParkHrFactor.toFixed(4)}`,
    `avgWeatherHrImpact=${slate.averageWeatherHrImpactScore.toFixed(4)}`,
    `avgPitcherHr9=${slate.averagePitcherHr9.toFixed(4)}`,
    `avgSeasonHrPerGame=${slate.averageSeasonHrPerGame.toFixed(4)}`,
    `predictedHrEnvScore=${slate.predictedHrEnvironmentScore.toFixed(4)}`,
  ].join(' | ');
}

function formatStrategyRow(metrics: HRBacktestMetrics) {
  return metrics.strategyResults.map((strategy) =>
    [
      `  Strategy ${strategy.strategy}`,
      strategy.description,
      `hits=${strategy.totalHits}`,
      `bets=${strategy.totalBets}`,
      `hitRate=${strategy.hitRate.toFixed(4)}`,
      `roi=${strategy.roi.toFixed(4)}`,
    ].join(' | ')
  );
}

function formatVerificationResponseSummary(
  response:
    | {
        stage: 'events' | 'event_odds';
        targetDate: string;
        snapshotTimestamp: string;
        eventId?: string;
        responseTimestamp: string | null;
        eventCount?: number;
        bookmakerKeys?: string[];
        bookmakerTitles?: string[];
        filteredBookmakerKeys?: string[];
        filteredBookmakerTitles?: string[];
        marketKeys?: string[];
        filteredMarketKeys?: string[];
        bookmakerCount?: number;
        draftKingsBookmakerCount?: number;
        marketCount?: number;
        batterHomeRunsMarketCount?: number;
        batterHomeRunsPresent?: boolean;
        outcomeCount?: number;
        usableRecordCount?: number;
      }
) {
  if (response.stage === 'events') {
    return [
      `  [events]`,
      `snapshot=${response.snapshotTimestamp}`,
      `responseTimestamp=${response.responseTimestamp ?? 'n/a'}`,
      `eventCount=${response.eventCount ?? 0}`,
    ].join(' | ');
  }

  return [
    `  [event_odds]`,
    `snapshot=${response.snapshotTimestamp}`,
    `eventId=${response.eventId ?? 'n/a'}`,
    `responseTimestamp=${response.responseTimestamp ?? 'n/a'}`,
    `bookmakerKeys=${(response.bookmakerKeys ?? []).join(',') || 'none'}`,
    `filteredBookmakerKeys=${(response.filteredBookmakerKeys ?? []).join(',') || 'none'}`,
    `marketKeys=${(response.marketKeys ?? []).join(',') || 'none'}`,
    `filteredMarketKeys=${(response.filteredMarketKeys ?? []).join(',') || 'none'}`,
    `bookmakers=${response.bookmakerCount ?? 0}`,
    `draftKingsBookmakers=${response.draftKingsBookmakerCount ?? 0}`,
    `markets=${response.marketCount ?? 0}`,
    `batterHomeRunsPresent=${response.batterHomeRunsPresent ?? false}`,
    `batterHomeRunsMarkets=${response.batterHomeRunsMarketCount ?? 0}`,
    `outcomes=${response.outcomeCount ?? 0}`,
    `usableRecords=${response.usableRecordCount ?? 0}`,
  ].join(' | ');
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'));

  const [
    { fetchTrainingExamplesFromSnapshots },
    { runTimeSplitBacktestXGBoost },
    { createSlateEnvironmentBacktestContext, evaluateBacktestSlateSummaries },
    { runHistoricalOddsBacktestForTestSplit },
    { verifyHistoricalHROddsForSingleDate },
  ] =
    await Promise.all([
      import('@/services/hrTrainingSnapshotService'),
      import('@/services/ml/hrXGBoostModel'),
      import('@/services/ml/hrBacktest'),
      import('@/services/ml/hrOddsBacktest'),
      import('@/services/historicalHROddsService'),
    ]);

  const historicalOddsMode =
    (process.env.HR_HISTORICAL_ODDS_MODE as
      | 'dry_run'
      | 'capped_run'
      | 'full'
      | 'verify_single_date'
      | undefined) ?? 'dry_run';

  console.log('Loading HR training examples...');
  const examples = await fetchTrainingExamplesFromSnapshots({ minRows: 250 });
  console.log(`Loaded ${examples.length} labeled examples.\n`);

  console.log('Running XGBoost backtest with default settings...\n');
  const result = await runTimeSplitBacktestXGBoost(examples);

  console.log('Split Sizes');
  console.log(`  train: ${result.split.trainSize}`);
  console.log(`  calibration: ${result.split.calibrationSize}`);
  console.log(`  test: ${result.split.testSize}`);
  console.log('');

  console.log(formatMetricBlock('Train Metrics', result.trainMetrics));
  console.log('');
  console.log(formatMetricBlock('Calibration Metrics', result.calibrationMetrics));
  console.log('');
  console.log(formatMetricBlock('Test Metrics', result.testMetrics));
  console.log('');

  console.log('Strategy Backtest Summary');
  for (const row of formatStrategyRow(result.testMetrics)) {
    console.log(row);
  }
  console.log('');

  const slateEnvironmentContext = createSlateEnvironmentBacktestContext(result.trainPredictions);
  const testSlateSummaries = evaluateBacktestSlateSummaries(
    result.testPredictions,
    slateEnvironmentContext
  );
  const historicalOddsBacktest = await runHistoricalOddsBacktestForTestSplit({
    testPredictions: result.testPredictions,
    testSlateSummaries,
    sportsbooks: ['DraftKings'],
    mode:
      historicalOddsMode === 'verify_single_date'
        ? 'dry_run'
        : historicalOddsMode,
    maxUncachedDates: Number(process.env.HR_HISTORICAL_ODDS_MAX_DATES ?? 5),
    creditCap: Number(process.env.HR_HISTORICAL_ODDS_CREDIT_CAP ?? 500),
  });
  const historicalOddsUsage = Object.values(historicalOddsBacktest.cacheArtifacts).reduce(
    (summary, artifact) => ({
      historicalEventsCalls:
        summary.historicalEventsCalls + artifact.apiUsage.historicalEventsCalls,
      historicalEventOddsCalls:
        summary.historicalEventOddsCalls + artifact.apiUsage.historicalEventOddsCalls,
      totalApiCalls: summary.totalApiCalls + artifact.apiUsage.totalApiCalls,
      estimatedCredits: summary.estimatedCredits + artifact.apiUsage.estimatedCredits,
      cacheHits: summary.cacheHits + (artifact.apiUsage.cacheHit ? 1 : 0),
      fetchedDates: summary.fetchedDates + (artifact.apiUsage.cacheHit ? 0 : 1),
    }),
    {
      historicalEventsCalls: 0,
      historicalEventOddsCalls: 0,
      totalApiCalls: 0,
      estimatedCredits: 0,
      cacheHits: 0,
      fetchedDates: 0,
    }
  );

  console.log('Historical Odds Coverage');
  console.log(`  mode: ${historicalOddsBacktest.mode}`);
  console.log('  sportsbookFilter: DraftKings');
  console.log('  market: batter_home_runs');
  console.log(`  totalTestDates: ${historicalOddsBacktest.audit.totalTestDates}`);
  console.log(`  cachedTestDates: ${historicalOddsBacktest.audit.cachedTestDates}`);
  console.log(`  uncachedTestDates: ${historicalOddsBacktest.audit.uncachedTestDates}`);
  console.log(
    `  estimatedCreditsRequiredForUncachedDates: ${historicalOddsBacktest.audit.estimatedCreditsRequiredForUncachedDates.toFixed(2)}`
  );
  console.log(
    `  averageCreditsPerCompletedDate: ${historicalOddsBacktest.audit.averageCreditsPerCompletedDate.toFixed(2)}`
  );
  console.log(
    `  estimatedCreditsPerUncachedDate: ${historicalOddsBacktest.audit.estimatedCreditsPerUncachedDate.toFixed(2)}`
  );
  console.log(`  cachedDatesUsed: ${historicalOddsUsage.cacheHits}`);
  console.log(`  fetchedDates: ${historicalOddsUsage.fetchedDates}`);
  console.log(`  historicalEventsCalls: ${historicalOddsUsage.historicalEventsCalls}`);
  console.log(`  historicalEventOddsCalls: ${historicalOddsUsage.historicalEventOddsCalls}`);
  console.log(`  totalApiCalls: ${historicalOddsUsage.totalApiCalls}`);
  console.log(`  estimatedCredits: ${historicalOddsUsage.estimatedCredits}`);
  if (historicalOddsBacktest.mode !== 'dry_run') {
    console.log(`  totalRows: ${historicalOddsBacktest.coverage.totalRows}`);
    console.log(`  matchedRows: ${historicalOddsBacktest.coverage.matchedRows}`);
    console.log(`  unmatchedRows: ${historicalOddsBacktest.coverage.unmatchedRows}`);
    console.log(`  ambiguousRows: ${historicalOddsBacktest.coverage.ambiguousRows}`);
    console.log(`  matchRate: ${historicalOddsBacktest.coverage.matchRate.toFixed(4)}`);
  }
  for (const row of historicalOddsBacktest.progress) {
    console.log(
      `  ${row.gameDate} | cache=${row.cacheStatus} | requestsMade=${row.requestsMade} | estimatedCreditsUsedSoFar=${row.estimatedCreditsUsedSoFar.toFixed(2)} | matchedRows=${row.matchedRows}`
    );
  }
  console.log('');

  if (historicalOddsMode === 'verify_single_date') {
    const verifyDate = process.env.HR_HISTORICAL_ODDS_VERIFY_DATE;
    if (!verifyDate) {
      throw new Error(
        'HR_HISTORICAL_ODDS_VERIFY_DATE is required when HR_HISTORICAL_ODDS_MODE=verify_single_date.'
      );
    }

    console.log('Historical Odds Single-Date Verification');
    console.log(`  targetDate: ${verifyDate}`);
    console.log('  sportsbookFilter: DraftKings');
    console.log('  market: batter_home_runs');
    console.log('  writeCacheOnSuccessOnly: true');
    console.log('');

    const verification = await verifyHistoricalHROddsForSingleDate({
      targetDate: verifyDate,
      sportsbooks: ['DraftKings'],
      snapshotTimestamp: process.env.HR_HISTORICAL_ODDS_VERIFY_SNAPSHOT,
      writeCacheOnSuccess: true,
    });

    console.log('Verification Request Log');
    for (const request of verification.requestLogs) {
      console.log(
        [
          `  [${request.stage}]`,
          `date=${request.targetDate}`,
          `snapshot=${request.snapshotTimestamp}`,
          `eventId=${request.eventId ?? 'n/a'}`,
          `url=${request.url}`,
        ].join(' | ')
      );
    }
    console.log('');

    console.log('Verification Response Summary');
    for (const response of verification.responseLogs) {
      console.log(formatVerificationResponseSummary(response));
    }
    console.log('');

    console.log('Verification Result');
    console.log(`  records: ${verification.records.length}`);
    console.log(`  wroteCache: ${verification.wroteCache}`);
    console.log(`  abortedReason: ${verification.abortedReason ?? 'none'}`);
    console.log(`  historicalEventsCalls: ${verification.apiUsage.historicalEventsCalls}`);
    console.log(`  historicalEventOddsCalls: ${verification.apiUsage.historicalEventOddsCalls}`);
    console.log(`  totalApiCalls: ${verification.apiUsage.totalApiCalls}`);
    console.log(`  estimatedCredits: ${verification.apiUsage.estimatedCredits}`);
    console.log('');
  }

  if (historicalOddsBacktest.mode !== 'dry_run') {
    console.log('Historical Odds ROI Summary');
    for (const strategy of historicalOddsBacktest.strategyResults) {
      console.log(
        [
          `  Strategy ${strategy.strategy}`,
          `slateFilter=${strategy.slateFilter}`,
          strategy.description,
          `bets=${strategy.totalBets}`,
          `matchedOddsRows=${strategy.matchedOddsRows}`,
          `unmatchedSkipped=${strategy.unmatchedRowsSkipped}`,
          `hits=${strategy.totalHits}`,
          `hitRate=${strategy.hitRate.toFixed(4)}`,
          `averageOdds=${strategy.averageOdds == null ? 'n/a' : strategy.averageOdds.toFixed(2)}`,
          `profitUnits=${strategy.profitUnits.toFixed(4)}`,
          `roi=${strategy.roi.toFixed(4)}`,
        ].join(' | ')
      );
    }
    console.log('');
  }

  console.log('Best Test Slates');
  for (const slate of result.testMetrics.bestSlates) {
    console.log(formatSlateRow(slate));
  }
  console.log('');

  console.log('Worst Test Slates');
  for (const slate of result.testMetrics.worstSlates) {
    console.log(formatSlateRow(slate));
  }
  console.log('');

  const mostRecentTestDate = [...result.testPredictions]
    .map((prediction) => prediction.gameDate)
    .sort((left, right) => left.localeCompare(right))
    .at(-1);

  const top10TestPredictions = result.testPredictions
    .filter((prediction) => prediction.gameDate === mostRecentTestDate)
    .sort((a, b) => b.predictedProbability - a.predictedProbability)
    .slice(0, 10);

  console.log(`Top 10 Test Predictions For Most Recent Test Date (${mostRecentTestDate ?? 'n/a'})`);
  for (const prediction of top10TestPredictions) {
    console.log(
      `  ${prediction.batterName} | predictedProbability=${prediction.predictedProbability.toFixed(4)} | actualLabel=${prediction.actualLabel}`
    );
  }
}

main().catch((error) => {
  console.error('XGBoost backtest run failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
