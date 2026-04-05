import React from 'react';
import { CalendarDays, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import type { RealMLBGame } from '@/services/mlbApi';
import Icon from '@/components/ui/AppIcon';


interface GamesSummaryBarProps {
  games: RealMLBGame[];
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GamesSummaryBar({ games }: GamesSummaryBarProps) {
  const liveGames = games.filter(g => g.status === 'in_progress').length;
  const finalGames = games.filter(g => g.status === 'final').length;
  const pitchersConfirmed = games.filter(
    g => g.awayProbablePitcher !== null || g.homeProbablePitcher !== null
  ).length;
  const bothPitchersSet = games.filter(
    g => g.awayProbablePitcher !== null && g.homeProbablePitcher !== null
  ).length;

  const stats = [
    {
      id: 'gs-total',
      icon: CalendarDays,
      label: 'Games Today',
      value: games.length.toString(),
      sub: getTodayLabel() + ' slate',
      iconBg: 'bg-brand-500/15',
      iconColor: 'text-brand-400',
    },
    {
      id: 'gs-live',
      icon: Activity,
      label: 'Live Now',
      value: liveGames.toString(),
      sub: `${finalGames} game${finalGames !== 1 ? 's' : ''} final`,
      iconBg: 'bg-red-500/15',
      iconColor: 'text-red-400',
    },
    {
      id: 'gs-pitchers',
      icon: AlertTriangle,
      label: 'Pitchers Confirmed',
      value: pitchersConfirmed.toString(),
      sub: `${bothPitchersSet} with both starters set`,
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'gs-scheduled',
      icon: TrendingUp,
      label: 'Scheduled',
      value: games.filter(g => g.status === 'scheduled').length.toString(),
      sub: `${games.filter(g => g.status === 'delayed').length} delayed`,
      iconBg: 'bg-amber-500/15',
      iconColor: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.id} className="card-base card-hover rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className={stat.iconColor} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">{stat.label}</p>
              <p className="text-xl font-bold font-mono-stat text-slate-100 leading-tight">{stat.value}</p>
              <p className="text-xs text-slate-500 truncate" suppressHydrationWarning>{stat.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}