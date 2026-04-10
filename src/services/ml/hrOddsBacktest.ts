import type { HistoricalHROddsCacheArtifact, HistoricalHROddsRecord } from '@/services/historicalHROddsService';
import {
  loadHistoricalHROddsForDate,
  readHistoricalHROddsCacheForDate,
} from '@/services/historicalHROddsService';
import {
  matchHistoricalOddsPlayerByName,
  type HistoricalOddsMatchCandidate,
} from '@/services/historicalOddsMatcher';
import { getSlatePercentileGroups } from '@/services/ml/hrBacktest';
import type { HRBacktestSlateSummary, HRPredictionWithLabel } from './types';

export interface JoinedHistoricalOddsPrediction extends HRPredictionWithLabel {
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  edge: number | null;
  sportsbook: string | null;
  marketTimestamp: string | null;
  oddsMatchStatus: 'matched' | 'unmatched' | 'ambiguous';
}

export interface HistoricalOddsCoverageByDate {
  gameDate: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  matchRate: number;
}

export interface HistoricalOddsCoverageSummary {
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  matchRate: number;
  byDate: HistoricalOddsCoverageByDate[];
  unmatchedSamples: Array<{
    gameDate: string;
    batterName: string;
    status: 'unmatched' | 'ambiguous';
  }>;
}

export interface HROddsStrategyResult {
  strategy: 'D' | 'E' | 'F';
  slateFilter: 'all' | 'top20_only';
  description: string;
  totalBets: number;
  matchedOddsRows: number;
  unmatchedRowsSkipped: number;
  totalHits: number;
  hitRate: number;
  averageOdds: number | null;
  profitUnits: number;
  roi: number;
}

export interface HistoricalOddsBacktestSummary {
  cacheArtifacts: Record<string, HistoricalHROddsCacheArtifact>;
  joinedPredictions: JoinedHistoricalOddsPrediction[];
  coverage: HistoricalOddsCoverageSummary;
  strategyResults: HROddsStrategyResult[];
  audit: HistoricalOddsAuditSummary;
  progress: HistoricalOddsRunProgress[];
  mode: 'dry_run' | 'capped_run' | 'full';
}

export interface HistoricalOddsAuditSummary {
  totalTestDates: number;
  cachedTestDates: number;
  uncachedTestDates: number;
  estimatedCreditsRequiredForUncachedDates: number;
  averageCreditsPerCompletedDate: number;
  estimatedCreditsPerUncachedDate: number;
  cachedDates: string[];
  uncachedDates: string[];
}

export interface HistoricalOddsRunProgress {
  gameDate: string;
  cacheStatus: 'hit' | 'miss' | 'skipped';
  requestsMade: number;
  estimatedCreditsUsedSoFar: number;
  matchedRows: number;
}

type HistoricalOddsCandidate = HistoricalHROddsRecord & HistoricalOddsMatchCandidate;

function payoutUnitsFromAmericanOdds(americanOdds: number): number {
  if (americanOdds > 0) {
    return americanOdds / 100;
  }

  return 100 / Math.abs(americanOdds);
}

function pickBestHistoricalOdds(records: HistoricalHROddsRecord[]): HistoricalHROddsRecord | null {
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => {
    const leftPayout = payoutUnitsFromAmericanOdds(left.americanOdds);
    const rightPayout = payoutUnitsFromAmericanOdds(right.americanOdds);
    return (
      rightPayout - leftPayout ||
      left.impliedProbability - right.impliedProbability ||
      left.playerName.localeCompare(right.playerName)
    );
  })[0] ?? null;
}

function buildHistoricalOddsIndex(
  artifacts: Record<string, HistoricalHROddsCacheArtifact>
): Record<string, HistoricalOddsCandidate[]> {
  return Object.fromEntries(
    Object.entries(artifacts).map(([gameDate, artifact]) => [
      gameDate,
      artifact.records.map((record) => ({
        ...record,
        playerNameKeys: record.playerNameKeys,
      })),
    ])
  );
}

