'use client';
import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Users, CheckCircle, Clock, Loader2 } from 'lucide-react';
import DashboardSummaryBar from './DashboardSummaryBar';
import DashboardFilters from './DashboardFilters';
import ProjectionsGrid from './ProjectionsGrid';
import TopTargetsTable from './TopTargetsTable';
import type { HRProjection, Batter, Pitcher, Game, Ballpark, Team } from '@/types';

interface DashboardData {
  projections: HRProjection[];
  batters: Record<string, Batter>;
  pitchers: Record<string, Pitcher>;
  games: Record<string, Game>;
  ballparks: Record<string, Ballpark>;
  teams: Record<string, Team>;
  generatedAt?: string;
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTier, setActiveTier] = useState('all');
  const [activePlatoon, setActivePlatoon] = useState('all');
  const [showTopOnly, setShowTopOnly] = useState(false);
  const [showUnconfirmed, setShowUnconfirmed] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hr-predictions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();

      // The API route returns projections + generatedAt; batters/pitchers/games/ballparks/teams
      // are embedded in the projection objects for display — build lookup maps from projections
      // if the API doesn't return them separately.
      setData({
        projections: json.projections ?? [],
        batters: json.batters ?? {},
        pitchers: json.pitchers ?? {},
        games: json.games ?? {},
        ballparks: json.ballparks ?? {},
        teams: json.teams ?? {},
        generatedAt: json.generatedAt,
      });
    } catch (err) {
      console.error('[DashboardClient] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load predictions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const projections = data?.projections ?? [];
  const batters = data?.batters ?? {};
  const pitchers = data?.pitchers ?? {};
  const games = data?.games ?? {};
  const ballparks = data?.ballparks ?? {};
  const teams = data?.teams ?? {};

  const confirmedCount = projections.filter(p => p.lineupConfirmed !== false).length;
  const unconfirmedCount = projections.filter(p => p.lineupConfirmed === false).length;

  const filtered = projections.filter(p => {
    if (!showUnconfirmed && p.lineupConfirmed === false) return false;
    if (activeTier !== 'all' && p.confidenceTier !== activeTier) return false;
    if (activePlatoon !== 'all' && p.platoonAdvantage !== activePlatoon) return false;
    return true;
  }).slice(0, showTopOnly ? 5 : undefined);

  const lastUpdated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 size={40} className="animate-spin text-brand-400" />
        <div className="text-center">
          <p className="text-slate-200 font-medium text-lg">Loading HR Predictions…</p>
          <p className="text-slate-500 text-sm mt-1">Fetching live lineups and running Gemini analysis</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-center">
          <p className="text-red-400 font-medium text-lg">Failed to load predictions</p>
          <p className="text-slate-500 text-sm mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <DashboardSummaryBar projections={projections} batters={batters} />

      {/* Lineup status + refresh bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-surface-700 border border-surface-400 rounded-xl">
        <div className="flex items-center gap-4 flex-1 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <CheckCircle size={13} className="text-emerald-400" />
            <span className="text-slate-400">{confirmedCount} confirmed</span>
          </div>
          {unconfirmedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock size={13} className="text-amber-400" />
              <span className="text-slate-400">{unconfirmedCount} roster-based (lineup TBD)</span>
            </div>
          )}
          {lastUpdated && (
            <span className="text-xs text-slate-600">Updated {lastUpdated}</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {unconfirmedCount > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <div
                onClick={() => setShowUnconfirmed(!showUnconfirmed)}
                className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${showUnconfirmed ? 'bg-amber-500' : 'bg-surface-300'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${showUnconfirmed ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <Users size={12} />
              Show roster predictions
            </label>
          )}

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Updating…' : 'Refresh lineups'}
          </button>
        </div>
      </div>

      <DashboardFilters
        activeTier={activeTier}
        onTierChange={setActiveTier}
        activePlatoon={activePlatoon}
        onPlatoonChange={setActivePlatoon}
        showTopOnly={showTopOnly}
        onTopOnlyChange={setShowTopOnly}
      />
      <ProjectionsGrid
        projections={filtered}
        batters={batters}
        pitchers={pitchers}
        games={games}
        ballparks={ballparks}
        teams={teams}
      />
      <TopTargetsTable
        projections={filtered}
        batters={batters}
        pitchers={pitchers}
        games={games}
        ballparks={ballparks}
        teams={teams}
      />
    </>
  );
}