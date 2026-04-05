import React from 'react';
import RealGameCard from './RealGameCard';
import type { RealMLBGame } from '@/services/mlbApi';
import type { WeatherResult } from '@/services/weatherService';
import type { GameLineup } from '@/services/lineupService';

interface RealGamesGridProps {
  games: RealMLBGame[];
  weatherMap: Record<number, WeatherResult>;
  lineupMap: Record<number, GameLineup>;
}

export default function RealGamesGrid({ games, weatherMap, lineupMap }: RealGamesGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {games.map(game => (
        <RealGameCard
          key={`real-game-${game.gamePk}`}
          game={game}
          weather={weatherMap[game.gamePk] ?? null}
          lineup={lineupMap[game.gamePk] ?? null}
        />
      ))}
    </div>
  );
}
