'use client';
import React, { useEffect, useState } from 'react';
import { Loader2, CalendarDays } from 'lucide-react';
import type { TodaysMatchup } from '@/services/playerResearchApi';

interface RealMatchupPanelProps {
  playerId: number;
  teamId: number;
  playerName: string;
}

export default function RealMatchupPanel({ playerId, teamId, playerName }: RealMatchupPanelProps) {
  const [matchup, setMatchup] = useState<TodaysMatchup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setMatchup(null);

    fetch(`/api/player-matchup?playerId=${playerId}&teamId=${teamId}`)
      .then(r => r.json())
      .then(data => {
        setMatchup(data.matchup ?? null);
      })
      .catch(() => setError('Failed to load matchup data'))
      .finally(() => setLoading(false));
  }, [playerId, teamId]);

  if (loading) {
    return (
      <div className="card-base rounded-xl flex items-center justify-center min-h-64">
        <div className="text-center">
          <Loader2 size={24} className="mx-auto text-brand-400 animate-spin mb-2" />
          <p className="text-sm text-slate-500">Loading today&apos;s matchup...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-base rounded-xl flex items-center justify-center min-h-64">
        <p className="text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  if (!matchup) {
    return (
      <div className="card-base rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-400">
          <h3 className="text-sm font-semibold text-slate-100">Today&apos;s Matchup</h3>
          <p className="text-xs text-slate-500 mt-0.5">{playerName}</p>
        </div>
        <div className="py-10 text-center px-4">
          <CalendarDays size={24} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm text-slate-400">No game scheduled today</p>
          <p className="text-xs text-slate-600 mt-1">Check back on a game day</p>
        </div>
      </div>
    );
  }

  const pitcher = matchup.probablePitcher;

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Today&apos;s Matchup</h3>
          <p className="text-xs text-slate-500 mt-0.5">{playerName}</p>
        </div>
        <span className="text-xs font-semibold text-brand-300 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded-md">
          {matchup.matchupLabel}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Game info */}
        <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-100">
                {matchup.matchupLabel}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {matchup.venueName} · {matchup.isHome ? "Home" : "Away"} side for {playerName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold font-mono-stat text-brand-300">{matchup.gameTimeET}</p>
              <p className="text-xs text-slate-500">ET</p>
            </div>
          </div>
        </div>

        {/* Probable pitcher */}
        {pitcher ? (
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Probable Pitcher</p>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="text-sm font-bold text-slate-100">{pitcher.fullName}</p>
                <p className="text-xs text-slate-500">
                  {matchup.opponentTeamAbbr} · Throws {pitcher.throwSide}
                  {pitcher.wins != null && pitcher.losses != null ? ` · ${pitcher.wins}-${pitcher.losses}` : ''}
                </p>
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${pitcher.throwSide === 'L' ? 'text-blue-300 bg-blue-500/10 border-blue-500/20' : 'text-amber-300 bg-amber-500/10 border-amber-500/20'}`}>
                {pitcher.throwSide}HP
              </span>
            </div>

            {/* Pitcher stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-surface-500 rounded-lg p-2">
                <p className="text-xs text-slate-500">ERA</p>
                <p className={`text-sm font-bold font-mono-stat ${pitcher.era != null ? (pitcher.era <= 3.0 ? 'text-emerald-400' : pitcher.era >= 4.5 ? 'text-red-400' : 'text-amber-400') : 'text-slate-500'}`}>
                  {pitcher.era != null ? pitcher.era.toFixed(2) : '—'}
                </p>
              </div>
              <div className="bg-surface-500 rounded-lg p-2">
                <p className="text-xs text-slate-500">WHIP</p>
                <p className={`text-sm font-bold font-mono-stat ${pitcher.whip != null ? (pitcher.whip <= 1.1 ? 'text-emerald-400' : pitcher.whip >= 1.4 ? 'text-red-400' : 'text-amber-400') : 'text-slate-500'}`}>
                  {pitcher.whip != null ? pitcher.whip.toFixed(2) : '—'}
                </p>
              </div>
              <div className="bg-surface-500 rounded-lg p-2">
                <p className="text-xs text-slate-500">K</p>
                <p className="text-sm font-bold font-mono-stat text-slate-200">
                  {pitcher.strikeOuts != null ? pitcher.strikeOuts : '—'}
                </p>
              </div>
            </div>

            {pitcher.inningsPitched && (
              <p className="text-xs text-slate-600 mt-2 text-center">{pitcher.inningsPitched} IP this season</p>
            )}
          </div>
        ) : (
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-500">Probable pitcher not yet announced</p>
            <p className="text-xs text-slate-600 mt-1">Check back closer to game time</p>
          </div>
        )}

        {/* Handedness matchup note */}
        {pitcher && (
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Matchup Context</p>
            <p className="text-xs text-slate-400">
              Facing a <span className={`font-semibold ${pitcher.throwSide === 'L' ? 'text-blue-300' : 'text-amber-300'}`}>{pitcher.throwSide === 'L' ? 'left-handed' : 'right-handed'}</span> pitcher today.
              {' '}Check the platoon splits above to see how this batter performs vs {pitcher.throwSide}HP.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
