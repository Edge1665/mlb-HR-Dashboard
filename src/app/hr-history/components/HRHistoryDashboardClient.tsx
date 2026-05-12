'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, BarChart3, Calendar, ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import {
  formatProbabilityPercent,
  getDisplayedHrProbability,
  HR_CHANCE_INFO_TEXT,
  HR_CHANCE_LABEL,
} from '@/services/hrChanceDisplay';
import { getTeamAbbreviation } from '@/services/mlbTeamMetadata';

type BoardType = 'model' | 'best' | 'edge';
type LineupMode = 'confirmed' | 'all';
type SnapshotType = 'morning_full_day' | 'pre_first_pitch' | 'official';
type SnapshotRow = { rank: number; batterId: string; batterName: string; teamId: string; opponentTeamId: string; gameId: string; displayedHrProbability?: number | null; predictedProbability: number; tier: string; sportsbookOddsAmerican: number | null; impliedProbability: number | null; edge: number | null; combinedScore: number | null; sportsbook: string | null; lineupConfirmed: boolean; actualHitHr: boolean | null; actualHrCount: number };
type HitPlayer = { batterId: string; batterName: string; rank: number; hrCount: number };
type Snapshot = { id: string; snapshotDate: string; boardType: BoardType; lineupMode: LineupMode; snapshotKind: string; snapshotType: 'filtered' | 'full'; validationSnapshotType: SnapshotType; capturedAt: string; generatedAt: string | null; trainingStartDate: string | null; trainingExampleCount: number | null; modelTrainedAt: string | null; rowLimit: number; top5Hits: number | null; top10Hits: number | null; top15Hits: number | null; top25Hits: number | null; totalHits: number | null; scoredAt: string | null; isDeleted: boolean; deletedAt: string | null; hitPlayers: HitPlayer[]; rows: SnapshotRow[] };
type Summary = { validationSnapshotType: SnapshotType; slateCount: number; avgTop5: number | null; avgTop10: number | null; avgTop15: number | null; avgTop25: number | null; bestDay: Snapshot | null; worstDay: Snapshot | null; rankDistribution: { top5: number; sixToTen: number; elevenToFifteen: number; sixteenToTwentyFive: number } };
const HISTORY_UI_VERSION = 'HR History v2 - 2026-05-06 10:24';

const fmtDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtShort = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtAt = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtAvg = (v: number | null) => (v == null ? '--' : v.toFixed(2));
const avg = (vals: Array<number | null>) => { const v = vals.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const boardLabel = (v: BoardType) => (v === 'best' ? 'Best' : v === 'edge' ? 'Edge' : 'Model');
const lineupLabel = (v: LineupMode) => (v === 'confirmed' ? 'Confirmed' : 'All');
const typeLabel = (v: SnapshotType) => (v === 'morning_full_day' ? 'Morning Full-Day' : v === 'pre_first_pitch' ? 'Pre-First-Pitch' : 'Official');
const typeWeight = (v: SnapshotType) => (v === 'morning_full_day' ? 0 : v === 'pre_first_pitch' ? 1 : 2);
const tierClass = (v: string) => v === 'elite' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' : v === 'high' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : v === 'medium' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
const outcomeClass = (v: boolean | null) => (v === true ? 'text-emerald-300' : v === false ? 'text-rose-300' : 'text-slate-400');
const fmtEdgePct = (v: number | null) => (v == null ? '--' : `${(v * 100).toFixed(1)}%`);
const bandLabel = (rank: number) => rank <= 5 ? '1-5' : rank <= 10 ? '6-10' : rank <= 15 ? '11-15' : rank <= 25 ? '16-25' : '25+';
const snapshotPreferenceScore = (snapshot: Snapshot) => (snapshot.snapshotType === 'full' ? 1000 : 0) + Math.min(snapshot.rowLimit, 999);
const sortSnapshots = (a: Snapshot, b: Snapshot) => (a.boardType === b.boardType ? (typeWeight(a.validationSnapshotType) - typeWeight(b.validationSnapshotType)) || (snapshotPreferenceScore(b) - snapshotPreferenceScore(a)) || (new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()) : (a.boardType === 'model' ? 0 : a.boardType === 'best' ? 1 : 2) - (b.boardType === 'model' ? 0 : b.boardType === 'best' ? 1 : 2));
const perfMetric = (s: Snapshot, v: number | null) => (s.scoredAt == null || v == null ? -1 : v);
const sortPerf = (a: Snapshot, b: Snapshot) => (perfMetric(b, b.top15Hits) - perfMetric(a, a.top15Hits)) || (perfMetric(b, b.top10Hits) - perfMetric(a, a.top10Hits)) || (perfMetric(b, b.top5Hits) - perfMetric(a, a.top5Hits)) || (new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
const strength = (s: Snapshot | null, summary: Summary | null) => !s || s.scoredAt == null ? { label: 'Pending outcome', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' } : !summary || summary.avgTop15 == null || s.top15Hits == null ? { label: 'Tracked day', className: 'border-slate-500/30 bg-slate-500/10 text-slate-200' } : s.top15Hits >= summary.avgTop15 + 1 ? { label: 'Strong model day', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' } : s.top15Hits <= Math.max(summary.avgTop15 - 1, 0) ? { label: 'Weak model day', className: 'border-rose-500/30 bg-rose-500/10 text-rose-200' } : { label: 'Around baseline', className: 'border-blue-500/30 bg-blue-500/10 text-blue-200' };

const isPreferredSnapshot = (candidate: Snapshot, current: Snapshot | undefined) => {
  if (!current) return true;
  const candidateScore = snapshotPreferenceScore(candidate);
  const currentScore = snapshotPreferenceScore(current);
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  return new Date(candidate.capturedAt).getTime() > new Date(current.capturedAt).getTime();
};

function dedupeSnapshots(snapshots: Snapshot[]) {
  const preferredByKey = new Map<string, Snapshot>();

  snapshots.forEach((snapshot) => {
    const key = [snapshot.snapshotDate, snapshot.boardType, snapshot.validationSnapshotType, snapshot.lineupMode, snapshot.isDeleted ? 'deleted' : 'active'].join('::');
    const current = preferredByKey.get(key);
    if (isPreferredSnapshot(snapshot, current)) {
      preferredByKey.set(key, snapshot);
    }
  });

  return Array.from(preferredByKey.values()).sort(sortSnapshots);
}

export default function HRHistoryDashboardClient() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [boardType, setBoardType] = useState<BoardType>('model');
  const [dateIndex, setDateIndex] = useState(0);
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ view: 'validation' });
        if (showDeleted) {
          params.set('includeDeleted', 'true');
        }
        const res = await fetch(`/api/hr-board-snapshots?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        setSnapshots((json.snapshots ?? []) as Snapshot[]);
      } catch {
        setSnapshots([]);
      } finally {
        setLoading(false);
      }
    }, [showDeleted]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const filtered = useMemo(() => dedupeSnapshots(snapshots.filter((s) => s.boardType === boardType)), [boardType, snapshots]);
  const visibleSnapshots = useMemo(() => filtered.filter((s) => showDeleted || !s.isDeleted), [filtered, showDeleted]);
  const scored = useMemo(() => visibleSnapshots.filter((s) => s.scoredAt != null && !s.isDeleted), [visibleSnapshots]);
  const dates = useMemo(() => [...new Set(visibleSnapshots.map((s) => s.snapshotDate))], [visibleSnapshots]);
  useEffect(() => setDateIndex(0), [boardType, showDeleted]);
  useEffect(() => { if (dateIndex > Math.max(dates.length - 1, 0)) setDateIndex(0); }, [dateIndex, dates.length]);
  const selectedDate = dates[dateIndex] ?? null;
  const dateSnapshots = useMemo(() => !selectedDate ? [] : visibleSnapshots.filter((s) => s.snapshotDate === selectedDate).sort(sortSnapshots), [selectedDate, visibleSnapshots]);
  useEffect(() => { const p = dateSnapshots.find((s) => !s.isDeleted && s.validationSnapshotType === 'morning_full_day') ?? dateSnapshots.find((s) => !s.isDeleted && s.validationSnapshotType === 'pre_first_pitch') ?? dateSnapshots.find((s) => !s.isDeleted) ?? dateSnapshots[0] ?? null; setSnapshotId((current) => dateSnapshots.some((snapshot) => snapshot.id === current) ? current : (p?.id ?? null)); }, [dateSnapshots]);
  const selected = useMemo(() => dateSnapshots.find((s) => s.id === snapshotId) ?? dateSnapshots[0] ?? null, [dateSnapshots, snapshotId]);

  const summaries = useMemo<Summary[]>(() => Array.from(new Set(scored.map((s) => s.validationSnapshotType))).sort((a, b) => typeWeight(a) - typeWeight(b)).map((validationSnapshotType) => {
    const items = scored.filter((s) => s.validationSnapshotType === validationSnapshotType).sort(sortPerf);
    const rankDistribution = items.reduce((acc, s) => { s.hitPlayers.forEach((h) => { if (h.rank <= 5) acc.top5 += 1; else if (h.rank <= 10) acc.sixToTen += 1; else if (h.rank <= 15) acc.elevenToFifteen += 1; else if (h.rank <= 25) acc.sixteenToTwentyFive += 1; }); return acc; }, { top5: 0, sixToTen: 0, elevenToFifteen: 0, sixteenToTwentyFive: 0 });
    return { validationSnapshotType, slateCount: items.length, avgTop5: avg(items.map((s) => s.top5Hits)), avgTop10: avg(items.map((s) => s.top10Hits)), avgTop15: avg(items.map((s) => s.top15Hits)), avgTop25: avg(items.filter((s) => s.rowLimit >= 25).map((s) => s.top25Hits)), bestDay: items[0] ?? null, worstDay: items.length ? items[items.length - 1] : null, rankDistribution };
  }), [scored]);

  const summaryMap = useMemo(() => new Map(summaries.map((s) => [s.validationSnapshotType, s])), [summaries]);
  const recent = useMemo(() => scored.slice(0, Math.min(scored.length, 8)), [scored]);
  const dateStats = useMemo(() => { const active = dateSnapshots.filter((s) => !s.isDeleted); const done = active.filter((s) => s.scoredAt != null); return { pending: active.length - done.length, top10: done.reduce((n, s) => n + (s.top10Hits ?? 0), 0), top15: done.reduce((n, s) => n + (s.top15Hits ?? 0), 0), totalHits: done.reduce((n, s) => n + (s.totalHits ?? 0), 0), activeCount: active.length }; }, [dateSnapshots]);
  const compare = useMemo(() => {
    const morning = dateSnapshots.find((s) => !s.isDeleted && s.validationSnapshotType === 'morning_full_day');
    const pre = dateSnapshots.find((s) => !s.isDeleted && s.validationSnapshotType === 'pre_first_pitch');
    if (!morning || !pre) return null;
    const overlap = pre.rows.filter((r) => new Set(morning.rows.map((x) => x.batterId)).has(r.batterId)).map((r) => r.batterName);
    const cmp = sortPerf(morning, pre);
    return { morning, pre, overlap, winner: cmp < 0 ? 'pre_first_pitch' : cmp > 0 ? 'morning_full_day' : 'tie' as 'tie' | SnapshotType };
  }, [dateSnapshots]);
  const selectedStrength = strength(selected, selected ? summaryMap.get(selected.validationSnapshotType) ?? null : null);

  const handleDelete = useCallback(async (snapshot: Snapshot) => {
    const confirmed = window.confirm(
      `Delete ${typeLabel(snapshot.validationSnapshotType)} snapshot from ${fmtDate(snapshot.snapshotDate)} captured at ${fmtAt(snapshot.capturedAt)}?`
    );
    if (!confirmed) return;

    setDeletingSnapshotId(snapshot.id);
    try {
      const response = await fetch(`/api/hr-board-snapshots?snapshotId=${encodeURIComponent(snapshot.id)}`, {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok || json.ok !== true) {
        throw new Error(json.error ?? 'Failed to delete snapshot');
      }

      setSnapshots((current) =>
        current.map((item) =>
          item.id === snapshot.id
            ? {
                ...item,
                isDeleted: true,
                deletedAt: json.snapshot?.deletedAt ?? new Date().toISOString(),
              }
            : item
        )
      );

      if (!showDeleted && snapshotId === snapshot.id) {
        setSnapshotId(null);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to delete snapshot');
    } finally {
      setDeletingSnapshotId(null);
    }
  }, [showDeleted, snapshotId]);

  if (loading) return <div className="flex items-center gap-3 rounded-xl border border-surface-400 bg-surface-800 p-6"><Loader2 size={18} className="animate-spin text-brand-400" /><span className="text-sm text-slate-400">Loading validation history...</span></div>;
  if (!visibleSnapshots.length) return <div className="rounded-xl border border-surface-400 bg-surface-800 p-8 text-center"><Calendar size={36} className="mx-auto mb-3 text-slate-500" /><p className="text-base font-semibold text-slate-200">{showDeleted ? 'No snapshots found' : 'No tracked boards yet'}</p><p className="mt-1 text-sm text-slate-400">{showDeleted ? 'There are no active or deleted snapshots matching this view.' : 'Save morning or pre-first-pitch boards before reviewing validation trends here.'}</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-100">HR Validation Dashboard</h1><p className="mt-1 text-sm text-slate-400">Track saved HR boards over time, compare snapshot workflows, and inspect where home runs are landing in the rankings.</p><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-sky-300">{HISTORY_UI_VERSION}</p></div>
        <a href="/hr-daily-board" className="rounded-lg border border-surface-400 px-4 py-2 text-sm text-slate-200 hover:bg-surface-600">Back To Board</a>
      </div>

      <div className="flex flex-wrap items-center gap-2">{(['model', 'best', 'edge'] as BoardType[]).map((v) => <button key={v} onClick={() => setBoardType(v)} className={`rounded-lg px-3 py-2 text-sm font-medium ${boardType === v ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300' : 'border border-surface-400 bg-surface-800 text-slate-400 hover:bg-surface-700 hover:text-slate-100'}`}>{boardLabel(v)} Board</button>)}<button onClick={() => setShowDeleted((value) => !value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${showDeleted ? 'border border-amber-500/30 bg-amber-500/15 text-amber-200' : 'border border-surface-400 bg-surface-800 text-slate-400 hover:bg-surface-700 hover:text-slate-100'}`}>{showDeleted ? 'Hide Deleted' : 'Show Deleted'}</button></div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Tracked Slates</p><p className="mt-1 text-xl font-bold text-slate-100">{scored.length}</p></div>
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Avg Top 10 Hits</p><p className="mt-1 text-xl font-bold text-emerald-300">{fmtAvg(avg(scored.map((s) => s.top10Hits)))}</p></div>
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Avg Top 15 Hits</p><p className="mt-1 text-xl font-bold text-purple-300">{fmtAvg(avg(scored.map((s) => s.top15Hits)))}</p></div>
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Avg Top 25 Hits</p><p className="mt-1 text-xl font-bold text-sky-300">{fmtAvg(avg(scored.map((s) => s.top25Hits)))}</p></div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2"><BarChart3 size={18} className="text-brand-300" /><h2 className="text-lg font-semibold text-slate-100">Snapshot-Type Performance</h2></div>
        <div className="grid gap-4 xl:grid-cols-3">{summaries.map((s) => { const total = s.rankDistribution.top5 + s.rankDistribution.sixToTen + s.rankDistribution.elevenToFifteen + s.rankDistribution.sixteenToTwentyFive; return <div key={s.validationSnapshotType} className="rounded-xl border border-surface-400 bg-surface-800 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-slate-100">{typeLabel(s.validationSnapshotType)}</h3><p className="mt-1 text-sm text-slate-400">{s.slateCount} tracked {s.slateCount === 1 ? 'slate' : 'slates'}</p></div><span className="rounded-md border border-surface-400 px-2 py-1 text-xs text-slate-300">{boardLabel(boardType)}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-xs text-slate-400">Avg Top 5</p><p className="mt-1 font-semibold text-slate-100">{fmtAvg(s.avgTop5)}</p></div><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-xs text-slate-400">Avg Top 10</p><p className="mt-1 font-semibold text-slate-100">{fmtAvg(s.avgTop10)}</p></div><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-xs text-slate-400">Avg Top 15</p><p className="mt-1 font-semibold text-slate-100">{fmtAvg(s.avgTop15)}</p></div><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-xs text-slate-400">Avg Top 25</p><p className="mt-1 font-semibold text-slate-100">{fmtAvg(s.avgTop25)}</p></div></div><div className="mt-4 grid gap-2 text-sm"><div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2"><p className="text-xs text-emerald-200/80">Best Day</p><p className="mt-1 font-medium text-emerald-100">{s.bestDay ? `${fmtShort(s.bestDay.snapshotDate)} | T15 ${s.bestDay.top15Hits ?? '--'}` : '--'}</p></div><div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2"><p className="text-xs text-rose-200/80">Worst Day</p><p className="mt-1 font-medium text-rose-100">{s.worstDay ? `${fmtShort(s.worstDay.snapshotDate)} | T15 ${s.worstDay.top15Hits ?? '--'}` : '--'}</p></div></div><div className="mt-4 space-y-2 text-sm">{[['1-5', s.rankDistribution.top5], ['6-10', s.rankDistribution.sixToTen], ['11-15', s.rankDistribution.elevenToFifteen], ['16-25', s.rankDistribution.sixteenToTwentyFive]].map(([label, count]) => <div key={String(label)} className="flex items-center justify-between gap-3"><span className="text-slate-300">{label}</span><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-surface-700"><div className="h-full rounded-full bg-brand-400" style={{ width: `${total > 0 ? (Number(count) / total) * 100 : 0}%` }} /></div><span className="w-10 text-right text-slate-100">{count}</span></div></div>)}</div></div>; })}</div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-xl border border-surface-400 bg-surface-800"><div className="border-b border-surface-400 px-5 py-4"><h2 className="text-lg font-semibold text-slate-100">Recent Results</h2><p className="mt-1 text-sm text-slate-400">Last {recent.length} tracked slates for the {boardLabel(boardType).toLowerCase()} board.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-surface-400 bg-surface-700 text-left text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Snapshot</th><th className="px-4 py-3">Top 5</th><th className="px-4 py-3">Top 10</th><th className="px-4 py-3">Top 15</th><th className="px-4 py-3">Top 25</th><th className="px-4 py-3">HR Hitters</th></tr></thead><tbody>{recent.map((s) => <tr key={s.id} className="border-b border-surface-400/70 align-top"><td className="px-4 py-3 text-slate-200">{fmtDate(s.snapshotDate)}</td><td className="px-4 py-3 text-slate-300">{typeLabel(s.validationSnapshotType)}</td><td className="px-4 py-3 text-slate-100">{s.top5Hits ?? '--'}</td><td className="px-4 py-3 text-slate-100">{s.top10Hits ?? '--'}</td><td className="px-4 py-3 text-slate-100">{s.top15Hits ?? '--'}</td><td className="px-4 py-3 text-slate-100">{s.top25Hits ?? '--'}</td><td className="px-4 py-3 text-slate-300">{s.hitPlayers.length ? s.hitPlayers.map((h) => `${h.batterName} (#${h.rank}${h.hrCount > 1 ? `, ${h.hrCount} HR` : ''})`).join(', ') : 'No tracked HR hits'}</td></tr>)}</tbody></table></div></div>
        <div className="rounded-xl border border-surface-400 bg-surface-800"><div className="border-b border-surface-400 px-5 py-4"><div className="flex items-center gap-2"><ArrowRightLeft size={18} className="text-brand-300" /><h2 className="text-lg font-semibold text-slate-100">Same-Day Comparison</h2></div><p className="mt-1 text-sm text-slate-400">Morning vs pre-first-pitch on {selectedDate ? fmtDate(selectedDate) : 'the selected day'}.</p></div><div className="p-5">{!compare ? <p className="text-sm text-slate-400">Both active snapshot types are not available for this date yet.</p> : <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">{[compare.morning, compare.pre].map((s) => <div key={s.id} className="rounded-lg border border-surface-400 bg-surface-700 p-4"><p className="text-sm font-semibold text-slate-100">{typeLabel(s.validationSnapshotType)}</p><p className="mt-1 text-xs text-slate-400">Captured {fmtAt(s.capturedAt)}</p><div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-md bg-surface-800 px-2 py-2"><p className="text-xs text-slate-400">T5</p><p className="mt-1 font-semibold text-slate-100">{s.top5Hits ?? '--'}</p></div><div className="rounded-md bg-surface-800 px-2 py-2"><p className="text-xs text-slate-400">T10</p><p className="mt-1 font-semibold text-slate-100">{s.top10Hits ?? '--'}</p></div><div className="rounded-md bg-surface-800 px-2 py-2"><p className="text-xs text-slate-400">T15</p><p className="mt-1 font-semibold text-slate-100">{s.top15Hits ?? '--'}</p></div></div></div>)}</div><div className={`rounded-lg px-4 py-3 text-sm ${compare.winner === 'tie' ? 'border border-slate-500/30 bg-slate-500/10 text-slate-200' : 'border border-brand-500/30 bg-brand-500/10 text-brand-100'}`}>{compare.winner === 'tie' ? 'Neither snapshot type clearly separated on this date.' : `${typeLabel(compare.winner)} performed better on this date.`}</div><div><p className="text-xs uppercase tracking-wide text-slate-400">Player Overlap</p><p className="mt-2 text-sm text-slate-300">{compare.overlap.length ? compare.overlap.join(', ') : 'No overlapping players between the two saved boards.'}</p></div></div>}</div></div>
      </section>

      <section className="space-y-4">
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><div className="flex items-center justify-between gap-4"><button onClick={() => setDateIndex((v) => Math.max(0, v - 1))} disabled={dateIndex === 0} className="rounded-lg p-2 text-slate-400 hover:bg-surface-600 hover:text-slate-100 disabled:opacity-30"><ChevronLeft size={18} /></button><div className="flex flex-1 flex-wrap justify-center gap-2">{dates.map((d, i) => <button key={d} onClick={() => setDateIndex(i)} className={`rounded-lg px-3 py-2 text-xs font-medium ${i === dateIndex ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-surface-600 hover:text-slate-100'}`}>{fmtDate(d)}</button>)}</div><button onClick={() => setDateIndex((v) => Math.min(dates.length - 1, v + 1))} disabled={dateIndex === dates.length - 1} className="rounded-lg p-2 text-slate-400 hover:bg-surface-600 hover:text-slate-100 disabled:opacity-30"><ChevronRight size={18} /></button></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Active Boards On Date</p><p className="mt-1 text-xl font-bold text-slate-100">{dateStats.activeCount}</p></div><div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Top 10 Hits On Date</p><p className="mt-1 text-xl font-bold text-emerald-300">{dateStats.top10}</p></div><div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Top 15 Hits On Date</p><p className="mt-1 text-xl font-bold text-purple-300">{dateStats.top15}</p></div><div className="rounded-xl border border-surface-400 bg-surface-800 p-4"><p className="text-xs text-slate-400">Top 25 HR Hitters On Date</p><p className="mt-1 text-xl font-bold text-sky-300">{dateStats.totalHits}</p></div></div>
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3">{dateSnapshots.map((s) => <div key={s.id} className={`rounded-xl border p-4 ${s.id === selected?.id ? 'border-brand-500/40 bg-brand-500/10' : 'border-surface-400 bg-surface-800'} ${s.isDeleted ? 'opacity-70' : ''}`}><div className="flex items-start justify-between gap-3"><button onClick={() => setSnapshotId(s.id)} className="flex-1 text-left"><p className="text-sm font-semibold text-slate-100">{typeLabel(s.validationSnapshotType)}</p><p className="text-xs text-slate-400">{lineupLabel(s.lineupMode)} | {fmtAt(s.capturedAt)}</p><p className="mt-1 text-xs text-slate-500">{s.snapshotDate} | {s.snapshotKind}{s.isDeleted && s.deletedAt ? ` | Deleted ${fmtAt(s.deletedAt)}` : ''}</p></button><div className="flex flex-col items-end gap-2"><span className="rounded-md border border-surface-400 px-2 py-1 text-xs text-slate-300">Top {s.rowLimit}</span>{s.isDeleted ? <span className="rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200">Deleted</span> : <button onClick={() => void handleDelete(s)} disabled={deletingSnapshotId === s.id} className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">{deletingSnapshotId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}Delete</button>}</div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-slate-400">Top 5</p><p className="mt-1 font-semibold text-slate-100">{s.top5Hits ?? 'Pending'}</p></div><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-slate-400">Top 10</p><p className="mt-1 font-semibold text-slate-100">{s.top10Hits ?? 'Pending'}</p></div><div className="rounded-lg bg-surface-700 px-3 py-2"><p className="text-slate-400">Top 15</p><p className="mt-1 font-semibold text-slate-100">{s.top15Hits ?? 'Pending'}</p></div></div></div>)}</div>
          <div className="rounded-xl border border-surface-400 bg-surface-800">{!selected ? <div className="p-6 text-sm text-slate-400">Select a saved board to inspect it.</div> : <><div className="border-b border-surface-400 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-100">{boardLabel(selected.boardType)} Board | {fmtDate(selected.snapshotDate)}</h2><p className="mt-1 text-sm text-slate-400">Captured {fmtAt(selected.capturedAt)} | {typeLabel(selected.validationSnapshotType)} | {lineupLabel(selected.lineupMode)} | Trained on {selected.trainingExampleCount ?? '--'} examples</p><p className="mt-2 text-xs text-slate-500">{HR_CHANCE_INFO_TEXT}</p></div><div className="flex flex-wrap items-center gap-2">{selected.isDeleted ? <span className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm font-medium text-rose-200">Deleted</span> : null}<span className={`rounded-lg border px-3 py-2 text-sm font-medium ${selectedStrength.className}`}>{selectedStrength.label}</span></div></div></div><div className="grid gap-3 border-b border-surface-400 px-5 py-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg bg-surface-700 px-3 py-3"><p className="text-xs text-slate-400">Top 5 Hits</p><p className="mt-1 text-lg font-semibold text-slate-100">{selected.top5Hits ?? '--'}</p></div><div className="rounded-lg bg-surface-700 px-3 py-3"><p className="text-xs text-slate-400">Top 10 Hits</p><p className="mt-1 text-lg font-semibold text-slate-100">{selected.top10Hits ?? '--'}</p></div><div className="rounded-lg bg-surface-700 px-3 py-3"><p className="text-xs text-slate-400">Top 25 Hits</p><p className="mt-1 text-lg font-semibold text-slate-100">{selected.top25Hits ?? '--'}</p></div><div className="rounded-lg bg-surface-700 px-3 py-3"><p className="text-xs text-slate-400">HR Hitters</p><p className="mt-1 text-lg font-semibold text-slate-100">{selected.totalHits ?? '--'}</p></div></div><div className="border-b border-surface-400 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-slate-400">Players Who Homered</p><div className="mt-3 flex flex-wrap gap-2">{selected.hitPlayers.length ? selected.hitPlayers.map((h) => <span key={`${selected.id}-${h.batterId}`} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-100">{h.batterName} #{h.rank} ({bandLabel(h.rank)})</span>) : <span className="text-sm text-slate-400">No tracked HR hits on this board.</span>}</div></div><span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium uppercase tracking-wide text-sky-200">Showing {selected.rows.length} saved rows through rank {selected.rows[selected.rows.length - 1]?.rank ?? '--'}</span></div></div><div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[820px] text-sm"><thead className="sticky top-0 z-10"><tr className="border-b border-surface-400 bg-surface-700 text-left text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3">#</th><th className="px-4 py-3">Player</th><th className="px-4 py-3" title={HR_CHANCE_INFO_TEXT}>{HR_CHANCE_LABEL}</th><th className="px-4 py-3">Edge</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Lineup</th><th className="px-4 py-3">Rank Band</th><th className="px-4 py-3">Outcome</th></tr></thead><tbody>{selected.rows.map((r) => <tr key={`${selected.id}-${r.rank}-${r.batterId}`} className={`border-b border-surface-400/70 ${r.actualHitHr ? 'bg-emerald-500/5' : ''}`}><td className="px-4 py-3 font-mono text-slate-400">{r.rank}</td><td className="px-4 py-3"><p className="font-medium text-slate-100">{r.batterName}</p><p className="text-xs text-slate-500">{getTeamAbbreviation(r.teamId)} vs {getTeamAbbreviation(r.opponentTeamId)}</p></td><td className="px-4 py-3 font-semibold text-slate-100">{formatProbabilityPercent(getDisplayedHrProbability(r))}</td><td className="px-4 py-3 text-slate-300">{r.edge == null ? '--' : fmtEdgePct(r.edge)}</td><td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-xs font-medium ${tierClass(r.tier)}`}>{r.tier}</span></td><td className="px-4 py-3 text-slate-300">{r.lineupConfirmed ? 'Confirmed' : 'Projected'}</td><td className="px-4 py-3 text-slate-300">{bandLabel(r.rank)}</td><td className={`px-4 py-3 font-medium ${outcomeClass(r.actualHitHr)}`}>{r.actualHitHr === true ? (r.actualHrCount > 1 ? `${r.actualHrCount} HR` : 'HR') : r.actualHitHr === false ? 'No HR' : 'Pending'}</td></tr>)}</tbody></table></div><div className="border-t border-surface-400 px-5 py-4 text-sm text-slate-400">{selected.rowLimit < 25 ? `Top 25 is only partially available here because this board saved ${selected.rowLimit} rows.` : 'Top 25 metrics are computed from the saved snapshot rows for this board.'} Saved rows render {HR_CHANCE_LABEL} from <code>displayedHrProbability</code>, with legacy snapshot values re-calibrated on read when older saved data is out of range.</div></>}</div>
        </div>
        <div className="text-sm text-slate-400">{dateStats.totalHits === 0 ? 'Same-day totals only count active snapshot rows and ignore soft-deleted snapshots.' : `${dateStats.totalHits} tracked home-run hits were recorded across the active saved boards for this date.`}</div>
      </section>
    </div>
  );
}


