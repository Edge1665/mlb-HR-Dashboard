import React from 'react';
import type { Pitcher, Team } from '@/types';

interface ProbablePitcherPanelProps {
  pitcher: Pitcher;
  team: Team;
  side: 'away' | 'home';
}

export default function ProbablePitcherPanel({ pitcher, team, side }: ProbablePitcherPanelProps) {
  const hr9Color =
    pitcher.hr9 >= 1.4 ? 'text-red-400' :
    pitcher.hr9 >= 1.0 ? 'text-amber-400' :
    pitcher.hr9 <= 0.7 ? 'text-emerald-400' : 'text-slate-300';

  const hrFbColor =
    pitcher.hrFbRate >= 0.13 ? 'text-red-400' :
    pitcher.hrFbRate >= 0.10 ? 'text-amber-400' :
    pitcher.hrFbRate <= 0.08 ? 'text-emerald-400' : 'text-slate-300';

  const eraColor =
    pitcher.era >= 4.5 ? 'text-red-400' :
    pitcher.era >= 3.5 ? 'text-amber-400' :
    pitcher.era <= 2.8 ? 'text-emerald-400' : 'text-slate-300';

  return (
    <div className="bg-surface-600 border border-surface-300 rounded-lg p-3 flex-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{side === 'away' ? 'Away' : 'Home'} SP</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pitcher.throws === 'L' ? 'bg-blue-400/10 text-blue-400' : 'bg-orange-400/10 text-orange-400'}`}>
          {pitcher.throws}HP
        </span>
      </div>

      <div className="mb-2.5">
        <p className="text-sm font-semibold text-slate-100 leading-tight">{pitcher.name}</p>
        <p className="text-xs text-slate-500">{team.abbreviation} · {pitcher.season.gamesStarted} GS · {pitcher.season.innings} IP</p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="text-center">
          <p className="text-xs text-slate-500">ERA</p>
          <p className={`text-sm font-bold font-mono-stat ${eraColor}`}>{pitcher.era.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">HR/9</p>
          <p className={`text-sm font-bold font-mono-stat ${hr9Color}`}>{pitcher.hr9.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">HR/FB</p>
          <p className={`text-sm font-bold font-mono-stat ${hrFbColor}`}>{(pitcher.hrFbRate * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-surface-400 grid grid-cols-2 gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">K/9</span>
          <span className="text-xs font-mono-stat text-slate-300">{pitcher.kPer9.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">FB%</span>
          <span className="text-xs font-mono-stat text-slate-300">{pitcher.fbPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Velo</span>
          <span className="text-xs font-mono-stat text-slate-300">{pitcher.avgFastballVelo.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">BB/9</span>
          <span className="text-xs font-mono-stat text-slate-300">{pitcher.bbPer9.toFixed(1)}</span>
        </div>
      </div>

      {/* Last 7 ERA vs season comparison */}
      <div className="mt-2 pt-2 border-t border-surface-400 flex items-center justify-between">
        <span className="text-xs text-slate-500">L7 ERA</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold font-mono-stat ${pitcher.last7.era < pitcher.era ? 'text-emerald-400' : 'text-red-400'}`}>
            {pitcher.last7.era.toFixed(2)}
          </span>
          <span className={`text-xs ${pitcher.last7.era < pitcher.era ? 'text-emerald-400' : 'text-red-400'}`}>
            {pitcher.last7.era < pitcher.era ? '↓' : '↑'}
          </span>
        </div>
      </div>
    </div>
  );
}