export function joinHistoricalOddsToPredictions(options: {
  predictions: HRPredictionWithLabel[];
  oddsArtifacts: Record<string, HistoricalHROddsCacheArtifact>;
}): {
  joinedPredictions: JoinedHistoricalOddsPrediction[];
  coverage: HistoricalOddsCoverageSummary;
} {
  const oddsIndex = buildHistoricalOddsIndex(options.oddsArtifacts);
  const coverageByDate = new Map<string, HistoricalOddsCoverageByDate>();
  const unmatchedSamples: HistoricalOddsCoverageSummary['unmatchedSamples'] = [];

  const joinedPredictions = options.predictions.map((prediction) => {
    const dateCandidates = oddsIndex[prediction.gameDate] ?? [];
    const matchResult = matchHistoricalOddsPlayerByName(prediction.batterName, dateCandidates);
    const bestMatch =
      matchResult.status === 'matched' ? pickBestHistoricalOdds(matchResult.candidates) : null;

    const dateCoverage = coverageByDate.get(prediction.gameDate) ?? {
      gameDate: prediction.gameDate,
      totalRows: 0,
      matchedRows: 0,
      unmatchedRows: 0,
      ambiguousRows: 0,
      matchRate: 0,
    };
    dateCoverage.totalRows += 1;

    if (matchResult.status === 'matched' && bestMatch) {
      dateCoverage.matchedRows += 1;
    } else if (matchResult.status === 'ambiguous') {
      dateCoverage.ambiguousRows += 1;
    } else {
      dateCoverage.unmatchedRows += 1;
    }

    coverageByDate.set(prediction.gameDate, dateCoverage);

    if (matchResult.status !== 'matched' && unmatchedSamples.length < 25) {
      unmatchedSamples.push({
        gameDate: prediction.gameDate,
        batterName: prediction.batterName,
        status: matchResult.status,
      });
    }

    return {
      ...prediction,
      sportsbookOddsAmerican: bestMatch?.americanOdds ?? null,
      impliedProbability: bestMatch?.impliedProbability ?? null,
      edge:
        bestMatch?.impliedProbability != null
          ? prediction.predictedProbability - bestMatch.impliedProbability
          : null,
      sportsbook: bestMatch?.sportsbook ?? null,
      marketTimestamp: bestMatch?.marketTimestamp ?? null,
      oddsMatchStatus: matchResult.status,
    };
  });

  const byDate = Array.from(coverageByDate.values())
    .map((entry) => ({
      ...entry,
      matchRate: entry.totalRows === 0 ? 0 : entry.matchedRows / entry.totalRows,
    }))
    .sort((left, right) => left.gameDate.localeCompare(right.gameDate));
  const totalRows = byDate.reduce((sum, entry) => sum + entry.totalRows, 0);
  const matchedRows = byDate.reduce((sum, entry) => sum + entry.matchedRows, 0);
  const unmatchedRows = byDate.reduce((sum, entry) => sum + entry.unmatchedRows, 0);
  const ambiguousRows = byDate.reduce((sum, entry) => sum + entry.ambiguousRows, 0);

  return {
    joinedPredictions,
    coverage: {
      totalRows,
      matchedRows,
      unmatchedRows,
      ambiguousRows,
      matchRate: totalRows === 0 ? 0 : matchedRows / totalRows,
      byDate,
      unmatchedSamples,
    },
  };
}

function summarizeOddsStrategy(options: {
  strategy: 'D' | 'E' | 'F';
  slateFilter: 'all' | 'top20_only';
  description: string;
  candidateRows: JoinedHistoricalOddsPrediction[];
  selectedRows: JoinedHistoricalOddsPrediction[];
}): HROddsStrategyResult {
  const totalBets = options.selectedRows.length;
  const totalHits = options.selectedRows.reduce((sum, row) => sum + row.actualLabel, 0);
  const profitUnits = options.selectedRows.reduce((sum, row) => {
    if (row.actualLabel === 1 && row.sportsbookOddsAmerican != null) {
      return sum + payoutUnitsFromAmericanOdds(row.sportsbookOddsAmerican);
    }

    return sum - 1;
  }, 0);

  return {
    strategy: options.strategy,
    slateFilter: options.slateFilter,
    description: options.description,
    totalBets,
    matchedOddsRows: options.candidateRows.filter((row) => row.oddsMatchStatus === 'matched').length,
    unmatchedRowsSkipped: options.candidateRows.filter((row) => row.oddsMatchStatus !== 'matched').length,
    totalHits,
    hitRate: totalBets === 0 ? 0 : totalHits / totalBets,
    averageOdds:
      totalBets === 0
        ? null
        : options.selectedRows.reduce((sum, row) => sum + (row.sportsbookOddsAmerican ?? 0), 0) /
          totalBets,
    profitUnits,
    roi: totalBets === 0 ? 0 : profitUnits / totalBets,
  };
}

