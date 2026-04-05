import React from 'react';
import GameCard from './GameCard';
import type { Game } from '@/types';
import { TEAMS, PITCHERS, BALLPARKS } from '@/data/mockData';

interface GamesGridProps {
  games: Game[];
}

export default function GamesGrid({ games }: GamesGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {games.map(game => {
        const awayTeam = TEAMS[game.awayTeamId];
        const homeTeam = TEAMS[game.homeTeamId];
        const awayPitcher = PITCHERS[game.awayPitcherId];
        const homePitcher = PITCHERS[game.homePitcherId];
        const ballpark = BALLPARKS[game.ballparkId];

        if (!awayTeam || !homeTeam || !awayPitcher || !homePitcher || !ballpark) return null;

        return (
          <GameCard
            key={`game-card-${game.id}`}
            game={game}
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayPitcher={awayPitcher}
            homePitcher={homePitcher}
            ballpark={ballpark}
          />
        );
      })}
    </div>
  );
}