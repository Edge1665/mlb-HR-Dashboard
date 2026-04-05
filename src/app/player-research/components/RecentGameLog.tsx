import React from 'react';
import type { GameLogEntry } from '@/types';


interface RecentGameLogProps {
  gameLog: GameLogEntry[];
  batterName: string;
}

export default function RecentGameLog({ gameLog, batterName }: RecentGameLogProps) {
  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Recent Game Log</h3>
          <p className="text-xs text-slate-500 mt-0.5">{batterName} — last {gameLog.length} games</p>
        </div>
        <span className="text-xs font-mono-stat text-slate-500">{gameLog.length} games</span>
      </div>
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
            {gameLog.map((entry, i) => {
              const isHR = entry.hr > 0;
              return (
                <tr
                  key={`log-row-${entry.date}-${i}`}
                  className={`border-b border-surface-400 transition-colors duration-100 ${isHR ? 'bg-amber-400/5 hover:bg-amber-400/10' : i % 2 === 0 ? 'bg-surface-700 hover:bg-surface-600' : 'bg-surface-800 hover:bg-surface-600'}`}
                >
                  <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">{entry.date}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-300">{entry.opponent}</td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400 text-right">{entry.ab}</td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-300 text-right">{entry.h}</td>
                  <td className="px-3 py-2.5 text-right">
                    {entry.hr > 0 ? (
                      <span className="text-xs font-bold font-mono-stat text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        {entry.hr}
                      </span>
                    ) : (
                      <span className="text-xs font-mono-stat text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400 text-right">{entry.rbi}</td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-400 text-right">{entry.bb}</td>
                  <td className="px-3 py-2.5 text-xs font-mono-stat text-slate-500 text-right">{entry.k}</td>
                  <td className={`px-3 py-2.5 text-xs font-bold font-mono-stat text-right ${entry.ops >= 1.0 ? 'text-amber-400' : entry.ops >= 0.800 ? 'text-emerald-400' : entry.ops >= 0.600 ? 'text-slate-300' : 'text-red-400'}`}>
                    {entry.ops.toFixed(3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}