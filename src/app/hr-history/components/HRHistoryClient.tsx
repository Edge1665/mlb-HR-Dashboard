'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Target,
  Trophy,
} from 'lucide-react';
import {
  formatProbabilityPercent,
  getDisplayedHrProbability,
  HR_CHANCE_INFO_TEXT,
  HR_CHANCE_LABEL,
} from '@/services/hrChanceDisplay';
import { getTeamAbbreviation } from '@/services/mlbTeamMetadata';

type BoardType = 'model' | 'best' | 'edge';
type LineupMode = 'confirmed' | 'all';

type SnapshotSummary = {
  id: string;
  snapshotDate: string;
  boardType: BoardType;
  lineupMode: LineupMode;
  snapshotKind: string;
  capturedAt: string;
  generatedAt: string | null;
  trainingStartDate: string | null;
  trainingExampleCount: number | null;
  modelTrainedAt: string | null;
  rowLimit: number;
  top5Hits: number | null;
  top10Hits: number | null;
  scoredAt: string | null;
};

type SnapshotRow = {
  rank: number;
  batterId: string;
  batterName: string;
  teamId: string;
  opponentTeamId: string;
  gameId: string;
  displayedHrProbability?: number | null;
  predictedProbability: number;
  tier: string;
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  edge: number | null;
  combinedScore: number | null;
  sportsbook: string | null;
  lineupConfirmed: boolean;
  actualHitHr: boolean | null;
  actualHrCount: number;
};

