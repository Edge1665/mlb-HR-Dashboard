'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import type { PlayerSearchResult } from '@/services/playerResearchApi';

interface PlayerSearchPanelProps {
  selectedId: number | null;
  onSelect: (player: PlayerSearchResult) => void;
}

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF'];

export default function PlayerSearchPanel({ selectedId, onSelect }: PlayerSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPos, setFilterPos] = useState('all');
  const [filterBats, setFilterBats] = useState('all');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/player-search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.players ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filtered = results.filter(p => {
    const matchPos = filterPos === 'all' || p.primaryPosition === filterPos;
    const matchBats = filterBats === 'all' || p.batSide === filterBats;
    return matchPos && matchBats;
  });

  const getBatsSideColor = (side: string) => {
    if (side === 'L') return 'text-blue-400';
    if (side === 'R') return 'text-amber-400';
    return 'text-purple-400';
  };

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
            placeholder="Search player name..."
            className="w-full bg-surface-600 border border-surface-300 rounded-lg pl-8 pr-8 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all"
          />
          {loading ? (
            <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
          ) : query ? (
            <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              <X size={13} />
            </button>
          ) : null}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <select
            value={filterPos}
            onChange={e => setFilterPos(e.target.value)}
            className="flex-1 min-w-0 bg-surface-600 border border-surface-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-brand-500/50"
          >
            <option value="all">All Positions</option>
            {POSITIONS.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
          <select
            value={filterBats}
            onChange={e => setFilterBats(e.target.value)}
            className="flex-1 min-w-0 bg-surface-600 border border-surface-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-brand-500/50"
          >
            <option value="all">All Bats</option>
            <option value="L">Left</option>
            <option value="R">Right</option>
            <option value="S">Switch</option>
          </select>
        </div>
      </div>

      {/* Results */}
      <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
        {query.trim().length < 2 ? (
          <div className="py-10 text-center px-4">
            <Search size={20} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">Type at least 2 characters to search</p>
            <p className="text-xs text-slate-600 mt-1">Searches all active MLB batters</p>
          </div>
        ) : loading ? (
          <div className="py-10 text-center">
            <Loader2 size={20} className="mx-auto text-slate-500 animate-spin mb-2" />
            <p className="text-sm text-slate-500">Searching...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">No players found</p>
            <p className="text-xs text-slate-600 mt-1">Try a different name or spelling</p>
          </div>
        ) : (
          filtered.map(player => {
            const isSelected = selectedId === player.id;
            return (
              <button
                key={`player-${player.id}`}
                onClick={() => onSelect(player)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-surface-400 text-left hover:bg-surface-600 transition-colors duration-100 ${isSelected ? 'bg-brand-500/10 border-l-2 border-l-brand-400' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 bg-surface-500 border border-surface-300 text-slate-400">
                  {player.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-brand-300' : 'text-slate-200'}`}>{player.fullName}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {player.currentTeam || 'Unknown Team'} · {player.primaryPosition || '—'}
                  </p>
                </div>
                <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                  <span className={`text-xs font-semibold ${getBatsSideColor(player.batSide)}`}>
                    Bats {player.batSide}
                  </span>
                  {player.jerseyNumber && (
                    <span className="text-xs text-slate-600">#{player.jerseyNumber}</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
