'use client';
import React, { useEffect, useState } from 'react';
import { Loader2, CalendarDays } from 'lucide-react';
import type { PlayerGameLogEntry } from '@/services/playerResearchApi';

interface RealGameLogProps {
  playerId: number;
  playerName: string;
}

function getOpsColor(ops: number): string {
  if (ops >= 1.0) return 'text-amber-400';
  if (ops >= 0.800) return 'text-emerald-400';
  if (ops >= 0.600) return 'text-slate-300';
  return 'text-red-400';
}

export default function RealGameLog({ playerId, playerName }: RealGameLogProps) {
  const [gameLog, setGameLog] = useState<PlayerGameLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setGameLog([]);
    setShowAll(false);

    fetch(`/api/player-gamelog?id=${playerId}`)
      .then(r => r.json())
      .then(data => {
        setGameLog(data.gameLog ?? []);
      })
      .catch(() => setError('Failed to load game log'))
      .finally(() => setLoading(false));
  }, [playerId]);

  const displayLog = showAll ? gameLog : gameLog.slice(0, 10);

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Recent Game Log</h3>
          <p className="text-xs text-slate-500 mt-0.5">{playerName} — {new Date().getFullYear()} season</p>
        </div>
        {!loading && gameLog.length > 0 && (
          <span className="text-xs font-mono-stat text-slate-500">{gameLog.length} games</span>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 size={20} className="mx-auto text-brand-400 animate-spin mb-2" />
          <p className="text-sm text-slate-500">Loading game log...</p>
        </div>
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      ) : gameLog.length === 0 ? (
        <div className="py-10 text-center px-4">
          <CalendarDays size={20} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-500">No games played yet this season</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-400 bg-surface-600">
                  {['Date', 'OPP', 'AB', 'H', 'HR', 'RBI', 'BB', 'K', 'OPS'].map(h => (
                    <th key={`log-th-${h}`} className={`px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider ${h === 'Date' || h === 'OPP' ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayLog.map((entry, i) => {
                  const isHR = entry.homeRuns > 0;
                  return (
                    <tr
                      key={`log-row-${entry.date}-${i}`}
                      className={`border-b border-surface-400 transition-colors duration-100 ${isHR ? 'bg-amber-400/5 hover:bg-amber-400/10' : i % 2 === 0 ? 'bg-surface-700 hover:bg-surface-600' : 'bg-surface-800 hover:bg-surface-600'}`}
                    >
                      <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{entry.date}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-slate-300">{entry.opponent}</td>
                      <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400 text-right">{entry.atBats}</td>
                      <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-300 text-right">{entry.hits}</td>
                      <td className="px-3 py-2.5 text-right">
                        {entry.homeRuns > 0 ? (
                          <span className="text-xs font-bold font-mono-stat text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                            {entry.homeRuns}
                          </span>
                        ) : (
                          <span className="text-xs font-mono-stat text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400 text-right">{entry.rbi}</td>
                      <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400 text-right">{entry.baseOnBalls}</td>
                      <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-500 text-right">{entry.strikeOuts}</td>
                      <td className={`px-3 py-2.5 text-xs font-bold font-mono-stat text-right ${getOpsColor(entry.ops)}`}>
                        {entry.ops > 0 ? entry.ops.toFixed(3) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {gameLog.length > 10 && (
            <div className="px-4 py-3 border-t border-surface-400 text-center">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                {showAll ? 'Show fewer games' : `Show all ${gameLog.length} games`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
