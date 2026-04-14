'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Filter,
  Flame,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  formatProbabilityPercent,
  HR_CHANCE_INFO_TEXT,
  HR_CHANCE_LABEL,
} from '@/services/hrChanceDisplay';
import { getTeamAbbreviation } from '@/services/mlbTeamMetadata';

type SortMode = 'best' | 'model' | 'edge';
type LineupMode = 'confirmed' | 'all';

type DailyBoardRow = {
  rank: number;
  batterId: string;
  batterName: string;
  batterPosition: string | null;
  batterBats: 'L' | 'R' | 'S' | null;
  lineupSpot: number | null;
  teamId: string;
  opponentTeamId: string;
  gameId: string;
  gameTime: string | null;
  ballparkName: string | null;
  opposingPitcherName: string | null;
  opposingPitcherThrows: 'L' | 'R' | null;
  predictedProbability: number;
  tier: string;
  reasons: string[];
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  edge: number | null;
  combinedScore: number | null;
  sportsbook: string | null;
  lineupConfirmed: boolean;
  features: {
    seasonHRPerGame: number;
    barrelRate: number;
    iso: number;
    pitcherHr9: number;
    parkHrFactor: number;
    weatherHrImpactScore: number;
    last7HR: number;
    recentGamesWithHR: number;
    recentPowerScore: number;
    projectedAtBats: number;
    platoonEdge: number;
  };
};

type DailyBoardResponse = {
  ok: boolean;
  targetDate: string;
  sportsbooks: string[];
  generatedAt: string;
  trainingStartDate: string;
  trainingExampleCount: number;
  modelTrainedAt: string;
  odds: {
    status: 'live' | 'cached' | 'unavailable';
    cachedAt: string | null;
    cacheTtlMinutes: number;
  };
  sortMode: SortMode;
  lineupMode: LineupMode;
  confirmedCount: number;
  unconfirmedCount: number;
  predictedSlateEnvironment: 'low_hr' | 'medium_hr' | 'high_hr';
  recommendedTopPlaysMin: number;
  recommendedTopPlaysMax: number;
  shouldConsiderSkippingSlate: boolean;
  rows: DailyBoardRow[];
};

const SPORTSBOOK_OPTIONS = ['Caesars', 'bet365', 'FanDuel', 'DraftKings'] as const;

