'use client';
import React, { useState } from 'react';
import { CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { GameLineup, LineupPlayer, LineupStatus } from '@/services/lineupService';
import Icon from '@/components/ui/AppIcon';


interface LineupStatusPanelProps {
  lineup: GameLineup | null;
  awayAbbr: string;
  homeAbbr: string;
}

const STATUS_CONFIG: Record<LineupStatus, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  confirmed: {
    icon: CheckCircle,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10 border-emerald-400/20',
    label: 'Confirmed',
  },
  projected: {
    icon: Clock,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10 border-amber-400/20',
    label: 'Projected',
  },
  unavailable: {
    icon: AlertCircle,
    color: 'text-slate-500',
    bg: 'bg-surface-500 border-surface-300',
    label: 'Unavailable',
  },
};

function StatusChip({ status, abbr }: { status: LineupStatus; abbr: string }) {
  const { icon: Icon, color, bg, label } = STATUS_CONFIG[status];
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${bg}`}>
      <Icon size={11} className={color} />
      <span className="text-xs font-semibold text-slate-300">{abbr}</span>
      <span className={`text-xs ${color}`}>{label}</span>
    </div>
  );
}

function BatSidePip({ side }: { side: 'L' | 'R' | 'S' }) {
  const colors: Record<string, string> = {
    L: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    R: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    S: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  };
  return (
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold border ${colors[side] ?? colors.R} flex-shrink-0`}>
      {side}
    </span>
  );
}

function LineupList({ players, abbr }: { players: LineupPlayer[]; abbr: string }) {
  if (players.length === 0) {
    return (
      <div className="text-xs text-slate-500 italic py-1 px-1">Lineup not yet available</div>
    );
  }

  return (
    <div className="space-y-0.5">
      {players.map(p => (
        <div key={p.id} className="flex items-center gap-1.5 py-0.5">
          <span className="text-[10px] font-mono-stat text-slate-600 w-3 flex-shrink-0">{p.battingOrder}</span>
          <BatSidePip side={p.batSide} />
          <span className="text-xs text-slate-300 truncate flex-1">{p.fullName}</span>
          <span className="text-[10px] text-slate-500 flex-shrink-0 font-medium">{p.position}</span>
        </div>
      ))}
    </div>
  );
}

export default function LineupStatusPanel({ lineup, awayAbbr, homeAbbr }: LineupStatusPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const awayStatus: LineupStatus = lineup?.away.status ?? 'unavailable';
  const homeStatus: LineupStatus = lineup?.home.status ?? 'unavailable';
  const awayPlayers = lineup?.away.players ?? [];
  const homePlayers = lineup?.home.players ?? [];

  const hasAnyLineup = awayPlayers.length > 0 || homePlayers.length > 0;

  return (
    <div className="bg-surface-600 border border-surface-300 rounded-lg overflow-hidden mt-3">
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lineups</p>
        <div className="flex items-center gap-1.5">
          <StatusChip status={awayStatus} abbr={awayAbbr} />
          <span className="text-slate-600 text-[10px]">vs</span>
          <StatusChip status={homeStatus} abbr={homeAbbr} />
          {hasAnyLineup && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="ml-1 flex items-center gap-0.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              aria-label={expanded ? 'Collapse lineup' : 'Expand lineup'}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded batting orders */}
      {expanded && hasAnyLineup && (
        <div className="border-t border-surface-300 px-3 py-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{awayAbbr} Batting Order</p>
            <LineupList players={awayPlayers} abbr={awayAbbr} />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{homeAbbr} Batting Order</p>
            <LineupList players={homePlayers} abbr={homeAbbr} />
          </div>
        </div>
      )}

      {/* Fallback when truly unavailable for both */}
      {!hasAnyLineup && (
        <div className="border-t border-surface-300 px-3 py-2">
          <p className="text-xs text-slate-500 italic">Lineups not yet posted for this game.</p>
        </div>
      )}
    </div>
  );
}