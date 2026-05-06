'use client';
import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

import type { HRProjection, Batter, Pitcher, Game, Ballpark, Team } from '@/types';
import {
  getConfidenceTierBg, getProbabilityColor, getPlatoonLabel,
  getPlatoonColor, formatAvg, getBarrelRateColor, getExitVeloColor,
  getParkFactorColor
} from '@/lib/hrProjectionEngine';
import { formatAwayHomeMatchup } from '@/services/gamePresentation';

interface TopTargetsTableProps {
  projections: HRProjection[];
  batters: Record<string, Batter>;
  pitchers: Record<string, Pitcher>;
  games: Record<string, Game>;
  ballparks: Record<string, Ballpark>;
  teams: Record<string, Team>;
}

type SortKey = 'hrProbability' | 'matchupScore' | 'barrelRate' | 'exitVelo' | 'iso' | 'parkFactor' | 'last7hr';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'hrProbability', label: 'HR Prob', width: 'w-20' },
  { key: 'matchupScore', label: 'Matchup', width: 'w-20' },
  { key: 'barrelRate', label: 'Barrel%', width: 'w-20' },
  { key: 'exitVelo', label: 'Exit Velo', width: 'w-22' },
  { key: 'iso', label: 'ISO', width: 'w-16' },
  { key: 'parkFactor', label: 'Park', width: 'w-16' },
  { key: 'last7hr', label: 'HR/7d', width: 'w-16' },
];

export default function TopTargetsTable({ projections, batters, pitchers, games, ballparks, teams }: TopTargetsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('hrProbability');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function getSortValue(proj: HRProjection, key: SortKey): number {
    const batter = batters[proj.batterId];
    const ballpark = ballparks[proj.ballparkId];
    switch (key) {
      case 'hrProbability': return proj.hrProbability;
      case 'matchupScore': return proj.matchupScore;
      case 'barrelRate': return batter?.statcast?.barrelRate ?? 0;
      case 'exitVelo': return batter?.statcast?.exitVelocityAvg ?? 0;
      case 'iso': return batter?.season?.iso ?? 0;
      case 'parkFactor': return ballpark?.hrFactor ?? 1;
      case 'last7hr': return batter?.last7?.hr ?? 0;
    }
  }

  const sorted = [...projections].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-slate-600" />;
    return sortDir === 'desc' ? <ChevronDown size={12} className="text-brand-400" /> : <ChevronUp size={12} className="text-brand-400" />;
  }

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">All Projections</h2>
          <p className="text-xs text-slate-500 mt-0.5">Apr 4, 2026 — click column headers to sort</p>
        </div>
        <span className="text-xs text-slate-500 font-mono-stat">{projections.length} targets</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-400 bg-surface-600">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-36">Batter</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-32">Matchup</th>
              {COLUMNS.map(col => (
                <th
                  key={`th-${col.key}`}
                  className={`px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-slate-200 transition-colors ${col.width} ${sortKey === col.key ? 'text-brand-400' : 'text-slate-400'}`}
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center justify-end gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </div>
                </th>
              ))}
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-20">Tier</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-28">Platoon</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((proj, idx) => {
              const batter = batters[proj.batterId];
              const pitcher = proj.opposingPitcherId ? (pitchers[proj.opposingPitcherId] ?? null) : null;
              const game = games[proj.gameId] ?? null;
              const ballpark = proj.ballparkId ? (ballparks[proj.ballparkId] ?? null) : null;
              const team = teams[batter?.teamId ?? ''];
              const oppTeamId = game
                ? (game.awayTeamId === batter?.teamId ? game.homeTeamId : game.awayTeamId)
                : '';
              const oppTeam = teams[oppTeamId ?? ''];
              const matchupLabel = game ? formatAwayHomeMatchup(game.awayTeamId, game.homeTeamId) : null;

              if (!batter) return null;

              const barrelRate = batter.statcast?.barrelRate ?? 0;
              const exitVeloAvg = batter.statcast?.exitVelocityAvg ?? 0;
              const iso = batter.season?.iso ?? 0;
              const last7HR = batter.last7?.hr ?? 0;

              return (
                <tr
                  key={`table-row-${proj.id}`}
                  className={`border-b border-surface-400 hover:bg-surface-600 transition-colors duration-100 ${idx % 2 === 0 ? 'bg-surface-700' : 'bg-surface-800'}`}
                >
                  <td className="px-4 py-3 text-xs font-mono-stat text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{batter.name}</p>
                      <p className="text-xs text-slate-500">{team?.abbreviation ?? '—'} · {batter.position} · #{batter.lineupSpot ?? '?'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      {pitcher ? (
                        <>
                          <p className="text-xs text-slate-300">vs {pitcher.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-xs px-1 py-0.5 rounded ${pitcher.throws === 'L' ? 'bg-blue-400/10 text-blue-400' : 'bg-orange-400/10 text-orange-400'}`}>{pitcher.throws}HP</span>
                            {oppTeam && <span className="text-xs text-slate-500">{matchupLabel ?? oppTeam.abbreviation}</span>}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500 italic">TBD</p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-bold font-mono-stat ${getProbabilityColor(proj.hrProbability)}`}>
                      {proj.hrProbability.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm font-mono-stat text-slate-300">{proj.matchupScore}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-mono-stat ${getBarrelRateColor(barrelRate)}`}>
                      {barrelRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-mono-stat ${getExitVeloColor(exitVeloAvg)}`}>
                      {exitVeloAvg.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm font-mono-stat text-slate-300">{formatAvg(iso)}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-mono-stat ${getParkFactorColor(ballpark?.hrFactor ?? 1)}`}>
                      {ballpark?.hrFactor != null ? ballpark.hrFactor.toFixed(2) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-sm font-bold font-mono-stat ${last7HR >= 2 ? 'text-amber-400' : 'text-slate-300'}`}>
                      {last7HR}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${getConfidenceTierBg(proj.confidenceTier)}`}>
                      {proj.confidenceTier.charAt(0).toUpperCase() + proj.confidenceTier.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${getPlatoonColor(proj.platoonAdvantage)}`}>
                      {getPlatoonLabel(proj.platoonAdvantage)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-500">No projections match the current filters.</div>
        )}
      </div>
    </div>
  );
}
