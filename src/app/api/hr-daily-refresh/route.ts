import { NextRequest, NextResponse } from 'next/server';
import { runDailyRefresh } from '@/services/hrDailyRefreshService';
import { parseSeasonSampleWeights } from '@/services/ml/hrSeasonWeights';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const snapshotDate =
      typeof body?.snapshotDate === 'string' ? body.snapshotDate : undefined;
    const trainingStartDate =
      typeof body?.trainingStartDate === 'string'
        ? body.trainingStartDate
        : undefined;
    const trainingEndDate =
      typeof body?.trainingEndDate === 'string' ? body.trainingEndDate : undefined;
    const seasonSampleWeights = parseSeasonSampleWeights(body?.seasonSampleWeights);

    const result = await runDailyRefresh({
      snapshotDate,
      trainingStartDate,
      trainingEndDate,
      seasonSampleWeights,
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Daily refresh failed';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
