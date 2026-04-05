'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Home, Plane, ChevronDown, BarChart2, Activity } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import StatPill from '@/components/ui/StatPill';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import type { TeamTrendsData, TeamInfo } from '@/services/teamTrendsApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAvg(v: number): string {
  if (!v || isNaN(v)) return '.000';
  return v.toFixed(3).replace(/^0/, '');
}

function fmtRpg(v: number): string {
  return v?.toFixed(2) ?? '0.00';
}

function getOpsColor(ops: number): string {
  if (ops >= 0.800) return 'text-emerald-400';
  if (ops >= 0.700) return 'text-slate-200';
  return 'text-red-400';
}

function getAvgColor(avg: number): string {
  if (avg >= 0.270) return 'text-emerald-400';
  if (avg < 0.230) return 'text-red-400';
  return 'text-slate-200';
}

function getRpgColor(rpg: number): string {
  if (rpg >= 5.0) return 'text-emerald-400';
  if (rpg >= 4.0) return 'text-slate-200';
  return 'text-red-400';
}

// ─── Team Selector ─────────────────────────────────────────────────────────────

interface TeamSelectorProps {
  teams: TeamInfo[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function TeamSelector({ teams, selectedId, onSelect }: TeamSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = teams.find(t => t.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-surface-600 border border-surface-300 hover:border-brand-500/40 rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors min-w-[180px]"
      >
        <span className="flex-1 text-left">{selected?.name ?? 'Select a team'}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-700 border border-surface-300 rounded-xl shadow-card-hover w-64 max-h-80 overflow-y-auto">
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => { onSelect(team.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-500 ${team.id === selectedId ? 'text-brand-400 bg-brand-500/10' : 'text-slate-300'}`}
            >
              <span className="font-medium">{team.name}</span>
              <span className="text-xs text-slate-500 ml-1.5">{team.abbreviation}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, sub, valueColor = 'text-slate-100', icon }: StatCardProps) {
  return (
    <div className="card-base rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="stat-label">{label}</p>
        {icon && <div className="text-slate-500">{icon}</div>}
      </div>
      <p className={`text-2xl font-bold font-mono-stat ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Recent Games Table ────────────────────────────────────────────────────────

function RecentGamesTable({ games }: { games: TeamTrendsData['recentGames'] }) {
  if (games.length === 0) {
    return (
      <div className="card-base rounded-xl p-6 text-center">
        <p className="text-sm text-slate-500">No recent game data available</p>
      </div>
    );
  }

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center gap-2">
        <Activity size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-200">Recent Games</h3>
        <span className="text-xs text-slate-500 ml-1">Last {games.length} completed</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-400">
              {['Date', 'Opp', 'H/A', 'R', 'RA', 'H', 'Result'].map(h => (
                <th key={`rg-th-${h}`} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {games.map((g, i) => (
              <tr key={`rg-${i}`} className="border-b border-surface-400/50 hover:bg-surface-600 transition-colors">
                <td className="px-3 py-2 text-xs font-mono-stat text-slate-400 whitespace-nowrap">{g.date}</td>
                <td className="px-3 py-2 text-xs font-semibold text-slate-200">{g.opponent}</td>
                <td className="px-3 py-2">
                  <span className="text-xs text-slate-500">{g.isHome ? 'H' : 'A'}</span>
                </td>
                <td className="px-3 py-2 text-xs font-bold font-mono-stat text-slate-100">{g.runsScored}</td>
                <td className="px-3 py-2 text-xs font-mono-stat text-slate-400">{g.runsAllowed}</td>
                <td className="px-3 py-2 text-xs font-mono-stat text-slate-300">{g.hits > 0 ? g.hits : '—'}</td>
                <td className="px-3 py-2">
                  <Badge variant={g.result === 'W' ? 'success' : 'danger'} size="sm">{g.result}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Recent Form Summary ───────────────────────────────────────────────────────

function RecentFormSection({ last5, last10 }: { last5: TeamTrendsData['last5']; last10: TeamTrendsData['last10'] }) {
  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center gap-2">
        <TrendingUp size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-200">Offensive Form</h3>
      </div>
      <div className="p-4 grid grid-cols-2 gap-4">
        {[
          { label: 'Last 5 Games', data: last5 },
          { label: 'Last 10 Games', data: last10 },
        ].map(({ label, data }) => (
          data && data.games > 0 ? (
            <div key={label} className="bg-surface-600 border border-surface-300 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-3">{label}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-xs text-slate-500">R/G</p>
                  <p className={`text-lg font-bold font-mono-stat ${getRpgColor(data.runsPerGame)}`}>{fmtRpg(data.runsPerGame)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500">W-L</p>
                  <p className="text-lg font-bold font-mono-stat text-slate-100">{data.wins}-{data.games - data.wins}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-surface-400 text-center">
                <p className="text-xs text-slate-500">Total Runs</p>
                <p className="text-sm font-bold font-mono-stat text-slate-200">{(data.runsPerGame * data.games).toFixed(0)}</p>
              </div>
            </div>
          ) : (
            <div key={label} className="bg-surface-600 border border-surface-300 rounded-lg p-3 flex items-center justify-center min-h-[100px]">
              <p className="text-xs text-slate-600">{label} — no data</p>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// ─── Home/Away Splits ─────────────────────────────────────────────────────────

function SplitsSection({ splits }: { splits: TeamTrendsData['splits'] }) {
  const hasHomeAway = splits.home || splits.away;

  if (!hasHomeAway) {
    return (
      <div className="card-base rounded-xl p-5 text-center">
        <p className="text-sm text-slate-500">Split data not yet available for this season</p>
      </div>
    );
  }

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center gap-2">
        <BarChart2 size={15} className="text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-200">Home / Away Splits</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-400">
              {['Split', 'G', 'R/G', 'AVG', 'OPS', 'HR'].map(h => (
                <th key={`sp-th-${h}`} className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Home', icon: <Home size={11} />, data: splits.home },
              { label: 'Away', icon: <Plane size={11} />, data: splits.away },
            ].map(row => (
              row.data ? (
                <tr key={row.label} className="border-b border-surface-400/50 hover:bg-surface-600 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                      <span className="text-slate-500">{row.icon}</span>
                      {row.label}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400">{row.data.gamesPlayed}</td>
                  <td className="px-3 py-2.5 text-xs font-bold font-mono-stat">
                    <span className={getRpgColor(row.data.runsPerGame)}>{fmtRpg(row.data.runsPerGame)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat">
                    <span className={getAvgColor(row.data.avg)}>{fmtAvg(row.data.avg)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat">
                    <span className={getOpsColor(row.data.ops)}>{row.data.ops.toFixed(3)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-bold font-mono-stat text-amber-400">{row.data.homeRuns}</td>
                </tr>
              ) : (
                <tr key={row.label} className="border-b border-surface-400/50">
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-300">{row.label}</td>
                  <td colSpan={5} className="px-3 py-2.5 text-xs text-slate-600">No data available</td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function TeamTrendsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={`sk-card-${i}`} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ─── Main Client ───────────────────────────────────────────────────────────────

export default function TeamTrendsClient() {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [trendsData, setTrendsData] = useState<TeamTrendsData | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load teams list on mount
  useEffect(() => {
    fetch('/api/team-trends?list=true')
      .then(r => r.json())
      .then(data => {
        setTeams(data.teams ?? []);
        // Default to first team
        if (data.teams?.length > 0) {
          setSelectedTeamId(data.teams[0].id);
        }
      })
      .catch(() => setError('Failed to load teams'))
      .finally(() => setLoadingTeams(false));
  }, []);

  // Load trends when team changes
  const loadTrends = useCallback((teamId: number) => {
    setLoadingTrends(true);
    setError(null);
    setTrendsData(null);
    fetch(`/api/team-trends?teamId=${teamId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setTrendsData(data);
      })
      .catch(e => setError(e.message ?? 'Failed to load team data'))
      .finally(() => setLoadingTrends(false));
  }, []);

  useEffect(() => {
    if (selectedTeamId) loadTrends(selectedTeamId);
  }, [selectedTeamId, loadTrends]);

  const handleTeamSelect = (id: number) => {
    setSelectedTeamId(id);
  };

  const season = new Date().getFullYear();
  const offense = trendsData?.seasonOffense;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Team Trends</h1>
          <p className="text-sm text-slate-500 mt-0.5">{season} offensive performance, recent form &amp; splits</p>
        </div>
        <div className="flex items-center gap-3">
          {loadingTeams ? (
            <Skeleton className="h-9 w-48 rounded-lg" />
          ) : (
            <TeamSelector teams={teams} selectedId={selectedTeamId} onSelect={handleTeamSelect} />
          )}
        </div>
      </div>

      {/* Error state */}
      {error && !loadingTrends && (
        <div className="card-base rounded-xl p-6 text-center border-red-500/20">
          <p className="text-sm text-red-400 font-medium">{error}</p>
          <p className="text-xs text-slate-500 mt-1">Try selecting a different team or refreshing</p>
        </div>
      )}

      {/* Loading state */}
      {loadingTrends && <TeamTrendsSkeleton />}

      {/* Data */}
      {!loadingTrends && trendsData && (
        <>
          {/* Team header */}
          <div className="card-base rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-brand-300">{trendsData.team.abbreviation}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-100">{trendsData.team.name}</h2>
              <p className="text-xs text-slate-500">{trendsData.team.division} · {trendsData.team.league}</p>
            </div>
            {offense && (
              <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                <Badge variant="default">{offense.gamesPlayed} G played</Badge>
                <Badge variant="outline">{season} Season</Badge>
              </div>
            )}
          </div>

          {/* Season stat cards */}
          {offense ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Runs / Game"
                value={fmtRpg(offense.runsPerGame)}
                sub={`${offense.runsScored} total runs`}
                valueColor={getRpgColor(offense.runsPerGame)}
                icon={<TrendingUp size={15} />}
              />
              <StatCard
                label="Team AVG"
                value={fmtAvg(offense.avg)}
                sub={`${offense.hits} hits`}
                valueColor={getAvgColor(offense.avg)}
              />
              <StatCard
                label="Team OPS"
                value={offense.ops.toFixed(3)}
                sub={`OBP ${fmtAvg(offense.obp)} · SLG ${fmtAvg(offense.slg)}`}
                valueColor={getOpsColor(offense.ops)}
              />
              <StatCard
                label="Home Runs"
                value={offense.homeRuns.toString()}
                sub={`${(offense.homeRuns / Math.max(offense.gamesPlayed, 1)).toFixed(2)} HR/G`}
                valueColor={offense.homeRuns >= 30 ? 'text-amber-400' : 'text-slate-100'}
              />
            </div>
          ) : (
            <div className="card-base rounded-xl p-6 text-center">
              <p className="text-sm text-slate-500">Season offensive stats not yet available</p>
            </div>
          )}

          {/* Extended season stats row */}
          {offense && (
            <div className="card-base rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{season} Offensive Breakdown</p>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {[
                  { label: '2B', value: offense.doubles.toString(), color: 'text-slate-200' },
                  { label: '3B', value: offense.triples.toString(), color: 'text-slate-200' },
                  { label: 'BB', value: offense.baseOnBalls.toString(), color: 'text-slate-300' },
                  { label: 'K', value: offense.strikeOuts.toString(), color: 'text-slate-400' },
                  { label: 'SB', value: offense.stolenBases.toString(), color: 'text-slate-300' },
                  { label: 'LOB', value: offense.leftOnBase.toString(), color: 'text-slate-400' },
                  { label: 'H', value: offense.hits.toString(), color: 'text-slate-200' },
                  { label: 'R', value: offense.runsScored.toString(), color: getRpgColor(offense.runsPerGame) },
                ].map(s => (
                  <StatPill key={`ext-${s.label}`} label={s.label} value={s.value} valueColor={s.color} size="xs" />
                ))}
              </div>
            </div>
          )}

          {/* Recent form + splits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentFormSection last5={trendsData.last5} last10={trendsData.last10} />
            <SplitsSection splits={trendsData.splits} />
          </div>

          {/* Recent games table */}
          <RecentGamesTable games={trendsData.recentGames} />
        </>
      )}

      {/* Empty state — no team selected */}
      {!loadingTeams && !loadingTrends && !trendsData && !error && (
        <div className="card-base rounded-xl p-12 text-center">
          <BarChart2 size={32} className="mx-auto text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-400">Select a team to view trends</p>
          <p className="text-xs text-slate-600 mt-1">Offensive stats, recent form, and splits</p>
        </div>
      )}
    </div>
  );
}
