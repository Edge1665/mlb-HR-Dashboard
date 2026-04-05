import React from 'react';
import { Target, TrendingUp, Zap, FlaskConical } from 'lucide-react';
import type { HRProjection, Batter } from '@/types';
import Icon from '@/components/ui/AppIcon';



interface DashboardSummaryBarProps {
  projections: HRProjection[];
  batters: Record<string, Batter>;
}

export default function DashboardSummaryBar({ projections, batters }: DashboardSummaryBarProps) {
  const topPick = projections[0] ?? null;
  const topBatter = topPick ? (batters[topPick.batterId] ?? null) : null;
  const avgProb = projections.length > 0
    ? projections.reduce((s, p) => s + p.hrProbability, 0) / projections.length
    : 0;
  const eliteCount = projections.filter(p => p.confidenceTier === 'elite').length;
  const highCount = projections.filter(p => p.confidenceTier === 'high').length;

  // Safe name display — handle single-word names and missing batter
  const topBatterDisplay = (() => {
    if (!topBatter?.name) return '—';
    const parts = topBatter.name.trim().split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  })();

  const stats = [
    {
      id: 'summary-total',
      icon: Target,
      label: 'Total Projections',
      value: projections.length.toString(),
      sub: `${eliteCount} elite, ${highCount} high confidence`,
      iconBg: 'bg-brand-500/15',
      iconColor: 'text-brand-400',
    },
    {
      id: 'summary-top',
      icon: Zap,
      label: 'Top Pick Today',
      value: topBatterDisplay,
      sub: topPick ? `${topPick.hrProbability.toFixed(1)}% HR probability` : '—',
      iconBg: 'bg-amber-400/15',
      iconColor: 'text-amber-400',
    },
    {
      id: 'summary-avg',
      icon: TrendingUp,
      label: 'Avg HR Probability',
      value: `${avgProb.toFixed(1)}%`,
      sub: 'Across all projections',
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
    },
    {
      id: 'summary-model',
      icon: FlaskConical,
      label: 'Prediction Model',
      value: 'Live',
      sub: '9-factor feature model',
      iconBg: 'bg-purple-500/15',
      iconColor: 'text-purple-400',
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
              <p className="text-xs text-slate-500 truncate">{stat.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}