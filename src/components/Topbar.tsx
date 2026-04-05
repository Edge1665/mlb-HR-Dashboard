'use client';
import React, { useState } from 'react';
import { Search, Bell, RefreshCw, ChevronDown } from 'lucide-react';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/home-run-dashboard': { title: 'Home Run Dashboard', subtitle: 'Top HR probability targets for today\'s slate' },
  '/today-s-games': { title: "Today's Games", subtitle: 'Apr 4, 2026 — 8 games on the slate' },
  '/player-research': { title: 'Player Research', subtitle: 'Statcast metrics & matchup analysis' },
};

interface TopbarProps {
  currentPath: string;
}

export default function Topbar({ currentPath }: TopbarProps) {
  const [refreshing, setRefreshing] = useState(false);
  const pageInfo = PAGE_TITLES[currentPath] ?? { title: 'MLBAnalytics', subtitle: '' };

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1200);
  }

  return (
    <header className="h-14 bg-surface-800 border-b border-surface-400 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex flex-col min-w-0">
        <h1 className="text-sm font-semibold text-slate-100 truncate">{pageInfo.title}</h1>
        <p className="text-xs text-slate-500 truncate hidden sm:block">{pageInfo.subtitle}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search bar - hidden on mobile */}
        <div className="hidden md:flex items-center gap-2 bg-surface-600 border border-surface-300 rounded-lg px-3 py-1.5 w-52">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search player..."
            className="bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none w-full"
          />
          <span className="text-xs text-slate-600 font-mono-stat flex-shrink-0">⌘K</span>
        </div>

        {/* Data freshness */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-surface-600 px-2.5 py-1.5 rounded-lg border border-surface-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
          </span>
          <span>Updated 2m ago</span>
        </div>

        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-500 transition-all duration-150"
          aria-label="Refresh data"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>

        <button className="relative p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-500 transition-all duration-150" aria-label="Notifications">
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-brand-400 rounded-full border border-surface-800"></span>
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-surface-400">
          <div className="w-7 h-7 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
            <span className="text-xs font-bold text-brand-400">ML</span>
          </div>
          <ChevronDown size={14} className="text-slate-500 hidden sm:block" />
        </div>
      </div>
    </header>
  );
}