function runOddsStrategiesForUniverse(options: {
  joinedPredictions: JoinedHistoricalOddsPrediction[];
  applicableDates: Set<string>;
  slateFilter: 'all' | 'top20_only';
}): HROddsStrategyResult[] {
  const byDate = new Map<string, JoinedHistoricalOddsPrediction[]>();

  for (const row of options.joinedPredictions) {
    if (!options.applicableDates.has(row.gameDate)) {
      continue;
    }

    const current = byDate.get(row.gameDate) ?? [];
    current.push(row);
    byDate.set(row.gameDate, current);
  }

  const strategyDCandidates: JoinedHistoricalOddsPrediction[] = [];
  const allApplicableRows: JoinedHistoricalOddsPrediction[] = [];

  for (const rows of byDate.values()) {
    const rankedRows = [...rows].sort(
      (left, right) => right.predictedProbability - left.predictedProbability
    );
    strategyDCandidates.push(...rankedRows.slice(0, 10));
    allApplicableRows.push(...rankedRows);
  }

  const matchedTop10Rows = strategyDCandidates.filter(
    (row) => row.oddsMatchStatus === 'matched' && row.edge != null
  );
  const matchedAllRows = allApplicableRows.filter(
    (row) => row.oddsMatchStatus === 'matched' && row.edge != null
  );

  return [
    summarizeOddsStrategy({
      strategy: 'D',
      slateFilter: options.slateFilter,
      description:
        options.slateFilter === 'top20_only'
          ? 'Bet top 10 players with edge > 0 on top-20% slates only'
          : 'Bet top 10 players with edge > 0 on all slates',
      candidateRows: strategyDCandidates,
      selectedRows: matchedTop10Rows.filter((row) => (row.edge ?? -Infinity) > 0),
    }),
    summarizeOddsStrategy({
      strategy: 'E',
      slateFilter: options.slateFilter,
      description:
        options.slateFilter === 'top20_only'
          ? 'Bet all players with edge > 0.05 on top-20% slates only'
          : 'Bet all players with edge > 0.05 on all slates',
      candidateRows: allApplicableRows,
      selectedRows: matchedAllRows.filter((row) => (row.edge ?? -Infinity) > 0.05),
    }),
    summarizeOddsStrategy({
      strategy: 'F',
      slateFilter: options.slateFilter,
      description:
        options.slateFilter === 'top20_only'
          ? 'Bet all players with edge > 0.10 on top-20% slates only'
          : 'Bet all players with edge > 0.10 on all slates',
      candidateRows: allApplicableRows,
      selectedRows: matchedAllRows.filter((row) => (row.edge ?? -Infinity) > 0.1),
    }),
  ];
}

