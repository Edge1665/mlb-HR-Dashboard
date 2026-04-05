'use client';
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import StatPill from '@/components/ui/StatPill';
import type { FullPlayerProfile, PlayerSeasonStats, PlayerSplitStats, RecentFormSummary } from '@/services/playerResearchApi';

interface RealBatterProfileProps {
  playerId: number;
}

function formatAvg(val: number): string {
  if (!val || isNaN(val)) return '.000';
  return val.toFixed(3).replace(/^0/, '');
}

function getOpsColor(ops: number): string {
  if (ops >= 0.900) return 'text-amber-400';
  if (ops >= 0.800) return 'text-emerald-400';
  if (ops >= 0.700) return 'text-slate-200';
  return 'text-red-400';
}

function getAvgColor(avg: number): string {
  if (avg >= 0.280) return 'text-emerald-400';
  if (avg < 0.220) return 'text-red-400';
  return 'text-slate-200';
}

export default function RealBatterProfile({ playerId }: RealBatterProfileProps) {
  const [profile, setProfile] = useState<FullPlayerProfile | null>(null);
  const [stats, setStats] = useState<PlayerSeasonStats | null>(null);
  const [splits, setSplits] = useState<PlayerSplitStats | null>(null);
  const [form5, setForm5] = useState<RecentFormSummary | null>(null);
  const [form10, setForm10] = useState<RecentFormSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setProfile(null);
    setStats(null);
    setSplits(null);
    setForm5(null);
    setForm10(null);

    fetch(`/api/player-profile?id=${playerId}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data.profile ?? null);
        setStats(data.stats ?? null);
        setSplits(data.splits ?? null);
        setForm5(data.form5 ?? null);
        setForm10(data.form10 ?? null);
        if (!data.profile) setError('Player data unavailable');
      })
      .catch(() => setError('Failed to load player data'))
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return (
      <div className="card-base rounded-xl flex items-center justify-center min-h-64">
        <div className="text-center">
          <Loader2 size={24} className="mx-auto text-brand-400 animate-spin mb-2" />
          <p className="text-sm text-slate-500">Loading player data...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="card-base rounded-xl flex items-center justify-center min-h-64">
        <div className="text-center">
          <p className="text-sm text-slate-400">{error ?? 'Player not found'}</p>
        </div>
      </div>
    );
  }

  const batSideVariant = profile.batSide === 'L' ? 'info' : profile.batSide === 'R' ? 'warning' : 'purple';
  const initials = profile.fullName.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="card-base rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-surface-500 to-surface-700 p-5 border-b border-surface-400">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 bg-brand-500/20 border border-brand-500/30 text-brand-300">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-slate-100">{profile.fullName}</h2>
                <p className="text-sm text-slate-400">
                  {profile.currentTeam}
                  {profile.jerseyNumber ? ` · #${profile.jerseyNumber}` : ''}
                  {profile.primaryPosition ? ` · ${profile.primaryPosition}` : ''}
                  {profile.age ? ` · Age ${profile.age}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={batSideVariant}>Bats {profile.batSide}</Badge>
                {profile.height && <Badge variant="default">{profile.height}</Badge>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Season stats */}
        {stats ? (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {new Date().getFullYear()} Season — {stats.gamesPlayed} G
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {[
                { label: 'AVG', value: formatAvg(stats.avg), color: getAvgColor(stats.avg) },
                { label: 'OBP', value: formatAvg(stats.obp), color: 'text-slate-200' },
                { label: 'SLG', value: formatAvg(stats.slg), color: stats.slg >= 0.520 ? 'text-amber-400' : 'text-slate-200' },
                { label: 'OPS', value: stats.ops.toFixed(3), color: getOpsColor(stats.ops) },
                { label: 'HR', value: stats.homeRuns.toString(), color: stats.homeRuns >= 10 ? 'text-amber-400' : 'text-slate-200' },
                { label: 'RBI', value: stats.rbi.toString(), color: 'text-slate-200' },
                { label: 'BB', value: stats.baseOnBalls.toString(), color: 'text-slate-400' },
                { label: 'K', value: stats.strikeOuts.toString(), color: 'text-slate-400' },
              ].map(s => (
                <StatPill key={`season-${s.label}`} label={s.label} value={s.value} valueColor={s.color} size="xs" />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-500">No season stats available yet</p>
          </div>
        )}

        {/* Recent form: last 5 and last 10 */}
        {(form5 || form10) && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Recent Form</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Last 5 Games', data: form5 },
                { label: 'Last 10 Games', data: form10 },
              ].map(f => (
                f.data && f.data.games > 0 ? (
                  <div key={f.label} className="bg-surface-600 border border-surface-300 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2">{f.label}</p>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div>
                        <p className="text-xs text-slate-500">AVG</p>
                        <p className={`text-sm font-bold font-mono-stat ${getAvgColor(f.data.avg)}`}>{formatAvg(f.data.avg)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">HR</p>
                        <p className={`text-sm font-bold font-mono-stat ${f.data.homeRuns >= 2 ? 'text-amber-400' : 'text-slate-200'}`}>{f.data.homeRuns}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">RBI</p>
                        <p className="text-sm font-bold font-mono-stat text-slate-200">{f.data.rbi}</p>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-surface-400 flex justify-between items-center">
                      <span className="text-xs text-slate-500">{f.data.hits}/{f.data.atBats} H/AB</span>
                      <span className={`text-xs font-bold font-mono-stat ${getOpsColor(f.data.ops)}`}>{f.data.ops.toFixed(3)} OPS</span>
                    </div>
                  </div>
                ) : (
                  <div key={f.label} className="bg-surface-600 border border-surface-300 rounded-lg p-3 flex items-center justify-center">
                    <p className="text-xs text-slate-600">{f.label} — no data</p>
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Platoon splits */}
        {splits && (splits.vsLeft || splits.vsRight) ? (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Platoon Splits ({new Date().getFullYear()})
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-400">
                    {['Split', 'PA', 'AVG', 'OBP', 'SLG', 'OPS', 'HR'].map(h => (
                      <th key={`split-th-${h}`} className="text-left px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'vs LHP', data: splits.vsLeft },
                    { label: 'vs RHP', data: splits.vsRight },
                  ].map(row => (
                    row.data ? (
                      <tr key={`split-${row.label}`} className="border-b border-surface-400 hover:bg-surface-600 transition-colors">
                        <td className="px-2 py-2 text-xs font-semibold text-slate-300">{row.label}</td>
                        <td className="px-2 py-2 text-xs font-mono-stat text-slate-400">{row.data.plateAppearances}</td>
                        <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{formatAvg(row.data.avg)}</td>
                        <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{formatAvg(row.data.obp)}</td>
                        <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{formatAvg(row.data.slg)}</td>
                        <td className="px-2 py-2 text-xs font-mono-stat text-slate-200">{row.data.ops.toFixed(3)}</td>
                        <td className="px-2 py-2 text-xs font-bold font-mono-stat text-amber-400">{row.data.homeRuns}</td>
                      </tr>
                    ) : (
                      <tr key={`split-${row.label}`} className="border-b border-surface-400">
                        <td className="px-2 py-2 text-xs font-semibold text-slate-300">{row.label}</td>
                        <td colSpan={6} className="px-2 py-2 text-xs text-slate-600">No data available</td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : stats ? (
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">Platoon splits not yet available for this season</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
