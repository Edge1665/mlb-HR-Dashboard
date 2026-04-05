import React from 'react';
import AppLayout from '@/components/AppLayout';
import TodaysGamesClient from './components/TodaysGamesClient';
import { fetchTodaysMLBSchedule } from '@/services/mlbApi';
import { fetchWeatherForAllGames } from '@/services/weatherService';
import { fetchLineupsForAllGames } from '@/services/lineupService';
import type { RealMLBGame } from '@/services/mlbApi';
import type { WeatherResult } from '@/services/weatherService';
import type { GameLineup } from '@/services/lineupService';

// Force dynamic rendering so date is always current (no stale cached page)
export const dynamic = 'force-dynamic';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export default async function TodaysGamesPage() {
  let games: RealMLBGame[] = [];
  let fetchError: string | null = null;
  let weatherMap: Record<number, WeatherResult> = {};
  let lineupMap: Record<number, GameLineup> = {};

  // Step 1: Fetch schedule — if this fails, show error state
  try {
    games = await withTimeout(fetchTodaysMLBSchedule(), 15000);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Failed to load schedule';
  }

  // Step 2: Fetch weather and lineups independently — failures here are non-fatal
  if (games.length > 0) {
    const gamePks = games.map(g => g.gamePk);
    const venueInputs = games.map(g => ({
      venueId: g.venueId,
      homeTeamAbbr: g.homeTeamAbbr,
      gamePk: g.gamePk,
    }));

    const [weatherResult, lineupResult] = await Promise.allSettled([
      withTimeout(fetchWeatherForAllGames(venueInputs), 10000),
      withTimeout(fetchLineupsForAllGames(gamePks), 10000),
    ]);

    if (weatherResult.status === 'fulfilled') {
      weatherMap = Object.fromEntries(weatherResult.value.entries());
    } else {
      console.warn('[TodaysGamesPage] Weather fetch failed:', weatherResult.reason);
    }

    if (lineupResult.status === 'fulfilled') {
      lineupMap = Object.fromEntries(lineupResult.value.entries());
    } else {
      console.warn('[TodaysGamesPage] Lineup fetch failed:', lineupResult.reason);
    }
  }

  return (
    <AppLayout currentPath="/today-s-games">
      <TodaysGamesClient
        games={games}
        fetchError={fetchError}
        weatherMap={weatherMap}
        lineupMap={lineupMap}
      />
    </AppLayout>
  );
}