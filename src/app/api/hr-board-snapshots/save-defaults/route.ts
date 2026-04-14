import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import {
  saveOfficialBoardSnapshot,
  type OfficialSnapshotKind,
} from '@/services/hrBoardSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildSnapshotNoteContent(params: {
  targetDate: string;
  capturedAt: string;
  sportsbooks: string[];
  workflowLabel: string;
  saved: Array<{
    label: string;
    boardType: 'model' | 'best';
    snapshot: {
      lineupMode: string;
      snapshotKind: string;
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
    `Workflow: ${params.workflowLabel}`,
    `Sportsbooks: ${params.sportsbooks.length > 0 ? params.sportsbooks.join(', ') : 'Default board pricing'}`,
    '',
  ];

  for (const board of params.saved) {
    lines.push(
      `${board.label} (${board.snapshot.snapshotKind})`
    );

    for (const row of board.rows) {
      lines.push(`${row.rank}. ${row.batterName}`);
    }

    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

type SaveDefaultsBoardConfig = {
  label: 'model_all' | 'best_all' | 'model_confirmed' | 'best_confirmed';
  boardType: 'model' | 'best';
  lineupMode: 'all' | 'confirmed';
  snapshotKind: OfficialSnapshotKind;
};

type SnapshotWorkflow = 'all_variants' | 'morning_full_day' | 'pre_first_pitch';

const DEFAULT_SNAPSHOT_CONFIGS: readonly SaveDefaultsBoardConfig[] = [
  {
    label: 'model_all',
    boardType: 'model',
    lineupMode: 'all',
    snapshotKind: 'morning_full_day',
  },
  {
    label: 'best_all',
    boardType: 'best',
    lineupMode: 'all',
    snapshotKind: 'morning_full_day',
  },
  {
    label: 'model_confirmed',
    boardType: 'model',
    lineupMode: 'confirmed',
    snapshotKind: 'pre_first_pitch',
  },
  {
    label: 'best_confirmed',
    boardType: 'best',
    lineupMode: 'confirmed',
    snapshotKind: 'pre_first_pitch',
  },
] as const;

function getWorkflowConfigs(workflow: SnapshotWorkflow): readonly SaveDefaultsBoardConfig[] {
  if (workflow === 'morning_full_day') {
    return DEFAULT_SNAPSHOT_CONFIGS.filter((config) => config.snapshotKind === 'morning_full_day');
  }

  if (workflow === 'pre_first_pitch') {
    return DEFAULT_SNAPSHOT_CONFIGS.filter((config) => config.snapshotKind === 'pre_first_pitch');
  }

  return DEFAULT_SNAPSHOT_CONFIGS;
}

function getWorkflowLabel(workflow: SnapshotWorkflow): string {
  if (workflow === 'morning_full_day') return 'Morning Full-Day Snapshot';
  if (workflow === 'pre_first_pitch') return 'Pre-First-Pitch Snapshot';
  return 'All Official Snapshot Variants';
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
    const workflow: SnapshotWorkflow =
      body?.workflow === 'morning_full_day' || body?.workflow === 'pre_first_pitch'
        ? body.workflow
        : 'all_variants';
    const limit =
      typeof body?.limit === 'number' && Number.isFinite(body.limit)
        ? body.limit
        : 25;
    const sportsbooks = Array.isArray(body?.sportsbooks)
      ? body.sportsbooks
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
      : undefined;

    const savedBoards = await Promise.all(
      getWorkflowConfigs(workflow).map(async (config) => {
        const saved = await saveOfficialBoardSnapshot({
          targetDate,
          sortMode: config.boardType,
          lineupMode: config.lineupMode,
          snapshotKind: config.snapshotKind,
          limit,
          trainingStartDate,
          sportsbooks,
        });

        return {
          label: config.label,
          boardType: config.boardType,
          snapshot: saved.snapshot,
          rows: saved.rows,
        };
      })
    );

    const capturedAt = new Date().toISOString();
    const notesDirectory = path.join(process.cwd(), 'output', 'board-snapshot-notes');
    await mkdir(notesDirectory, { recursive: true });

    const safeTimestamp = capturedAt.replace(/[:.]/g, '-');
    const noteFileName = `hr-board-snapshot-${targetDate}-${safeTimestamp}.txt`;
    const notePath = path.join(notesDirectory, noteFileName);
    await writeFile(
      notePath,
      buildSnapshotNoteContent({
        targetDate,
        capturedAt,
        workflowLabel: getWorkflowLabel(workflow),
        sportsbooks: sportsbooks ?? [],
        saved: savedBoards,
      }),
      'utf8'
    );

    return NextResponse.json({
      ok: true,
      targetDate,
      workflow,
      noteFileName,
      notePath,
      saved: savedBoards.map((board) => ({
        label: board.label,
        boardType: board.boardType,
        snapshot: board.snapshot,
        rowsSaved: board.rows.length,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to save default board snapshots';

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
