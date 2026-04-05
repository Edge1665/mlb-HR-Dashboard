'use client';
import React, { useState } from 'react';
import GamesSummaryBar from './GamesSummaryBar';
import GamesFilterBar from './GamesFilterBar';
import RealGamesGrid from './RealGamesGrid';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import type { RealMLBGame } from '@/services/mlbApi';
import type { WeatherResult } from '@/services/weatherService';
import type { GameLineup } from '@/services/lineupService';

interface TodaysGamesClientProps {
  games: RealMLBGame[];
  fetchError: string | null;
  weatherMap: Record<number, WeatherResult>;
  lineupMap: Record<number, GameLineup>;
}

export default function TodaysGamesClient({ games, fetchError, weatherMap, lineupMap }: TodaysGamesClientProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSort, setActiveSort] = useState('time');

  if (fetchError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ErrorState
          title="Failed to load today's schedule"
          message={`Could not reach the MLB Stats API. ${fetchError}`}
        />
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <>
        <GamesSummaryBar games={[]} />
        <div className="flex items-center justify-center min-h-[40vh]">
          <EmptyState
            title="No games scheduled today"
            message="There are no MLB games on today's schedule. Check back tomorrow!"
          />
        </div>
      </>
    );
  }

  const filtered = games.filter(g => {
    if (activeFilter === 'live') return g.status === 'in_progress';
    if (activeFilter === 'final') return g.status === 'final';
    if (activeFilter === 'pitchers_set') return g.awayProbablePitcher !== null || g.homeProbablePitcher !== null;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (activeSort === 'status') {
      const order: Record<string, number> = { in_progress: 0, scheduled: 1, delayed: 2, final: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    }
    // default: sort by game time
    return new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime();
  });

  return (
    <>
      <GamesSummaryBar games={games} />
      <GamesFilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        activeSort={activeSort}
        onSortChange={setActiveSort}
      />
      <RealGamesGrid games={sorted} weatherMap={weatherMap} lineupMap={lineupMap} />
    </>
  );
}