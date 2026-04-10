import {
  saveSnapshotsForDate,
  syncSnapshotOutcomesForDate,
} from '@/services/hrTrainingSnapshotService';
import { trainAndSaveHRModelArtifact } from '@/services/hrModelArtifactService';
import { scoreBoardSnapshotsForDate } from '@/services/hrBoardSnapshotService';
import {
  DEFAULT_SEASON_SAMPLE_WEIGHTS,
  normalizeSeasonSampleWeights,
  type SeasonSampleWeights,
} from '@/services/ml/hrSeasonWeights';

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(date);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return formatDateInTimeZone(utcDate, 'UTC');
}

export function getYesterdayETDateString(): string {
  const now = new Date();
  const todayEt = formatDateInTimeZone(now, 'America/New_York');
  return addDays(todayEt, -1);
}

export interface DailyRefreshOptions {
  snapshotDate?: string;
  trainingStartDate?: string;
  trainingEndDate?: string;
  seasonSampleWeights?: SeasonSampleWeights;
}

export interface DailyRefreshResult {
  ok: boolean;
  snapshotDate: string;
  trainingStartDate: string;
  trainingEndDate: string;
  seasonSampleWeights: SeasonSampleWeights;
  snapshotSave: {
    success: boolean;
    savedCount: number;
    error?: string;
  };
  outcomeSync: {
    success: boolean;
    updatedCount: number;
    missingCount: number;
    positiveCount: number;
    error?: string;
  };
  artifact?: {
    trainedAt: string;
    trainingExampleCount: number;
    featureCount: number;
    trainingStartDate: string;
    trainingEndDate?: string;
    seasonSampleWeights: SeasonSampleWeights;
  };
  scoring?: {
    date: string;
    snapshotCount: number;
    scoredSnapshots: Array<{
      snapshotId: string;
      boardType: 'model' | 'best' | 'edge';
      lineupMode: 'confirmed' | 'all';
      top5Hits: number;
      top10Hits: number;
    }>;
  };
}

export async function runDailyRefresh(
  options?: DailyRefreshOptions
): Promise<DailyRefreshResult> {
  const snapshotDate = options?.snapshotDate ?? getYesterdayETDateString();
  const trainingStartDate = options?.trainingStartDate ?? '2024-03-28';
  const trainingEndDate = options?.trainingEndDate ?? snapshotDate;
  const seasonSampleWeights = normalizeSeasonSampleWeights(
    options?.seasonSampleWeights ?? DEFAULT_SEASON_SAMPLE_WEIGHTS
  );

  const snapshotSave = await saveSnapshotsForDate(snapshotDate);
  const outcomeSync = await syncSnapshotOutcomesForDate(snapshotDate);

  if (!snapshotSave.success || !outcomeSync.success) {
    return {
      ok: false,
      snapshotDate,
      trainingStartDate,
      trainingEndDate,
      seasonSampleWeights,
      snapshotSave,
      outcomeSync: {
        success: outcomeSync.success,
        updatedCount: outcomeSync.updatedCount,
        missingCount: outcomeSync.missingCount,
        positiveCount: outcomeSync.positiveCount,
        error: outcomeSync.error,
      },
    };
  }

  const scoring = await scoreBoardSnapshotsForDate(snapshotDate);

  const { artifact } = await trainAndSaveHRModelArtifact({
    trainingStartDate,
    trainingEndDate,
    seasonSampleWeights,
    minRows: 500,
  });

  return {
    ok: true,
    snapshotDate,
    trainingStartDate,
    trainingEndDate,
    seasonSampleWeights,
    snapshotSave,
    outcomeSync: {
      success: outcomeSync.success,
      updatedCount: outcomeSync.updatedCount,
      missingCount: outcomeSync.missingCount,
      positiveCount: outcomeSync.positiveCount,
    },
    artifact: {
      trainedAt: artifact.trainedAt,
      trainingExampleCount: artifact.trainingExampleCount,
      featureCount: artifact.featureNames.length,
      trainingStartDate: artifact.trainingStartDate,
      trainingEndDate: artifact.trainingEndDate,
      seasonSampleWeights: artifact.seasonSampleWeights,
    },
    scoring,
  };
}
