import { NextResponse } from 'next/server';
import {
  fetchBoardSnapshotDetails,
  fetchBoardSnapshotHistory,
  saveOfficialBoardSnapshot,
  scoreBoardSnapshotsForDate,
} from '@/services/hrBoardSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshotId = url.searchParams.get('snapshotId');
    const date = url.searchParams.get('date') ?? undefined;

    if (snapshotId) {
      const detail = await fetchBoardSnapshotDetails(snapshotId);
      return NextResponse.json({ ok: true, ...detail });
    }

    const snapshots = await fetchBoardSnapshotHistory(date);
    return NextResponse.json({ ok: true, snapshots });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch board snapshots';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'score') {
      if (typeof body?.date !== 'string') {
        return NextResponse.json(
          { ok: false, error: 'date is required for score action.' },
          { status: 400 }
        );
      }

      const result = await scoreBoardSnapshotsForDate(body.date);
      return NextResponse.json({ ok: true, ...result });
    }

    if (typeof body?.targetDate !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'targetDate is required.' },
        { status: 400 }
      );
    }

    const sortMode =
      body?.sortMode === 'edge'
        ? 'edge'
        : body?.sortMode === 'best'
          ? 'best'
          : 'model';
    const lineupMode =
      body?.lineupMode === 'all'
        ? 'all'
        : body?.lineupMode === 'confirmed'
          ? 'confirmed'
          : undefined;
    const limit =
      typeof body?.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : undefined;
    const trainingStartDate =
      typeof body?.trainingStartDate === 'string'
        ? body.trainingStartDate
        : undefined;

    const result = await saveOfficialBoardSnapshot({
      targetDate: body.targetDate,
      sortMode,
      lineupMode,
      limit,
      trainingStartDate,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to save board snapshot';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