type SnapshotDetailResponse = {
  ok: true;
  snapshot: SnapshotSummary;
  rows: SnapshotRow[];
};

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatCapturedAt(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEdgePercent(value: number | null): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatBoardLabel(boardType: BoardType): string {
  if (boardType === 'best') return 'Best';
  if (boardType === 'edge') return 'Edge';
  return 'Model';
}

function formatLineupLabel(lineupMode: LineupMode): string {
  return lineupMode === 'confirmed' ? 'Confirmed' : 'All';
}

function formatSnapshotKindLabel(snapshotKind: string): string {
  if (snapshotKind === 'morning_full_day' || snapshotKind === 'official_early_full_day') {
    return 'Morning Full-Day';
  }

  if (snapshotKind === 'pre_first_pitch' || snapshotKind === 'official_lock_time') {
    return 'Pre-First-Pitch';
  }

  return 'Official';
}

function getSnapshotKindSortWeight(snapshotKind: string): number {
  if (snapshotKind === 'morning_full_day' || snapshotKind === 'official_early_full_day') {
    return 0;
  }

  if (snapshotKind === 'pre_first_pitch' || snapshotKind === 'official_lock_time') {
    return 1;
  }

  return 2;
}

function getTierClass(tier: string): string {
  if (tier === 'elite') return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  if (tier === 'high') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (tier === 'medium') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

function getOutcomeClass(hitHr: boolean | null): string {
  if (hitHr === true) return 'text-emerald-300';
  if (hitHr === false) return 'text-rose-300';
  return 'text-slate-400';
}

function getBoardSortWeight(boardType: BoardType): number {
  if (boardType === 'model') return 0;
  if (boardType === 'best') return 1;
  return 2;
}

export default function HRHistoryClient() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(true);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [snapshotDetail, setSnapshotDetail] = useState<SnapshotDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    async function loadSnapshots() {
      setLoadingSnapshots(true);
      try {
        const response = await fetch('/api/hr-board-snapshots', { cache: 'no-store' });
        const json = await response.json();
        setSnapshots((json.snapshots ?? []) as SnapshotSummary[]);
      } catch {
        setSnapshots([]);
      } finally {
        setLoadingSnapshots(false);
      }
    }

    loadSnapshots();
  }, []);

  const snapshotDates = useMemo(
    () => [...new Set(snapshots.map((snapshot) => snapshot.snapshotDate))].slice(0, 7),
    [snapshots]
  );

  const selectedDate = snapshotDates[selectedDateIndex] ?? null;

  const snapshotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return snapshots
      .filter((snapshot) => snapshot.snapshotDate === selectedDate)
      .sort((a, b) => {
        const boardWeightDiff =
          getBoardSortWeight(a.boardType) - getBoardSortWeight(b.boardType);
        if (boardWeightDiff !== 0) return boardWeightDiff;

        const snapshotKindDiff =
          getSnapshotKindSortWeight(a.snapshotKind) -
          getSnapshotKindSortWeight(b.snapshotKind);
        if (snapshotKindDiff !== 0) return snapshotKindDiff;

        return new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime();
      });
  }, [selectedDate, snapshots]);

  useEffect(() => {
    if (!selectedDate) {
      setSelectedSnapshotId(null);
      return;
    }

    const preferred =
      snapshotsForSelectedDate.find((snapshot) => snapshot.boardType === 'model') ??
      snapshotsForSelectedDate[0] ??
      null;

    setSelectedSnapshotId(preferred?.id ?? null);
  }, [selectedDate, snapshotsForSelectedDate]);

  useEffect(() => {
    if (!selectedSnapshotId) {
      setSnapshotDetail(null);
      return;
    }

    async function loadSnapshotDetail() {
      setLoadingDetail(true);
      try {
        const response = await fetch(
          `/api/hr-board-snapshots?snapshotId=${selectedSnapshotId}`,
          { cache: 'no-store' }
        );
        const json = (await response.json()) as SnapshotDetailResponse;
        setSnapshotDetail(json.ok ? json : null);
      } catch {
        setSnapshotDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    }

    loadSnapshotDetail();
  }, [selectedSnapshotId]);

  const selectedDateStats = useMemo(() => {
    const scored = snapshotsForSelectedDate.filter((snapshot) => snapshot.top10Hits != null);
    return {
      pendingCount: snapshotsForSelectedDate.length - scored.length,
      totalTop10Hits: scored.reduce((sum, snapshot) => sum + (snapshot.top10Hits ?? 0), 0),
      totalTop5Hits: scored.reduce((sum, snapshot) => sum + (snapshot.top5Hits ?? 0), 0),
    };
  }, [snapshotsForSelectedDate]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Official Board History</h1>
          <p className="mt-1 text-sm text-slate-400">
            Review the last 7 days of saved official boards and see which picks actually homered.
          </p>
        </div>
        <a
          href="/hr-daily-board"
          className="rounded-lg border border-surface-400 px-4 py-2 text-sm text-slate-200 hover:bg-surface-600"
        >
          Back To Board
        </a>
      </div>

      {loadingSnapshots ? (
        <div className="flex items-center gap-3 rounded-xl border border-surface-400 bg-surface-800 p-6">
          <Loader2 size={18} className="animate-spin text-brand-400" />
          <span className="text-sm text-slate-400">Loading snapshot history...</span>
        </div>
      ) : snapshotDates.length === 0 ? (
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-8 text-center">
          <Calendar size={36} className="mx-auto mb-3 text-slate-500" />
          <p className="text-base font-semibold text-slate-200">No official boards saved yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Save a board before first pitch with `npm run hr:save-official-board`.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setSelectedDateIndex((index) => Math.max(0, index - 1))}
                disabled={selectedDateIndex === 0}
                className="rounded-lg p-2 text-slate-400 hover:bg-surface-600 hover:text-slate-100 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex flex-1 flex-wrap justify-center gap-2">
                {snapshotDates.map((date, index) => (
                  <button
                    key={date}
                    onClick={() => setSelectedDateIndex(index)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      index === selectedDateIndex
                        ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
                        : 'text-slate-400 hover:bg-surface-600 hover:text-slate-100'
                    }`}
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>

              <button
                onClick={() =>
                  setSelectedDateIndex((index) => Math.min(snapshotDates.length - 1, index + 1))
                }
                disabled={selectedDateIndex === snapshotDates.length - 1}
                className="rounded-lg p-2 text-slate-400 hover:bg-surface-600 hover:text-slate-100 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
              <div className="flex items-center gap-3">
                <Target size={18} className="text-brand-300" />
                <div>
                  <p className="text-xs text-slate-400">Saved Boards</p>
                  <p className="text-xl font-bold text-slate-100">
                    {snapshotsForSelectedDate.length}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
              <div className="flex items-center gap-3">
                <Trophy size={18} className="text-emerald-300" />
                <div>
                  <p className="text-xs text-slate-400">Total Top 10 Hits</p>
                  <p className="text-xl font-bold text-emerald-300">
                    {selectedDateStats.totalTop10Hits}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-purple-300" />
                <div>
                  <p className="text-xs text-slate-400">Total Top 5 Hits</p>
                  <p className="text-xl font-bold text-purple-300">
                    {selectedDateStats.totalTop5Hits}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
              <div className="flex items-center gap-3">
                <Clock3 size={18} className="text-amber-300" />
                <div>
                  <p className="text-xs text-slate-400">Pending Boards</p>
                  <p className="text-xl font-bold text-amber-300">
                    {selectedDateStats.pendingCount}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {snapshotsForSelectedDate.map((snapshot) => {
                const isActive = snapshot.id === selectedSnapshotId;
                return (
                  <button
                    key={snapshot.id}
                    onClick={() => setSelectedSnapshotId(snapshot.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-all ${
                      isActive
                        ? 'border-brand-500/40 bg-brand-500/10'
                        : 'border-surface-400 bg-surface-800 hover:bg-surface-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {formatBoardLabel(snapshot.boardType)} Board
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatSnapshotKindLabel(snapshot.snapshotKind)} • {formatLineupLabel(snapshot.lineupMode)} • {formatCapturedAt(snapshot.capturedAt)}
                        </p>
                      </div>
                      <span className="rounded-md border border-surface-400 px-2 py-1 text-xs text-slate-300">
                        Top {snapshot.rowLimit}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-surface-700 px-3 py-2">
                        <p className="text-slate-400">Top 5 Hits</p>
                        <p className="mt-1 font-semibold text-slate-100">
                          {snapshot.top5Hits ?? 'Pending'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-surface-700 px-3 py-2">
                        <p className="text-slate-400">Top 10 Hits</p>
                        <p className="mt-1 font-semibold text-slate-100">
                          {snapshot.top10Hits ?? 'Pending'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-surface-400 bg-surface-800">
              {loadingDetail ? (
                <div className="flex items-center gap-3 p-6">
                  <Loader2 size={18} className="animate-spin text-brand-400" />
                  <span className="text-sm text-slate-400">Loading board details...</span>
                </div>
              ) : !snapshotDetail ? (
                <div className="p-6 text-sm text-slate-400">Select a saved board to inspect it.</div>
              ) : (
                <>
                  <div className="border-b border-surface-400 px-5 py-4">
                    <h2 className="text-lg font-semibold text-slate-100">
                      {formatBoardLabel(snapshotDetail.snapshot.boardType)} Board • {formatDate(snapshotDetail.snapshot.snapshotDate)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Captured {formatCapturedAt(snapshotDetail.snapshot.capturedAt)} • {formatSnapshotKindLabel(snapshotDetail.snapshot.snapshotKind)} • {formatLineupLabel(snapshotDetail.snapshot.lineupMode)} • Trained on {snapshotDetail.snapshot.trainingExampleCount ?? '—'} examples
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{HR_CHANCE_INFO_TEXT}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-400 bg-surface-700 text-left text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Player</th>
                          <th className="px-4 py-3" title={HR_CHANCE_INFO_TEXT}>{HR_CHANCE_LABEL}</th>
                          <th className="px-4 py-3">Edge</th>
                          <th className="px-4 py-3">Tier</th>
                          <th className="px-4 py-3">Lineup</th>
                          <th className="px-4 py-3">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshotDetail.rows.map((row) => (
                          <tr
                            key={`${snapshotDetail.snapshot.id}-${row.rank}-${row.batterId}`}
                            className="border-b border-surface-400/70"
                          >
                            <td className="px-4 py-3 font-mono text-slate-400">{row.rank}</td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-100">{row.batterName}</p>
                              <p className="text-xs text-slate-500">
                                {getTeamAbbreviation(row.teamId)} vs {getTeamAbbreviation(row.opponentTeamId)}
                              </p>
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-100">
                              {formatProbabilityPercent(getDisplayedHrProbability(row))}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {row.edge == null ? '—' : formatEdgePercent(row.edge)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-md border px-2 py-1 text-xs font-medium ${getTierClass(row.tier)}`}>
                                {row.tier}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {row.lineupConfirmed ? 'Confirmed' : 'Projected'}
                            </td>
                            <td className={`px-4 py-3 font-medium ${getOutcomeClass(row.actualHitHr)}`}>
                              {row.actualHitHr === true
                                ? row.actualHrCount > 1
                                  ? `${row.actualHrCount} HR`
                                  : 'HR'
                                : row.actualHitHr === false
                                  ? 'No HR'
                                  : 'Pending'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}




