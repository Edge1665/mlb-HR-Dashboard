'use client';
import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Batter } from '@/types';
import { TEAMS } from '@/data/mockData';

interface BatterSearchPanelProps {
  batters: Batter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function BatterSearchPanel({ batters, selectedId, onSelect }: BatterSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterPos, setFilterPos] = useState('all');

  const teams = Array.from(new Set(batters.map(b => b.teamId)));
  const positions = Array.from(new Set(batters.map(b => b.position)));

  const filtered = batters.filter(b => {
    const matchQuery = query === '' || b.name.toLowerCase().includes(query.toLowerCase());
    const matchTeam = filterTeam === 'all' || b.teamId === filterTeam;
    const matchPos = filterPos === 'all' || b.position === filterPos;
    return matchQuery && matchTeam && matchPos;
  });

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-400">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">Player Search</h2>

        {/* Search input */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search batter name..."
            className="w-full bg-surface-600 border border-surface-300 rounded-lg pl-8 pr-8 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterTeam}
            onChange={e => setFilterTeam(e.target.value)}
            className="flex-1 min-w-0 bg-surface-600 border border-surface-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-brand-500/50"
          >
            <option value="all">All Teams</option>
            {teams.map(tid => (
              <option key={`team-opt-${tid}`} value={tid}>{TEAMS[tid]?.abbreviation ?? tid}</option>
            ))}
          </select>
          <select
            value={filterPos}
            onChange={e => setFilterPos(e.target.value)}
            className="flex-1 min-w-0 bg-surface-600 border border-surface-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-brand-500/50"
          >
            <option value="all">All Positions</option>
            {positions.map(pos => (
              <option key={`pos-opt-${pos}`} value={pos}>{pos}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results list */}
      <div className="overflow-y-auto max-h-96">
        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">No batters match your search</p>
          </div>
        ) : (
          filtered.map(batter => {
            const team = TEAMS[batter.teamId];
            const isSelected = selectedId === batter.id;
            return (
              <button
                key={`batter-list-${batter.id}`}
                onClick={() => onSelect(batter.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-surface-400 text-left hover:bg-surface-600 transition-colors duration-100 ${isSelected ? 'bg-brand-500/10 border-l-2 border-l-brand-400' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: (team?.logoColor ?? '#334155') + '22', color: team?.logoColor ?? '#94a3b8' }}>
                  {batter.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-brand-300' : 'text-slate-200'}`}>{batter.name}</p>
                  <p className="text-xs text-slate-500">{team?.abbreviation} · {batter.position} · Bats {batter.bats}</p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-xs font-mono-stat text-slate-300">{batter.season.hr} HR</span>
                  <span className="text-xs text-slate-500">{batter.season.ops.toFixed(3)} OPS</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}