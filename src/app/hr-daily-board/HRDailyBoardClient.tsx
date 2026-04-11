'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { getTeamAbbreviation } from '@/services/mlbTeamMetadata';

type SortMode = 'best' | 'model' | 'edge';
type LineupMode = 'confirmed' | 'all';

type DailyBoardRow = {
  rank: number;
  batterId: string;
  batterName: string;
  teamId: string;
  opponentTeamId: string;
  gameId: string;
  lineupConfirmed: boolean;
  predictedProbability: number;
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  edge: number | null;
  combinedScore: number | null;
  tier: string;
  sportsbook: string | null;
  reasons: string[];
};

type DailyBoardResponse = {
  ok: boolean;
  targetDate: string;
  sportsbooks: string[];
  generatedAt: string;
  trainingStartDate: string;
  trainingExampleCount: number;
  modelTrainedAt: string;
  sortMode: SortMode;
  lineupMode: LineupMode;
  confirmedCount: number;
  unconfirmedCount: number;
  rows: DailyBoardRow[];
};

type CachedBoardPayload = {
  savedAt: string;
  sort: SortMode;
  lineupMode?: LineupMode;
  sportsbooks?: string;
  data: DailyBoardResponse;
};

const RAW_BOARD_CACHE_KEY_PREFIX = 'hr-raw-board-cache-v1';

