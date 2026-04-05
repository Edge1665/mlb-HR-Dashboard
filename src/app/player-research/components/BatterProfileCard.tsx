import React from 'react';
import Badge from '@/components/ui/Badge';
import StatPill from '@/components/ui/StatPill';
import type { Batter } from '@/types';
import { TEAMS } from '@/data/mockData';
import { formatAvg, getBarrelRateColor, getExitVeloColor } from '@/lib/hrProjectionEngine';

interface BatterProfileCardProps {
  batter: Batter;
}

export default function BatterProfileCard({ batter }: BatterProfileCardProps) {
  const team = TEAMS[batter.teamId];

  const formTrend = batter.last7.ops > batter.last30.ops ? 'hot' : batter.last7.ops < batter.last30.ops - 0.08 ? 'cold' : 'neutral';

  return (
    <div className="card-base rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-surface-500 to-surface-700 p-5 border-b border-surface-400">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ backgroundColor: (team?.logoColor ?? '#1e3a5f') + '30', border: `1px solid ${team?.logoColor ?? '#334155'}40`, color: team?.logoColor ?? '#94a3b8' }}>
            {batter.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-100">{batter.name}</h2>
                <p className="text-sm text-slate-400">{team?.city} {team?.name} · #{batter.jerseyNumber} · {batter.position} · Age {batter.age}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={batter.bats === 'L' ? 'info' : batter.bats === 'R' ? 'warning' : 'purple'}>
                  Bats {batter.bats}
                </Badge>
                {batter.lineupSpot && (
                  <Badge variant="default">#{batter.lineupSpot} Lineup</Badge>
                )}
                {formTrend === 'hot' && <Badge variant="warning">🔥 Hot</Badge>}
                {formTrend === 'cold' && <Badge variant="info">🧊 Cold</Badge>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* 2026 Season stats */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">2026 Season — {batter.season.games} G</p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {[
              { label: 'AVG', value: formatAvg(batter.season.avg), color: batter.season.avg >= 0.280 ? 'text-emerald-400' : batter.season.avg < 0.220 ? 'text-red-400' : 'text-slate-200' },
              { label: 'OBP', value: formatAvg(batter.season.obp), color: 'text-slate-200' },
              { label: 'SLG', value: formatAvg(batter.season.slg), color: batter.season.slg >= 0.520 ? 'text-amber-400' : 'text-slate-200' },
              { label: 'OPS', value: batter.season.ops.toFixed(3), color: batter.season.ops >= 0.900 ? 'text-amber-400' : batter.season.ops >= 0.800 ? 'text-emerald-400' : 'text-slate-200' },
              { label: 'HR', value: batter.season.hr.toString(), color: batter.season.hr >= 4 ? 'text-amber-400' : 'text-slate-200' },
              { label: 'RBI', value: batter.season.rbi.toString(), color: 'text-slate-200' },
              { label: 'ISO', value: formatAvg(batter.season.iso), color: batter.season.iso >= 0.250 ? 'text-amber-400' : 'text-slate-200' },
              { label: 'G', value: batter.season.games.toString(), color: 'text-slate-400' },
            ].map(s => (
              <StatPill key={`season-stat-${s.label}`} label={s.label} value={s.value} valueColor={s.color} size="xs" />
            ))}
          </div>
        </div>

        {/* Statcast metrics */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Statcast Metrics</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Barrel Rate', value: `${batter.statcast.barrelRate.toFixed(1)}%`, color: getBarrelRateColor(batter.statcast.barrelRate), max: 25, raw: batter.statcast.barrelRate, barColor: 'bg-amber-400' },
              { label: 'Exit Velocity', value: `${batter.statcast.exitVelocityAvg.toFixed(1)} mph`, color: getExitVeloColor(batter.statcast.exitVelocityAvg), max: 98, raw: batter.statcast.exitVelocityAvg, barColor: 'bg-brand-400' },
              { label: 'Launch Angle', value: `${batter.statcast.launchAngleAvg.toFixed(1)}°`, color: batter.statcast.launchAngleAvg >= 15 && batter.statcast.launchAngleAvg <= 30 ? 'text-emerald-400' : 'text-slate-300', max: 30, raw: batter.statcast.launchAngleAvg, barColor: 'bg-emerald-400' },
              { label: 'Hard Hit%', value: `${batter.statcast.hardHitRate.toFixed(1)}%`, color: batter.statcast.hardHitRate >= 50 ? 'text-amber-400' : 'text-slate-300', max: 65, raw: batter.statcast.hardHitRate, barColor: 'bg-orange-400' },
              { label: 'xSLG', value: formatAvg(batter.statcast.xSlugging), color: batter.statcast.xSlugging >= 0.520 ? 'text-amber-400' : 'text-slate-300', max: 0.7, raw: batter.statcast.xSlugging, barColor: 'bg-purple-400' },
              { label: 'xwOBA', value: batter.statcast.xwOBA.toFixed(3), color: batter.statcast.xwOBA >= 0.380 ? 'text-emerald-400' : 'text-slate-300', max: 0.5, raw: batter.statcast.xwOBA, barColor: 'bg-blue-400' },
            ].map(m => (
              <div key={`statcast-${m.label}`} className="bg-surface-600 border border-surface-300 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">{m.label}</span>
                  <span className={`text-sm font-bold font-mono-stat ${m.color}`}>{m.value}</span>
                </div>
                <div className="h-1.5 w-full bg-surface-400 rounded-full">
                  <div
                    className={`h-1.5 rounded-full ${m.barColor}`}
                    style={{ width: `${Math.min(100, (m.raw / m.max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent form */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Form</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Last 7', hr: batter.last7.hr, avg: batter.last7.avg, ops: batter.last7.ops },
              { label: 'Last 14', hr: batter.last14.hr, avg: batter.last14.avg, ops: batter.last14.ops },
              { label: 'Last 30', hr: batter.last30.hr, avg: batter.last30.avg, ops: batter.last30.ops },
            ].map(f => (
              <div key={`form-${f.label}`} className="bg-surface-600 border border-surface-300 rounded-lg p-3 text-center">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">{f.label}</p>
                <p className={`text-lg font-bold font-mono-stat ${f.hr >= 2 ? 'text-amber-400' : 'text-slate-200'}`}>{f.hr} HR</p>
                <p className="text-xs font-mono-stat text-slate-400">{formatAvg(f.avg)} AVG</p>
                <p className="text-xs font-mono-stat text-slate-500">{f.ops.toFixed(3)} OPS</p>
              </div>
            ))}
          </div>
        </div>

        {/* Platoon splits */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Platoon Splits (2025)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-400">
                  {['Split', 'PA', 'AVG', 'OBP', 'SLG', 'HR'].map(h => (
                    <th key={`split-th-${h}`} className="text-left px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'vs LHP', data: batter.splits.vsLeft },
                  { label: 'vs RHP', data: batter.splits.vsRight },
                ].map(row => (
                  <tr key={`split-row-${row.label}`} className="border-b border-surface-400 hover:bg-surface-600 transition-colors">
                    <td className="px-2 py-2 text-xs font-semibold text-slate-300">{row.label}</td>
                    <td className="px-2 py-2 text-xs font-mono-stat text-slate-400">{row.data.pa}</td>
                    <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{formatAvg(row.data.avg)}</td>
                    <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{formatAvg(row.data.obp)}</td>
                    <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{formatAvg(row.data.slg)}</td>
                    <td className="px-2 py-2 text-xs font-bold font-mono-stat text-amber-400">{row.data.hr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}