export async function runHistoricalOddsBacktestForTestSplit(options: {
  testPredictions: HRPredictionWithLabel[];
  testSlateSummaries: HRBacktestSlateSummary[];
  sportsbooks?: string[];
  forceRefresh?: boolean;
  mode?: 'dry_run' | 'capped_run' | 'full';
  maxUncachedDates?: number;
  creditCap?: number;
}): Promise<HistoricalOddsBacktestSummary> {
  const targetDates = Array.from(new Set(options.testPredictions.map((row) => row.gameDate))).sort();
  const sportsbooks = options.sportsbooks;
  const cachedArtifacts: Record<string, HistoricalHROddsCacheArtifact> = {};
  const uncachedDates: string[] = [];

  for (const targetDate of targetDates) {
    const cached = await readHistoricalHROddsCacheForDate({
      targetDate,
      sportsbooks,
    });

    if (cached) {
      cachedArtifacts[targetDate] = cached;
    } else {
      uncachedDates.push(targetDate);
    }
  }

  const completedArtifacts = Object.values(cachedArtifacts);
  const averageCreditsPerCompletedDate =
    completedArtifacts.length === 0
      ? options.testSlateSummaries.reduce(
          (sum, slate) => sum + (slate.estimatedGameCount + 1),
          0
        ) / Math.max(1, options.testSlateSummaries.length)
      : completedArtifacts.reduce((sum, artifact) => sum + artifact.apiUsage.estimatedCredits, 0) /
        completedArtifacts.length;
  const audit: HistoricalOddsAuditSummary = {
    totalTestDates: targetDates.length,
    cachedTestDates: completedArtifacts.length,
    uncachedTestDates: uncachedDates.length,
    estimatedCreditsRequiredForUncachedDates:
      uncachedDates.length * averageCreditsPerCompletedDate,
    averageCreditsPerCompletedDate,
    estimatedCreditsPerUncachedDate: averageCreditsPerCompletedDate,
    cachedDates: Object.keys(cachedArtifacts).sort(),
    uncachedDates,
  };
  const mode = options.mode ?? 'dry_run';
  const progress: HistoricalOddsRunProgress[] = [];

  if (mode === 'dry_run') {
    return {
      cacheArtifacts: cachedArtifacts,
      joinedPredictions: [],
      coverage: {
        totalRows: options.testPredictions.length,
        matchedRows: 0,
        unmatchedRows: options.testPredictions.length,
        ambiguousRows: 0,
        matchRate: 0,
        byDate: targetDates.map((gameDate) => ({
          gameDate,
          totalRows: options.testPredictions.filter((row) => row.gameDate === gameDate).length,
          matchedRows: 0,
          unmatchedRows: options.testPredictions.filter((row) => row.gameDate === gameDate).length,
          ambiguousRows: 0,
          matchRate: 0,
        })),
        unmatchedSamples: [],
      },
      strategyResults: [],
      audit,
      progress,
      mode,
    };
  }

  const creditCap = options.creditCap ?? 500;
  const fetchDates =
    mode === 'capped_run'
      ? [...uncachedDates].sort((left, right) => right.localeCompare(left)).slice(
          0,
          options.maxUncachedDates ?? 5
        )
      : uncachedDates;

  const estimatedAdditionalCredits =
    fetchDates.length * averageCreditsPerCompletedDate;
  if (mode === 'capped_run' && estimatedAdditionalCredits > creditCap) {
    return {
      cacheArtifacts: cachedArtifacts,
      joinedPredictions: [],
      coverage: {
        totalRows: options.testPredictions.length,
        matchedRows: 0,
        unmatchedRows: options.testPredictions.length,
        ambiguousRows: 0,
        matchRate: 0,
        byDate: [],
        unmatchedSamples: [],
      },
      strategyResults: [],
      audit,
      progress: fetchDates.map((gameDate) => ({
        gameDate,
        cacheStatus: 'skipped',
        requestsMade: 0,
        estimatedCreditsUsedSoFar: 0,
        matchedRows: 0,
      })),
      mode,
    };
  }

  const cacheArtifacts: Record<string, HistoricalHROddsCacheArtifact> = { ...cachedArtifacts };
  let estimatedCreditsUsedSoFar = 0;

  for (const targetDate of fetchDates) {
    const artifact = await loadHistoricalHROddsForDate({
      targetDate,
      sportsbooks,
      forceRefresh: options.forceRefresh,
    });
    cacheArtifacts[targetDate] = artifact;
    estimatedCreditsUsedSoFar += artifact.apiUsage.estimatedCredits;

    const datePredictions = options.testPredictions.filter((row) => row.gameDate === targetDate);
    const dateJoin = joinHistoricalOddsToPredictions({
      predictions: datePredictions,
      oddsArtifacts: { [targetDate]: artifact },
    });

    progress.push({
      gameDate: targetDate,
      cacheStatus: artifact.apiUsage.cacheHit ? 'hit' : 'miss',
      requestsMade: artifact.apiUsage.totalApiCalls,
      estimatedCreditsUsedSoFar,
      matchedRows: dateJoin.coverage.matchedRows,
    });
  }

  const { joinedPredictions, coverage } = joinHistoricalOddsToPredictions({
    predictions: options.testPredictions,
    oddsArtifacts: cacheArtifacts,
  });
  const percentileGroups = getSlatePercentileGroups(options.testSlateSummaries);
  const allDates = new Set(options.testSlateSummaries.map((slate) => slate.gameDate));
  const top20Dates = percentileGroups.top20;
  const strategyResults = [
    ...runOddsStrategiesForUniverse({
      joinedPredictions,
      applicableDates: allDates,
      slateFilter: 'all',
    }),
    ...runOddsStrategiesForUniverse({
      joinedPredictions,
      applicableDates: top20Dates,
      slateFilter: 'top20_only',
    }),
  ];

  return {
    cacheArtifacts,
    joinedPredictions,
    coverage,
    strategyResults,
    audit,
    progress,
    mode,
  };
}
