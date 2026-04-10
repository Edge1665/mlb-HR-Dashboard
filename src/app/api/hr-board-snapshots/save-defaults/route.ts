import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { saveOfficialBoardSnapshot } from '@/services/hrBoardSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildSnapshotNoteContent(params: {
  targetDate: string;
  capturedAt: string;
  sportsbooks: string[];
  saved: Array<{
    boardType: 'model' | 'best';
    snapshot: {
      lineupMode: string;
    };
    rows: Array<{
      rank: number;
      batterName: string;
    }>;
  }>;
}) {
  const capturedAtLabel = new Date(params.capturedAt).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const lines: string[] = [
    'HR Board Snapshot Note',
    `Snapshot date: ${params.targetDate}`,
    `Captured at: ${capturedAtLabel}`,
    `Sportsbooks: ${params.sportsbooks.length > 0 ? params.sportsbooks.join(', ') : 'Default board pricing'}`,
    '',
  ];

  for (const board of params.saved) {
    lines.push(
      `${board.boardType.toUpperCase()} BOARD (${board.snapshot.lineupMode.toUpperCase()} LINEUP MODE)`
    );

    for (const row of board.rows) {
      lines.push(`${row.rank}. ${row.batterName}`);
    }

    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetDate =
      typeof body?.targetDate === 'string'
        ? body.targetDate
        : new Date().toISOString().slice(0, 10);
    const trainingStartDate =
      typeof body?.trainingStartDate === 'string'
        ? body.trainingStartDate
        : undefined;
    const limit =
      typeof body?.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : 10;
    const sportsbooks = Array.isArray(body?.sportsbooks)
      ? body.sportsbooks
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
      : undefined;

    const [model, best] = await Promise.all([
      saveOfficialBoardSnapshot({
        targetDate,
        sortMode: 'model',
        limit,
        trainingStartDate,
        sportsbooks,
      }),
      saveOfficialBoardSnapshot({
        targetDate,
        sortMode: 'best',
        limit,
        trainingStartDate,
        sportsbooks,
      }),
    ]);

    const capturedAt = new Date().toISOString();
    const notesDirectory = path.join(process.cwd(), 'output', 'board-snapshot-notes');
    await mkdir(notesDirectory, { recursive: true });

    const safeTimestamp = capturedAt.replace(/[:.]/g, '-');
    const noteFileName = `hr-board-snapshot-${targetDate}-${safeTimestamp}.txt`;
    const notePath = path.join(notesDirectory, noteFileName);
    const savedBoards = [
      {
        boardType: 'model' as const,
        snapshot: model.snapshot,
        rows: model.rows,
      },
      {
        boardType: 'best' as const,
        snapshot: best.snapshot,
        rows: best.rows,
      },
    ];

    await writeFile(
      notePath,
      buildSnapshotNoteContent({
        targetDate,
        capturedAt,
        sportsbooks: sportsbooks ?? [],
        saved: savedBoards,
      }),
      'utf8'
    );

    return NextResponse.json({
      ok: true,
      targetDate,
      noteFileName,
      notePath,
      saved: [
        { boardType: 'model', snapshot: model.snapshot, rowsSaved: model.rows.length },
        { boardType: 'best', snapshot: best.snapshot, rowsSaved: best.rows.length },
      ],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to save default board snapshots';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
