import { NextRequest, NextResponse } from 'next/server';
import { syncSnapshotOutcomesForDate } from '@/services/hrTrainingSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = body?.date;

    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'date is required in YYYY-MM-DD format' }, { status: 400 });
    }

    const result = await syncSnapshotOutcomesForDate(date);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed syncing outcomes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}