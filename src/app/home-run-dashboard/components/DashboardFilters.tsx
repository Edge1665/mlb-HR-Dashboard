'use client';
import React from 'react';
import { SlidersHorizontal } from 'lucide-react';

interface DashboardFiltersProps {
  activeTier: string;
  onTierChange: (tier: string) => void;
  activePlatoon: string;
  onPlatoonChange: (p: string) => void;
  showTopOnly: boolean;
  onTopOnlyChange: (v: boolean) => void;
}

const TIERS = [
  { key: 'all', label: 'All Tiers' },
  { key: 'elite', label: 'Elite' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
];

const PLATOONS = [
  { key: 'all', label: 'All Matchups' },
  { key: 'strong', label: 'Strong Edge' },
  { key: 'moderate', label: 'Moderate Edge' },
  { key: 'neutral', label: 'Neutral' },
];

export default function DashboardFilters({
  activeTier, onTierChange,
  activePlatoon, onPlatoonChange,
  showTopOnly, onTopOnlyChange,
}: DashboardFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 p-3 bg-surface-700 border border-surface-400 rounded-xl">
      <div className="flex items-center gap-2 text-xs text-slate-400 flex-shrink-0">
        <SlidersHorizontal size={14} />
        <span className="font-medium">Filters</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {TIERS.map(t => (
          <button
            key={`tier-filter-${t.key}`}
            onClick={() => onTierChange(t.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              activeTier === t.key
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' :'text-slate-400 hover:text-slate-200 hover:bg-surface-500 border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-surface-300 flex-shrink-0 hidden sm:block" />

      <div className="flex items-center gap-1 flex-wrap">
        {PLATOONS.map(p => (
          <button
            key={`platoon-filter-${p.key}`}
            onClick={() => onPlatoonChange(p.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              activePlatoon === p.key
                ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' :'text-slate-400 hover:text-slate-200 hover:bg-surface-500 border border-transparent'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 transition-colors">
          <div
            onClick={() => onTopOnlyChange(!showTopOnly)}
            className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${showTopOnly ? 'bg-brand-500' : 'bg-surface-300'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ${showTopOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          Top 5 only
        </label>
      </div>
    </div>
  );
}