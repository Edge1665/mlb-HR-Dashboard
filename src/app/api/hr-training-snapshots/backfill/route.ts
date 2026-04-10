import { NextRequest, NextResponse } from 'next/server';
import * as snapshotService from '@/services/hrTrainingSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}

function formatDateUTC(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDateRange(start: string, end: string): string[] {
  const startParts = parseDateParts(start);
  const endParts = parseDateParts(end);

  const current = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const endDate = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));

  const dates: string[] = [];

  while (current.getTime() <= endDate.getTime()) {
    dates.push(formatDateUTC(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate required (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (typeof snapshotService.saveSnapshotsForDate !== 'function') {
      return NextResponse.json(
        {
          error: 'saveSnapshotsForDate export is missing from hrTrainingSnapshotService.ts',
        },
        { status: 500 }
      );
    }

    const dates = getDateRange(startDate, endDate);
    const results: Array<{
      date: string;
      saved: number;
      updated: number;
      positives: number;
    }> = [];

    for (const date of dates) {
      console.log(`[backfill] Processing ${date}`);

      const saveResult = await snapshotService.saveSnapshotsForDate(date);
      const syncResult = await snapshotService.syncSnapshotOutcomesForDate(date);

      results.push({
        date,
        saved: saveResult.savedCount,
        updated: syncResult.updatedCount,
        positives: syncResult.positiveCount,
      });
    }

    return NextResponse.json({
      success: true,
      totalDays: dates.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backfill failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}