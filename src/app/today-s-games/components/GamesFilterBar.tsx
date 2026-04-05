'use client';
import React from 'react';
import { Filter } from 'lucide-react';

interface GamesFilterBarProps {
  activeFilter: string;
  onFilterChange: (f: string) => void;
  activeSort: string;
  onSortChange: (s: string) => void;
}

const FILTERS = [
  { key: 'all', label: 'All Games' },
  { key: 'live', label: 'Live Now' },
  { key: 'pitchers_set', label: 'Pitchers Set' },
  { key: 'final', label: 'Final' },
];

const SORTS = [
  { key: 'time', label: 'Game Time' },
  { key: 'status', label: 'Status' },
];

export default function GamesFilterBar({ activeFilter, onFilterChange, activeSort, onSortChange }: GamesFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-5 p-3 bg-surface-700 border border-surface-400 rounded-xl">
      <div className="flex items-center gap-2 text-xs text-slate-400 flex-shrink-0">
        <Filter size={13} />
        <span className="font-medium">Filter</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={`gf-${f.key}`}
            onClick={() => onFilterChange(f.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              activeFilter === f.key
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' :'text-slate-400 hover:text-slate-200 hover:bg-surface-500 border border-transparent'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-slate-500">Sort:</span>
        {SORTS.map(s => (
          <button
            key={`gs-${s.key}`}
            onClick={() => onSortChange(s.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              activeSort === s.key
                ? 'bg-surface-400 text-slate-200 border border-surface-200' :'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}