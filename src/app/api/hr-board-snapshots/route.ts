import { NextResponse } from 'next/server';
import {
  fetchBoardSnapshotDetails,
  fetchBoardSnapshotHistory,
  fetchBoardSnapshotValidationData,
  saveCustomBoardSnapshot,
  saveOfficialBoardSnapshot,
  softDeleteBoardSnapshot,
  scoreBoardSnapshotsForDate,
} from '@/services/hrBoardSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshotId = url.searchParams.get('snapshotId');
    const date = url.searchParams.get('date') ?? undefined;
    const view = url.searchParams.get('view');
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

    if (snapshotId) {
      const detail = await fetchBoardSnapshotDetails(snapshotId, { includeDeleted });
      return NextResponse.json({ ok: true, ...detail });
    }

    if (view === 'validation') {
      const snapshots = await fetchBoardSnapshotValidationData(date, { includeDeleted });
      return NextResponse.json({ ok: true, snapshots });
    }

    const snapshots = await fetchBoardSnapshotHistory(date, { includeDeleted });
    return NextResponse.json({ ok: true, snapshots });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch board snapshots';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const snapshotId = url.searchParams.get('snapshotId');

    if (!snapshotId) {
      return NextResponse.json(
        { ok: false, error: 'snapshotId is required.' },
        { status: 400 }
      );
    }

    const result = await softDeleteBoardSnapshot(snapshotId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to delete board snapshot';

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

    if (action === 'save_dashboard_snapshot') {
      if (typeof body?.targetDate !== 'string') {
        return NextResponse.json(
          { ok: false, error: 'targetDate is required.' },
          { status: 400 }
        );
      }

      if (!Array.isArray(body?.rows)) {
        return NextResponse.json(
          { ok: false, error: 'rows array is required.' },
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
        body?.lineupMode === 'confirmed'
          ? 'confirmed'
          : body?.lineupMode === 'all'
            ? 'all'
            : undefined;

      if (!lineupMode) {
        return NextResponse.json(
          { ok: false, error: 'lineupMode is required.' },
          { status: 400 }
        );
      }

      const snapshotType = body?.snapshotType === 'full' ? 'full' : 'filtered';
      const filteringApplied =
        typeof body?.filteringApplied === 'boolean'
          ? body.filteringApplied
          : snapshotType === 'filtered';
      const snapshotKind =
        body?.snapshotKind === 'dashboard_full_model'
          ? 'dashboard_full_model'
          : 'dashboard_filtered';

      const result = await saveCustomBoardSnapshot({
        targetDate: body.targetDate,
        sortMode,
        lineupMode,
        snapshotKind,
        snapshotType,
        filteringApplied,
        rows: body.rows,
        generatedAt:
          typeof body?.generatedAt === 'string' ? body.generatedAt : undefined,
        trainingStartDate:
          typeof body?.trainingStartDate === 'string'
            ? body.trainingStartDate
            : undefined,
        trainingExampleCount:
          typeof body?.trainingExampleCount === 'number' &&
          Number.isFinite(body.trainingExampleCount)
            ? body.trainingExampleCount
            : undefined,
        modelTrainedAt:
          typeof body?.modelTrainedAt === 'string' ? body.modelTrainedAt : undefined,
        diagnostics:
          body?.diagnostics && typeof body.diagnostics === 'object'
            ? body.diagnostics
            : undefined,
      });

      console.info('[hr-board-snapshots] Saved dashboard snapshot via API', {
        snapshotType,
        rowCount: body.rows.length,
        filteringApplied,
        snapshotKind,
        boardType: sortMode,
        lineupMode,
        targetDate: body.targetDate,
      });

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
      snapshotType: body?.snapshotType === 'full' ? 'full' : 'filtered',
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