type BoardSnapshotSummary = {
  id: string;
  snapshotDate: string;
  boardType: SortMode;
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

type SaveDefaultBoardsResponse = {
  ok: boolean;
  targetDate: string;
  workflow?: 'all_variants' | 'morning_full_day' | 'pre_first_pitch';
  noteFileName?: string;
  notePath?: string;
  saved?: Array<{
    label?: string;
    boardType: SortMode;
    rowsSaved: number;
  }>;
};

type CachedDashboardPayload = {
  savedAt: string;
  sortMode: SortMode;
  lineupMode: LineupMode;
  selectedSportsbooks: string[];
  selectedBoard: DailyBoardResponse;
  modelBoard: DailyBoardResponse;
  bestBoard: DailyBoardResponse;
  yesterdaySnapshots: {
    date: string | null;
    model: BoardSnapshotSummary | null;
    best: BoardSnapshotSummary | null;
  };
};

const DASHBOARD_CACHE_KEY_PREFIX = 'hr-dashboard-cache-v2';

function getPreviousDateString(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getTodayEtDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildDashboardCacheKey(
  sortMode: SortMode,
  lineupMode: LineupMode,
  selectedSportsbooks: string[]
): string {
  const booksKey = [...selectedSportsbooks].sort().join(',');
  return `${DASHBOARD_CACHE_KEY_PREFIX}:${sortMode}:${lineupMode}:${booksKey}`;
}

function readCachedDashboard(
  sortMode: SortMode,
  lineupMode: LineupMode,
  selectedSportsbooks: string[]
): CachedDashboardPayload | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(
    buildDashboardCacheKey(sortMode, lineupMode, selectedSportsbooks)
  );
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedDashboardPayload;
    if (parsed.selectedBoard?.targetDate !== getTodayEtDateString()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedDashboard(payload: CachedDashboardPayload) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    buildDashboardCacheKey(payload.sortMode, payload.lineupMode, payload.selectedSportsbooks),
    JSON.stringify(payload)
  );
}

function getOddsBanner(data: DailyBoardResponse | null): {
  title: string;
  detail: string;
  className: string;
} {
  if (!data) {
    return {
      title: 'Odds status unavailable',
      detail: 'The dashboard has not loaded odds information yet.',
      className: 'border-surface-300 bg-surface-800 text-slate-300',
    };
  }

  if (data.odds.status === 'live') {
    return {
      title: 'Live odds loaded',
      detail: `Fresh odds are in. Repeat refreshes should reuse them for about ${data.odds.cacheTtlMinutes} minutes.`,
      className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    };
  }

  if (data.odds.status === 'cached') {
    const cachedAt = data.odds.cachedAt
      ? new Date(data.odds.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'recently';
    return {
      title: 'Using cached odds',
      detail: `Odds were last refreshed at ${cachedAt}. This is helping protect your credit usage.`,
      className: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
    };
  }

  return {
    title: 'Odds unavailable',
    detail: 'The board is still loading from the model side, but edge and value context may be limited until odds return.',
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  };
}

function getEmptyStateConfig(data: DailyBoardResponse | null, sortMode: SortMode, lineupMode: LineupMode): {
  title: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
} {
  if (!data) {
    return {
      title: 'Loading board state',
      detail: 'The dashboard is still pulling today\'s board context.',
      actionLabel: 'Open raw board',
      actionHref: '/hr-daily-board',
    };
  }

  if (sortMode === 'best' && data.odds.status === 'unavailable') {
    return {
      title: 'No odds context yet',
      detail:
        'The model board is still available, and the best board can still rank HR likelihood. Odds just are not available yet for edge and value context.',
      actionLabel: 'Open model board view',
      actionHref: '/home-run-dashboard?sort=model',
    };
  }

  if (lineupMode === 'confirmed' && data.confirmedCount === 0) {
    return {
      title: 'No confirmed lineups yet',
      detail:
        'Confirmed-only mode stays strict on purpose. You can switch to the curated all pool if you want an earlier look before lineups lock in.',
      actionLabel: 'Show curated all pool',
      actionHref: '/home-run-dashboard?lineupMode=all',
    };
  }

  return {
    title: 'No rows match the current filters',
    detail:
      'Try widening the lineup mode or tier filter. The board is loaded, but nothing is passing the current view settings.',
    actionLabel: 'Reset with raw board',
    actionHref: '/hr-daily-board',
  };
}

function formatAmericanOdds(value: number | null): string {
  if (value == null) return '--';
  return value > 0 ? `+${value}` : `${value}`;
}

function formatEdge(value: number | null): string {
  if (value == null) return '--';
  const pct = (value * 100).toFixed(1);
  return value >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatCombinedScore(value: number | null): string {
  if (value == null) return '--';
  return value.toFixed(3);
}

function getTierClass(tier: string): string {
  if (tier.startsWith('Elite')) return 'bg-amber-400/15 text-amber-300 border-amber-400/30';
  if (tier.startsWith('Strong')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (tier.startsWith('Solid')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

function matchesTierFilter(
  tier: string,
  filter: 'all' | 'elite' | 'strong' | 'solid' | 'longshot'
): boolean {
  if (filter === 'all') return true;
  if (filter === 'elite') return tier.startsWith('Elite');
  if (filter === 'strong') return tier.startsWith('Strong');
  if (filter === 'solid') return tier.startsWith('Solid');
  return tier.startsWith('Longshot');
}

function getProbabilityClass(value: number): string {
  if (value >= 0.25) return 'text-amber-300';
  if (value >= 0.18) return 'text-emerald-300';
  if (value >= 0.12) return 'text-blue-300';
  return 'text-slate-300';
}

function getEdgeClass(value: number | null): string {
  if (value == null) return 'text-slate-400';
  if (value > 0.05) return 'text-emerald-300';
  if (value > 0) return 'text-blue-300';
  return 'text-slate-400';
}

function getSlateGuidanceCopy(data: DailyBoardResponse): {
  title: string;
  detail: string;
  className: string;
} {
  const rangeText = `${data.recommendedTopPlaysMin} to ${data.recommendedTopPlaysMax} plays`;

  if (data.predictedSlateEnvironment === 'high_hr') {
    return {
      title: 'High HR slate',
      detail: `Reasonable to consider ${rangeText}. The board can support a wider card today.`,
      className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    };
  }

  if (data.predictedSlateEnvironment === 'low_hr') {
    return {
      title: 'Low HR slate',
      detail: 'Possible skip slate, keep exposure very limited.',
      className: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    };
  }

  return {
    title: 'Medium HR slate',
    detail: `Tighter card, consider ${rangeText}.`,
    className: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
  };
}

function getThrowsBadgeClass(value: 'L' | 'R' | null): string {
  if (value === 'L') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (value === 'R') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  return 'bg-surface-700 text-slate-300 border-surface-300';
}

function buildBetPerspective(row: DailyBoardRow): string {
  const notes: string[] = [];

  if (row.edge != null && row.edge > 0.05) {
    notes.push('the price still leaves real breathing room');
  } else if (row.edge != null && row.edge > 0) {
    notes.push('there is still a little value in the number');
  }

  if (row.features.barrelRate >= 12) {
    notes.push('the quality of contact has been strong');
  } else if (row.features.iso >= 0.22) {
    notes.push('the power profile is good enough to trust');
  }

  if (row.features.pitcherHr9 >= 1.4) {
    notes.push('the opposing pitcher gives up enough lift and damage');
  }

  if (row.features.parkHrFactor >= 1.08) {
    notes.push('the park helps a little');
  }

  if (row.lineupConfirmed && row.lineupSpot != null && row.lineupSpot <= 5) {
    notes.push('the lineup spot supports volume');
  } else if (row.lineupConfirmed) {
    notes.push('the lineup is locked in');
  }

  if (row.features.last7HR >= 2 || row.features.recentGamesWithHR >= 0.2) {
    notes.push('recent form points in the right direction');
  }

  const uniqueNotes = [...new Set(notes)];

  if (uniqueNotes.length >= 3) {
    return `This looks like a strong HR target because ${uniqueNotes.slice(0, 3).join(', ')}.`;
  }

  if (uniqueNotes.length === 2) {
    return `This profile holds up because ${uniqueNotes[0]} and ${uniqueNotes[1]}.`;
  }

  if (uniqueNotes.length === 1) {
    return `There is a reasonable case here because ${uniqueNotes[0]}.`;
  }

  return 'Nothing looks fluky here. The model, the spot, and the surrounding context are at least pointing in the same direction.';
}

function buildPlayerResearchHref(row: DailyBoardRow): string {
  return `/player-research?playerId=${encodeURIComponent(row.batterId)}&teamId=${encodeURIComponent(
    row.teamId
  )}&playerName=${encodeURIComponent(row.batterName)}&bats=${encodeURIComponent(
    row.batterBats ?? ''
  )}&position=${encodeURIComponent(row.batterPosition ?? '')}`;
}

export default function BestBetsDashboardClient() {
  const [data, setData] = useState<DailyBoardResponse | null>(null);
  const [comparisonBoards, setComparisonBoards] = useState<{
    model: DailyBoardResponse | null;
    best: DailyBoardResponse | null;
  }>({
    model: null,
    best: null,
  });
  const [yesterdaySnapshots, setYesterdaySnapshots] = useState<{
    date: string | null;
    model: BoardSnapshotSummary | null;
    best: BoardSnapshotSummary | null;
  }>({
    date: null,
    model: null,
    best: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingWorkflow, setSavingWorkflow] = useState<'morning_full_day' | 'pre_first_pitch' | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSavedNotePath, setLastSavedNotePath] = useState<string | null>(null);
  const [lastSavedWorkflow, setLastSavedWorkflow] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('best');
  const [lineupMode, setLineupMode] = useState<LineupMode>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'elite' | 'strong' | 'solid' | 'longshot'>('all');
  const [showTopOnly, setShowTopOnly] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [selectedSportsbooks, setSelectedSportsbooks] = useState<string[]>([]);
  const [boardLockedAt, setBoardLockedAt] = useState<string | null>(null);

  const fetchData = useCallback(async (options?: { force?: boolean }) => {
    const forceRefresh = options?.force === true;
    const cached = !forceRefresh
      ? readCachedDashboard(sortMode, lineupMode, selectedSportsbooks)
      : null;

    if (cached) {
      setData(cached.selectedBoard);
      setComparisonBoards({
        model: cached.modelBoard,
        best: cached.bestBoard,
      });
      setYesterdaySnapshots(cached.yesterdaySnapshots);
      setBoardLockedAt(cached.savedAt);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fetchBoard = async (sort: SortMode) => {
        const params = new URLSearchParams({
          sort,
          lineupMode,
          limit: '25',
        });
        if (selectedSportsbooks.length > 0) {
          params.set('sportsbooks', selectedSportsbooks.join(','));
        }

        const response = await fetch(`/api/hr-daily-board?${params.toString()}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        return (await response.json()) as DailyBoardResponse;
      };

      const [selectedBoard, modelBoard, bestBoard] = await Promise.all([
        fetchBoard(sortMode),
        fetchBoard('model'),
        fetchBoard('best'),
      ]);

      const yesterdayDate = getPreviousDateString(selectedBoard.targetDate);
      const snapshotResponse = await fetch(`/api/hr-board-snapshots?date=${yesterdayDate}`, {
        cache: 'no-store',
      });

      let modelSnapshot: BoardSnapshotSummary | null = null;
      let bestSnapshot: BoardSnapshotSummary | null = null;

      if (snapshotResponse.ok) {
        const snapshotJson = (await snapshotResponse.json()) as {
          ok: boolean;
          snapshots?: BoardSnapshotSummary[];
        };
        const snapshots = snapshotJson.snapshots ?? [];
        modelSnapshot = snapshots.find((snapshot) => snapshot.boardType === 'model') ?? null;
        bestSnapshot = snapshots.find((snapshot) => snapshot.boardType === 'best') ?? null;
      }

      setData(selectedBoard);
      setComparisonBoards({
        model: modelBoard,
        best: bestBoard,
      });
      setYesterdaySnapshots({
        date: yesterdayDate,
        model: modelSnapshot,
        best: bestSnapshot,
      });
      const cachedPayload: CachedDashboardPayload = {
        savedAt: new Date().toISOString(),
        sortMode,
        lineupMode,
        selectedSportsbooks,
        selectedBoard,
        modelBoard,
        bestBoard,
        yesterdaySnapshots: {
          date: yesterdayDate,
          model: modelSnapshot,
          best: bestSnapshot,
        },
      };
      writeCachedDashboard(cachedPayload);
      setBoardLockedAt(cachedPayload.savedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [lineupMode, selectedSportsbooks, sortMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleManualRefresh = useCallback(() => {
    void fetchData({ force: true });
  }, [fetchData]);

  const handleSaveOfficialBoards = useCallback(async (workflow: 'morning_full_day' | 'pre_first_pitch') => {
    if (!data?.targetDate) return;

    setSavingWorkflow(workflow);
    setSaveStatus('idle');
    setLastSavedNotePath(null);

    try {
      const response = await fetch('/api/hr-board-snapshots/save-defaults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetDate: data.targetDate,
          workflow,
          limit: 25,
          sportsbooks: selectedSportsbooks,
        }),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }

      const json = (await response.json()) as SaveDefaultBoardsResponse;

      setLastSavedAt(new Date().toISOString());
      setLastSavedNotePath(json.notePath ?? null);
      setLastSavedWorkflow(
        workflow === 'morning_full_day'
          ? 'Morning Full-Day Snapshot'
          : 'Pre-First-Pitch Snapshot'
      );
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      setSavingWorkflow(null);
    }
  }, [data?.targetDate, selectedSportsbooks]);

  const rows = data?.rows ?? [];
  const filteredRows = useMemo(() => {
    const tierFiltered = rows.filter((row) => matchesTierFilter(row.tier, tierFilter));
    return showTopOnly ? tierFiltered.slice(0, 5) : tierFiltered;
  }, [rows, showTopOnly, tierFilter]);
  const topModelRows = useMemo(() => comparisonBoards.model?.rows.slice(0, 5) ?? [], [comparisonBoards.model]);
  const topBestRows = useMemo(() => comparisonBoards.best?.rows.slice(0, 5) ?? [], [comparisonBoards.best]);
  const overlappingTopPicks = useMemo(() => {
    const bestIds = new Set(topBestRows.map((row) => row.batterId));
    return topModelRows.filter((row) => bestIds.has(row.batterId));
  }, [topBestRows, topModelRows]);
  const modelOnlyPicks = useMemo(() => {
    const bestIds = new Set(topBestRows.map((row) => row.batterId));
    return topModelRows.filter((row) => !bestIds.has(row.batterId));
  }, [topBestRows, topModelRows]);
  const bestOnlyPicks = useMemo(() => {
    const modelIds = new Set(topModelRows.map((row) => row.batterId));
    return topBestRows.filter((row) => !modelIds.has(row.batterId));
  }, [topBestRows, topModelRows]);

  const topRow = filteredRows[0] ?? rows[0] ?? null;
  const averageProbability =
    filteredRows.length > 0
      ? filteredRows.reduce((sum, row) => sum + row.predictedProbability, 0) / filteredRows.length
      : 0;
  const positiveEdgeCount = filteredRows.filter((row) => (row.edge ?? 0) > 0).length;
  const eliteCount = filteredRows.filter((row) => row.tier.startsWith('Elite')).length;
  const slateGuidance = data ? getSlateGuidanceCopy(data) : null;

  const lastUpdated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const lockedAtLabel = boardLockedAt
    ? new Date(boardLockedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const savedAtLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const oddsBanner = getOddsBanner(data);
  const emptyState = getEmptyStateConfig(data, sortMode, lineupMode);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 size={40} className="animate-spin text-brand-400" />
        <div className="text-center">
          <p className="text-lg font-medium text-slate-200">Loading HR target dashboard...</p>
          <p className="mt-1 text-sm text-slate-500">
            Pulling the current daily board and formatting it for a cleaner view
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-lg font-medium text-red-400">Failed to load dashboard</p>
          <p className="mt-1 text-sm text-slate-500">{error ?? 'Unknown error'}</p>
          <button
            onClick={handleManualRefresh}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-500/20"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-surface-400 bg-gradient-to-br from-surface-800 via-surface-800 to-surface-700 p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
              <Sparkles size={12} />
              HR Target Dashboard
            </div>
            <h1 className="text-3xl font-bold text-slate-100">Today's HR target board, styled for actual use</h1>
            <p className="mt-2 text-sm text-slate-400">
              This dashboard uses the same backend as the daily board, with the default view focused
              on the best practical HR target board rather than the older projection pipeline.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {lockedAtLabel
                ? `Board locked from ${lockedAtLabel}. Refreshing the page will keep this version until you click Refresh board now.`
                : 'Once loaded, this board stays fixed until you manually refresh it.'}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/hr-daily-board?sort=best"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 bg-surface-700 px-3 py-2 text-sm text-slate-200 hover:bg-surface-600"
            >
              Open Raw Best Board
              <ArrowUpRight size={14} />
            </Link>
            <Link
              href="/hr-history"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 bg-surface-700 px-3 py-2 text-sm text-slate-200 hover:bg-surface-600"
            >
              View History
            </Link>
            <button
              onClick={() => setShowGlossary((value) => !value)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-surface-300 bg-surface-700 px-3 py-2 text-sm text-slate-200 hover:bg-surface-600"
            >
              <HelpCircle size={14} />
              {showGlossary ? 'Hide glossary' : 'What do these terms mean?'}
            </button>
            <span className="text-xs text-slate-500">
              Morning saves the curated full-day pool. Pre-first-pitch saves the confirmed-only pool.
            </span>
            <button
              onClick={() => void handleSaveOfficialBoards('morning_full_day')}
              disabled={savingWorkflow != null}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingWorkflow === 'morning_full_day' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {savingWorkflow === 'morning_full_day' ? 'Saving morning snapshot...' : 'Save Morning Full-Day Snapshot'}
            </button>
            <button
              onClick={() => void handleSaveOfficialBoards('pre_first_pitch')}
              disabled={savingWorkflow != null}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingWorkflow === 'pre_first_pitch' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {savingWorkflow === 'pre_first_pitch' ? 'Saving pre-first-pitch snapshot...' : 'Save Pre-First-Pitch Snapshot'}
            </button>
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-500/20 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-400 hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh board now
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>Date: {data.targetDate}</span>
          <span>Generated: {lastUpdated ?? '--'}</span>
          <span>Locked: {lockedAtLabel ?? '--'}</span>
          <span>Model trained: {data.modelTrainedAt ? new Date(data.modelTrainedAt).toLocaleString() : '--'}</span>
          <span>Training rows: {data.trainingExampleCount}</span>
          {saveStatus === 'saved' && (
            <span className="text-emerald-300">
              {lastSavedWorkflow ?? 'Official snapshot'} saved
              {lastSavedNotePath ? ` and note exported to ${lastSavedNotePath}` : ''}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-rose-300">Failed to save official boards</span>
          )}
        </div>

        {showGlossary && (
          <div className="rounded-2xl border border-brand-500/15 bg-surface-900/70 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
                <p className="text-xs uppercase tracking-wide text-brand-300">Model board</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  This is the pure HR prediction view. It answers, "Who looks most likely to homer?"
                </p>
              </div>
              <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
                <p className="text-xs uppercase tracking-wide text-brand-300">Best board</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  This is the practical HR target view. It is still centered on HR likelihood, with odds and edge shown as context.
                </p>
              </div>
              <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
                <p className="text-xs uppercase tracking-wide text-brand-300">Edge</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  Edge is the gap between {HR_CHANCE_LABEL.toLowerCase()} and the sportsbook&apos;s implied chance. It is useful value context, but it is not the main ranking driver on the model or best boards.
                </p>
                <p className="mt-2 text-xs text-slate-500">{HR_CHANCE_INFO_TEXT}</p>
              </div>
              <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
                <p className="text-xs uppercase tracking-wide text-brand-300">Combined score</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  This is a legacy field kept for reference. It is no longer the main score used to rank the best board.
                </p>
              </div>
              <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
                <p className="text-xs uppercase tracking-wide text-brand-300">Tier</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  Tiers are grouped by home run likelihood only: Elite, Strong, Solid, then Longshot.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-400/15 p-2 text-amber-300">
              <Trophy size={18} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Top practical target</p>
              <p className="text-xl font-bold text-slate-100">{topRow?.batterName ?? '--'}</p>
              <p className="text-xs text-slate-400">
                {topRow ? `${formatProbabilityPercent(topRow.predictedProbability)} ${HR_CHANCE_LABEL} | ${formatEdge(topRow.edge)} edge` : 'No row'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-300">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Avg {HR_CHANCE_LABEL}</p>
              <p className="text-xl font-bold text-slate-100">{formatProbabilityPercent(averageProbability)}</p>
              <p className="text-xs text-slate-400">{filteredRows.length} visible targets</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-500/15 p-2 text-brand-300">
              <Target size={18} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Positive Edge Picks</p>
              <p className="text-xl font-bold text-slate-100">{positiveEdgeCount}</p>
              <p className="text-xs text-slate-400">{eliteCount} elite tier</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-500/15 p-2 text-blue-300">
              {lineupMode === 'confirmed' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Lineup pool</p>
              <p className="text-xl font-bold text-slate-100">
                {lineupMode === 'confirmed' ? data.confirmedCount : filteredRows.length}
              </p>
              <p className="text-xs text-slate-400">
                {lineupMode === 'all'
                  ? `Curated full-day pool | ${data.confirmedCount} confirmed | ${data.unconfirmedCount} projected`
                  : `${data.confirmedCount} confirmed | posted-lineup-only view`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {slateGuidance && (
        <div className={`rounded-2xl border p-4 sm:p-5 ${slateGuidance.className}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide">Slate guidance</p>
              <p className="mt-1 text-lg font-semibold">{slateGuidance.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-100/90">{slateGuidance.detail}</p>
            </div>
            <div className="rounded-xl border border-current/20 bg-black/10 px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-current/80">Recommended plays</p>
              <p className="mt-1 font-semibold">
                {data.recommendedTopPlaysMin} to {data.recommendedTopPlaysMax}
              </p>
              <p className="text-[11px] text-current/80">
                {data.shouldConsiderSkippingSlate ? 'Caution or possible skip slate' : 'Normal exposure is reasonable'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Model freshness</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            Trained through {data.trainingStartDate} onward
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Latest artifact timestamp: {data.modelTrainedAt ? new Date(data.modelTrainedAt).toLocaleString() : '--'}
          </p>
        </div>

        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Lineup mode</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {lineupMode === 'all' ? 'Curated full-day pool' : 'Confirmed-only pool'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {lineupMode === 'all'
              ? 'Includes strong projected hitters for later games before all lineups are posted'
              : 'Strict posted-lineup-only view for later confirmation-based decisions'}
          </p>
        </div>

        <div className="rounded-xl border border-surface-400 bg-surface-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Official board status</p>
          <p className="mt-1 text-sm font-semibold text-slate-100">
            {saveStatus === 'saved'
              ? `Saved at ${savedAtLabel}`
              : saveStatus === 'error'
                ? 'Save failed'
                : 'Not saved yet today'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Save the official model and best boards close to first pitch. Each save also creates a timestamped text note.
          </p>
          {saveStatus === 'saved' && lastSavedNotePath && (
            <p className="mt-2 break-all text-xs text-emerald-300">{lastSavedNotePath}</p>
          )}
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 ${oddsBanner.className}`}>
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide opacity-80">Odds status</p>
            <p className="text-sm font-semibold">{oddsBanner.title}</p>
          </div>
          <p className="text-xs opacity-90 md:max-w-2xl">{oddsBanner.detail}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-surface-400 bg-surface-800 p-4 sm:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Yesterday's results</h2>
            <p className="text-xs text-slate-500">
              Quick scoreboard for the last saved official boards on {yesterdaySnapshots.date ?? 'the previous day'}.
            </p>
          </div>
          <Link
            href="/hr-history"
            className="text-xs font-medium text-brand-300 hover:text-brand-200"
          >
            Open full history
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {([
            {
              label: 'Model board',
              accent: 'text-blue-300 border-blue-500/20 bg-blue-500/5',
              snapshot: yesterdaySnapshots.model,
            },
            {
              label: 'Best board',
              accent: 'text-amber-300 border-amber-500/20 bg-amber-500/5',
              snapshot: yesterdaySnapshots.best,
            },
          ] as const).map((item) => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.accent}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-300">
                    {item.snapshot
                      ? item.snapshot.scoredAt
                        ? `Top 5: ${item.snapshot.top5Hits ?? 0} hits | Top 10: ${item.snapshot.top10Hits ?? 0} hits`
                        : 'Snapshot saved, waiting to be scored after results are final.'
                      : 'No official snapshot saved for that board yesterday.'}
                  </p>
                </div>
                {item.snapshot?.scoredAt ? (
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                    Scored
                  </span>
                ) : item.snapshot ? (
                  <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-300">
                    Pending
                  </span>
                ) : (
                  <span className="rounded-full border border-surface-300 px-2.5 py-1 text-[11px] text-slate-400">
                    Missing
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-surface-400 bg-surface-700/80 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Top 5 hits</p>
                  <p className="mt-1 text-xl font-semibold text-slate-100">
                    {item.snapshot?.top5Hits ?? '-'}
                  </p>
                </div>
                <div className="rounded-lg border border-surface-400 bg-surface-700/80 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Top 10 hits</p>
                  <p className="mt-1 text-xl font-semibold text-slate-100">
                    {item.snapshot?.top10Hits ?? '-'}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {item.snapshot?.capturedAt
                  ? `Saved ${new Date(item.snapshot.capturedAt).toLocaleString()}`
                  : 'This board was not saved on the previous day.'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-surface-400 bg-surface-800 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Top 5 compare: model vs best</h2>
            <p className="text-xs text-slate-500">
              A quick way to see where the pure HR model agrees with the practical HR target board.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-300">
              {overlappingTopPicks.length} shared picks
            </span>
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-blue-300">
              {modelOnlyPicks.length} model-only
            </span>
            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-amber-300">
              {bestOnlyPicks.length} best-only
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_280px]">
          <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-300">Model board</p>
                <p className="text-sm text-slate-400">Best pure HR probabilities</p>
              </div>
              <Link
                href="/hr-daily-board"
                className="text-xs font-medium text-blue-300 hover:text-blue-200"
              >
                Open model board
              </Link>
            </div>
            <div className="space-y-2">
              {topModelRows.map((row) => {
                const shared = overlappingTopPicks.some((pick) => pick.batterId === row.batterId);
                return (
                  <div
                    key={`model-compare-${row.batterId}`}
                    className="flex items-center justify-between rounded-lg border border-surface-400 bg-surface-700/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-100">
                        #{row.rank} {row.batterName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getTeamAbbreviation(row.teamId)} vs {getTeamAbbreviation(row.opponentTeamId)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${getProbabilityClass(row.predictedProbability)}`}>
                        {formatProbabilityPercent(row.predictedProbability)}
                      </p>
                      <p className={`text-[11px] ${shared ? 'text-emerald-300' : 'text-blue-300'}`}>
                        {shared ? 'Also on best' : 'Model-only lean'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-300">Best board</p>
                <p className="text-sm text-slate-400">Practical HR target ranking, still led by HR likelihood</p>
              </div>
              <Link
                href="/hr-daily-board?sort=best"
                className="text-xs font-medium text-amber-300 hover:text-amber-200"
              >
                Open best board
              </Link>
            </div>
            <div className="space-y-2">
              {topBestRows.map((row) => {
                const shared = overlappingTopPicks.some((pick) => pick.batterId === row.batterId);
                return (
                  <div
                    key={`best-compare-${row.batterId}`}
                    className="flex items-center justify-between rounded-lg border border-surface-400 bg-surface-700/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-100">
                        #{row.rank} {row.batterName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatProbabilityPercent(row.predictedProbability)} {HR_CHANCE_LABEL}
                        {row.edge != null ? ` | ${formatEdge(row.edge)} edge` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${getEdgeClass(row.edge)}`}>
                        {formatEdge(row.edge)}
                      </p>
                      <p className={`text-[11px] ${shared ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {shared ? 'Also on model' : 'Same hitter, different board context'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-surface-400 bg-surface-700/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Read the gap</p>
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-lg font-semibold text-slate-100">{overlappingTopPicks.length}/5 overlap</p>
                <p className="text-xs text-slate-400">
                  Strong overlap usually means the pure likelihood view and the practical board are seeing the slate similarly.
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-blue-300">Model-only names</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {modelOnlyPicks.length > 0
                    ? `${modelOnlyPicks.map((row) => row.batterName).join(', ')} rate a little better on pure HR likelihood than they do on the practical board.`
                    : 'No major disagreements from the model side right now.'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-300">Best-only names</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {bestOnlyPicks.length > 0
                    ? `${bestOnlyPicks.map((row) => row.batterName).join(', ')} are landing a bit better on the practical board once odds and edge context are layered in.`
                    : 'The best board is mostly echoing the model right now.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-surface-400 bg-surface-800 p-4">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-400">
          <Filter size={14} />
          Dashboard controls
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-xs font-medium text-slate-400">Books</span>
          {SPORTSBOOK_OPTIONS.map((book) => {
            const isSelected = selectedSportsbooks.includes(book);
            return (
              <button
                key={book}
                onClick={() =>
                  setSelectedSportsbooks((current) =>
                    current.includes(book)
                      ? current.filter((value) => value !== book)
                      : [...current, book]
                  )
                }
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  isSelected
                    ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
                    : 'border border-surface-300 text-slate-400 hover:bg-surface-700 hover:text-slate-100'
                }`}
              >
                {book}
              </button>
            );
          })}
          {selectedSportsbooks.length > 0 && (
            <button
              onClick={() => setSelectedSportsbooks([])}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-surface-700 hover:text-slate-100"
            >
              Clear books
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {(['best', 'model', 'edge'] as SortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all sm:w-auto ${
                sortMode === mode
                  ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
                  : 'border border-transparent text-slate-400 hover:bg-surface-700 hover:text-slate-100'
              }`}
            >
              {mode === 'best' ? 'Best' : mode === 'model' ? 'Model' : 'Edge'}
            </button>
          ))}
        </div>

        <div className="hidden h-4 w-px bg-surface-300 sm:block" />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {(['all', 'confirmed'] as LineupMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setLineupMode(mode)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all sm:w-auto ${
                lineupMode === mode
                  ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
                  : 'border border-transparent text-slate-400 hover:bg-surface-700 hover:text-slate-100'
              }`}
            >
              {mode === 'all' ? 'Curated full-day' : 'Confirmed only'}
            </button>
          ))}
        </div>

        <div className="hidden h-4 w-px bg-surface-300 sm:block" />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {(['all', 'elite', 'strong', 'solid', 'longshot'] as const).map((tier) => (
            <button
              key={tier}
              onClick={() => setTierFilter(tier)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-all sm:w-auto ${
                tierFilter === tier
                  ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
                  : 'border border-transparent text-slate-400 hover:bg-surface-700 hover:text-slate-100'
              }`}
            >
              {tier === 'all'
                ? 'All tiers'
                : tier === 'elite'
                  ? 'Elite'
                  : tier === 'strong'
                    ? 'Strong'
                    : tier === 'solid'
                      ? 'Solid'
                      : 'Longshot'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowTopOnly((value) => !value)}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition-all sm:ml-auto ${
            showTopOnly
              ? 'border border-brand-500/30 bg-brand-500/15 text-brand-300'
              : 'border border-surface-300 text-slate-400 hover:bg-surface-700 hover:text-slate-100'
          }`}
        >
          {showTopOnly ? 'Showing top 5' : 'Show top 5 only'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Featured HR target cards</h2>
            <p className="text-xs text-slate-500">
              Better-looking version of the best board with the same live backend data.
            </p>
          </div>
          <span className="text-xs text-slate-500">{filteredRows.length} cards</span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-300 bg-surface-800/70 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-slate-100">{emptyState.title}</p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              {emptyState.detail}
            </p>
            <div className="mt-5 flex justify-center">
              <Link
                href={emptyState.actionHref}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-300 hover:bg-brand-500/20"
              >
                {emptyState.actionLabel}
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.slice(0, 12).map((row) => (
            <article
              key={`${row.gameId}-${row.batterId}-${sortMode}`}
              className="overflow-hidden rounded-2xl border border-surface-400 bg-surface-800"
            >
              <div
                className={`h-1 w-full ${
                  row.rank <= 3
                    ? 'bg-gradient-to-r from-amber-400/80 to-amber-400/20'
                    : row.rank <= 8
                      ? 'bg-gradient-to-r from-emerald-400/70 to-emerald-400/10'
                      : 'bg-gradient-to-r from-blue-400/50 to-blue-400/10'
                }`}
              />
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-md bg-surface-700 px-2 py-1 text-xs font-bold text-slate-300">
                        #{row.rank}
                      </span>
                      <span className={`rounded-md border px-2 py-1 text-xs font-medium ${getTierClass(row.tier)}`}>
                        {row.tier}
                      </span>
                      <span className="text-xs text-slate-500">
                        {row.lineupConfirmed ? 'Confirmed' : 'Projected'}
                      </span>
                    </div>
                    <Link
                      href={buildPlayerResearchHref(row)}
                      className="inline-flex max-w-full items-center gap-1 truncate text-lg font-semibold text-slate-100 hover:text-brand-300"
                    >
                      <span className="truncate">{row.batterName}</span>
                      <ArrowUpRight size={14} className="shrink-0" />
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
                      <span>{getTeamAbbreviation(row.teamId)}</span>
                      {row.batterPosition && (
                        <>
                          <span className="text-slate-600">|</span>
                          <span>{row.batterPosition}</span>
                        </>
                      )}
                      {row.batterBats && (
                        <>
                          <span className="text-slate-600">|</span>
                          <span>Bats {row.batterBats}</span>
                        </>
                      )}
                      {row.lineupSpot != null && row.lineupSpot > 0 && (
                        <>
                          <span className="text-slate-600">|</span>
                          <span>#{row.lineupSpot} spot</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>
                        {getTeamAbbreviation(row.teamId)} vs {getTeamAbbreviation(row.opponentTeamId)}
                      </span>
                      {row.gameTime && (
                        <>
                          <span>|</span>
                          <span>{row.gameTime}</span>
                        </>
                      )}
                      {row.ballparkName && (
                        <>
                          <span>|</span>
                          <span>{row.ballparkName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-2xl font-bold ${getProbabilityClass(row.predictedProbability)}`}>
                      {formatProbabilityPercent(row.predictedProbability)}
                    </p>
                    <p className="text-xs text-slate-500">{HR_CHANCE_LABEL}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-400 bg-surface-700 px-3 py-2">
                  <span className="text-xs text-slate-500">Matchup</span>
                  <span className="text-sm font-medium text-slate-100">
                    {row.opposingPitcherName ?? 'TBD pitcher'}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-medium ${getThrowsBadgeClass(
                      row.opposingPitcherThrows
                    )}`}
                  >
                    {row.opposingPitcherThrows ? `${row.opposingPitcherThrows}HP` : 'TBD'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-700 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Odds</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {formatAmericanOdds(row.sportsbookOddsAmerican)}
                    </p>
                    <p className="text-[11px] text-slate-500">{row.sportsbook ?? 'No book'}</p>
                  </div>
                  <div className="rounded-xl bg-surface-700 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Edge</p>
                    <p className={`mt-1 text-sm font-semibold ${getEdgeClass(row.edge)}`}>
                      {formatEdge(row.edge)}
                    </p>
                    <p className="text-[11px] text-slate-500">vs implied</p>
                  </div>
                  <div className="rounded-xl bg-surface-700 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Combined score</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {formatCombinedScore(row.combinedScore)}
                    </p>
                    <p className="text-[11px] text-slate-500">legacy field</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Barrel%</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {row.features.barrelRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">ISO</p>
                    <p className="text-sm font-semibold text-slate-100">{row.features.iso.toFixed(3)}</p>
                  </div>
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Pitcher HR/9</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {row.features.pitcherHr9.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Last 7 HR</p>
                    <p className="text-sm font-semibold text-slate-100">{row.features.last7HR}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Proj AB</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {row.features.projectedAtBats.toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Park</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {row.features.parkHrFactor.toFixed(2)}x
                    </p>
                  </div>
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Recent HR%</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {(row.features.recentGamesWithHR * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-surface-400 bg-surface-700 px-3 py-2">
                    <p className="text-[11px] text-slate-500">Power</p>
                    <p className="text-sm font-semibold text-slate-100">
                      {row.features.recentPowerScore.toFixed(0)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                    <Flame size={12} />
                    Why this HR target
                  </div>
                  <p className="mb-3 text-sm leading-relaxed text-slate-300">
                    {buildBetPerspective(row)}
                  </p>
                  <ul className="space-y-2">
                    {row.reasons.slice(0, 4).map((reason, index) => (
                      <li key={`${row.batterId}-reason-${index}`} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="mt-1 text-brand-300">-</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-surface-400 bg-surface-800">
        <div className="flex items-center justify-between border-b border-surface-400 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Decision table</h2>
            <p className="text-xs text-slate-500">
              Same board data, but with a cleaner scan for future hosted use.
            </p>
          </div>
          <span className="text-xs text-slate-500">{filteredRows.length} visible rows</span>
        </div>

        <div className="space-y-3 p-4 lg:hidden">
          {filteredRows.slice(0, 10).map((row) => (
            <div
              key={`${row.gameId}-${row.batterId}-mobile-summary`}
              className="rounded-xl border border-surface-400 bg-surface-700/70 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    #{row.rank} {row.batterName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {getTeamAbbreviation(row.teamId)} vs {getTeamAbbreviation(row.opponentTeamId)}
                  </p>
                </div>
                <span className={`rounded-md border px-2 py-1 text-[11px] font-medium ${getTierClass(row.tier)}`}>
                  {row.tier}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-surface-800 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{HR_CHANCE_LABEL}</p>
                  <p className={`font-semibold ${getProbabilityClass(row.predictedProbability)}`}>
                    {formatProbabilityPercent(row.predictedProbability)}
                  </p>
                </div>
                <div className="rounded-lg bg-surface-800 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Edge</p>
                  <p className={`font-semibold ${getEdgeClass(row.edge)}`}>{formatEdge(row.edge)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-700 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3" title={HR_CHANCE_INFO_TEXT}>{HR_CHANCE_LABEL}</th>
                <th className="px-4 py-3">Odds</th>
                <th className="px-4 py-3">Edge</th>
                <th className="px-4 py-3">Combined (Legacy)</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Lineup</th>
                <th className="px-4 py-3">Book</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`${row.gameId}-${row.batterId}-table`} className="border-t border-surface-400/70">
                  <td className="px-4 py-3 font-mono text-slate-400">{row.rank}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-100">{row.batterName}</p>
                      <p className="text-xs text-slate-500">
                        {getTeamAbbreviation(row.teamId)} vs {getTeamAbbreviation(row.opponentTeamId)}
                      </p>
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${getProbabilityClass(row.predictedProbability)}`}>
                    {formatProbabilityPercent(row.predictedProbability)}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{formatAmericanOdds(row.sportsbookOddsAmerican)}</td>
                  <td className={`px-4 py-3 font-medium ${getEdgeClass(row.edge)}`}>{formatEdge(row.edge)}</td>
                  <td className="px-4 py-3 text-slate-100">{formatCombinedScore(row.combinedScore)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md border px-2 py-1 text-xs font-medium ${getTierClass(row.tier)}`}>
                      {row.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.lineupConfirmed ? 'Confirmed' : 'Projected'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{row.sportsbook ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