function formatAmericanOdds(odds: number | null) {
  if (odds == null) return '--';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(value: number | null) {
  if (value == null) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function formatEdge(edge: number | null) {
  if (edge == null) return '--';
  const pct = (edge * 100).toFixed(2);
  return edge >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatCombinedScore(score: number | null) {
  if (score == null) return '--';
  return score.toFixed(3);
}

function getTodayEtDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildCacheKey(sort: SortMode, lineupMode?: LineupMode, sportsbooks?: string): string {
  return `${RAW_BOARD_CACHE_KEY_PREFIX}:${sort}:${lineupMode ?? ''}:${sportsbooks ?? ''}`;
}

function readCachedBoard(
  sort: SortMode,
  lineupMode?: LineupMode,
  sportsbooks?: string
): CachedBoardPayload | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(buildCacheKey(sort, lineupMode, sportsbooks));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedBoardPayload;
    if (parsed.data?.targetDate !== getTodayEtDateString()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedBoard(payload: CachedBoardPayload) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    buildCacheKey(payload.sort, payload.lineupMode, payload.sportsbooks),
    JSON.stringify(payload)
  );
}

async function fetchDailyBoard(sort: SortMode, lineupMode?: LineupMode, sportsbooks?: string) {
  const params = new URLSearchParams({ sort });
  if (lineupMode) params.set('lineupMode', lineupMode);
  if (sportsbooks) params.set('sportsbooks', sportsbooks);

  const res = await fetch(`/api/hr-daily-board?${params.toString()}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error('Failed to load HR daily board');
  }

  return (await res.json()) as DailyBoardResponse;
}

export default function HRDailyBoardClient() {
  const searchParams = useSearchParams();
  const sort = useMemo<SortMode>(() => {
    const value = searchParams.get('sort');
    return value === 'edge' ? 'edge' : value === 'best' ? 'best' : 'model';
  }, [searchParams]);
  const lineupMode = useMemo<LineupMode | undefined>(() => {
    const value = searchParams.get('lineupMode');
    return value === 'all' ? 'all' : value === 'confirmed' ? 'confirmed' : undefined;
  }, [searchParams]);
  const sportsbooks = searchParams.get('sportsbooks') ?? undefined;

  const [data, setData] = useState<DailyBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);

  const loadBoard = useCallback(
    async (options?: { force?: boolean }) => {
      const forceRefresh = options?.force === true;
      const cached = !forceRefresh ? readCachedBoard(sort, lineupMode, sportsbooks) : null;

      if (cached) {
        setData(cached.data);
        setLockedAt(cached.savedAt);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchDailyBoard(sort, lineupMode, sportsbooks);
        const payload: CachedBoardPayload = {
          savedAt: new Date().toISOString(),
          sort,
          lineupMode,
          sportsbooks,
          data: response,
        };
        writeCachedBoard(payload);
        setData(response);
        setLockedAt(payload.savedAt);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load HR daily board');
      } finally {
        setLoading(false);
      }
    },
    [lineupMode, sort, sportsbooks]
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const handleManualRefresh = useCallback(() => {
    void loadBoard({ force: true });
  }, [loadBoard]);

  const lockedAtLabel = lockedAt
    ? new Date(lockedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
          <Loader2 size={32} className="animate-spin text-slate-300" />
          <p className="text-sm text-slate-300">Loading Daily HR Board...</p>
        </div>
      </main>
    );
  }

  if (error || !data?.ok) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="mb-4 text-2xl font-bold">Daily HR Board</h1>
        <p>{error ?? 'Failed to load board.'}</p>
        <button
          onClick={handleManualRefresh}
          className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Daily HR Board</h1>
          <p className="text-sm text-gray-300">
            Date: {data.targetDate} | Generated: {data.generatedAt}
          </p>
          <p className="text-sm text-gray-300">
            Locked: {lockedAtLabel ?? '--'} | Refreshing the page will keep this board until you manually refresh it.
          </p>
          <p className="text-sm text-gray-300">
            Training start: {data.trainingStartDate} | Training examples: {data.trainingExampleCount}
          </p>
          <p className="text-sm text-gray-300">
            Sort mode: <span className="font-semibold">{data.sortMode}</span>
          </p>
          <p className="text-sm text-gray-300">
            Lineup mode: <span className="font-semibold">{data.lineupMode}</span> | Confirmed:{' '}
            {data.confirmedCount} | Unconfirmed: {data.unconfirmedCount}
          </p>
          {Array.isArray(data.sportsbooks) && data.sportsbooks.length > 0 && (
            <p className="text-sm text-gray-300">Sportsbooks: {data.sportsbooks.join(', ')}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <a
              href="/hr-daily-board?sort=model"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Model View
            </a>
            <a
              href="/hr-daily-board?sort=edge"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Edge View
            </a>
            <a
              href="/hr-daily-board?sort=best"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Best Bets
            </a>
          </div>
          <a
            href={`/hr-daily-board?sort=${sort}&lineupMode=confirmed${sportsbooks ? `&sportsbooks=${encodeURIComponent(sportsbooks)}` : ''}`}
            className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            Confirmed Only
          </a>
          <a
            href={`/hr-daily-board?sort=${sort}&lineupMode=all${sportsbooks ? `&sportsbooks=${encodeURIComponent(sportsbooks)}` : ''}`}
            className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            Include Unconfirmed
          </a>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh board now
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border text-sm">
          <thead>
            <tr className="bg-gray-100 text-black">
              <th className="border p-2 text-left">Rank</th>
              <th className="border p-2 text-left">Opp</th>
              <th className="border p-2 text-left">Team</th>
              <th className="border p-2 text-left">Player</th>
              <th className="border p-2 text-left">Lineup</th>
              <th className="border p-2 text-left">Model</th>
              <th className="border p-2 text-left">Odds</th>
              <th className="border p-2 text-left">Implied</th>
              <th className="border p-2 text-left">Edge</th>
              <th className="border p-2 text-left">Best Score</th>
              <th className="border p-2 text-left">Tier</th>
              <th className="border p-2 text-left">Reasons</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={`${row.gameId}-${row.batterId}`}>
                <td className="border p-2">{row.rank}</td>
                <td className="border p-2">{getTeamAbbreviation(row.opponentTeamId)}</td>
                <td className="border p-2">{getTeamAbbreviation(row.teamId)}</td>
                <td className="border p-2 font-medium">{row.batterName}</td>
                <td className="border p-2">{row.lineupConfirmed ? 'Confirmed' : 'Projected'}</td>
                <td className="border p-2">{formatPercent(row.predictedProbability)}</td>
                <td className="border p-2">{formatAmericanOdds(row.sportsbookOddsAmerican)}</td>
                <td className="border p-2">{formatPercent(row.impliedProbability)}</td>
                <td className="border p-2">{formatEdge(row.edge)}</td>
                <td className="border p-2">{formatCombinedScore(row.combinedScore)}</td>
                <td className="border p-2">{row.tier}</td>
                <td className="border p-2">
                  <ul className="ml-5 list-disc">
                    {row.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {row.sportsbook && <div className="mt-2 text-xs text-gray-400">Book: {row.sportsbook}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
