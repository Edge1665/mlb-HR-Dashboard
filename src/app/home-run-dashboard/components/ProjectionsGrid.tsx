import React from 'react';
import HRProjectionCard from './HRProjectionCard';
import type { HRProjection, Batter, Pitcher, Game, Ballpark, Team } from '@/types';

interface ProjectionsGridProps {
  projections: HRProjection[];
  batters: Record<string, Batter>;
  pitchers: Record<string, Pitcher>;
  games: Record<string, Game>;
  ballparks: Record<string, Ballpark>;
  teams: Record<string, Team>;
}

export default function ProjectionsGrid({ projections, batters, pitchers, games, ballparks, teams }: ProjectionsGridProps) {
  const top10 = projections.slice(0, 10);

  const confirmedCards = top10.filter(p => p.lineupConfirmed !== false);
  const unconfirmedCards = top10.filter(p => p.lineupConfirmed === false);

  const renderCard = (proj: HRProjection) => {
    const batter = batters[proj.batterId];
    if (!batter) return null;

    const pitcher = proj.opposingPitcherId ? (pitchers[proj.opposingPitcherId] ?? null) : null;
    const game = proj.gameId ? (games[proj.gameId] ?? null) : null;
    const ballpark = proj.ballparkId ? (ballparks[proj.ballparkId] ?? null) : null;

    return (
      <HRProjectionCard
        key={`proj-card-${proj.id}`}
        projection={proj}
        batter={batter}
        pitcher={pitcher}
        game={game}
        ballpark={ballpark}
        rank={proj.rank}
        teams={teams}
      />
    );
  };

  const confirmedRendered = confirmedCards.map(renderCard).filter(Boolean);
  const unconfirmedRendered = unconfirmedCards.map(renderCard).filter(Boolean);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Top HR Targets</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {confirmedRendered.length > 0
              ? 'Ranked by HR probability — confirmed lineups shown first' :'Ranked by HR probability — roster-based early predictions'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>Elite
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>High
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>Medium
          </div>
        </div>
      </div>

      {confirmedRendered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-6">
          {confirmedRendered}
        </div>
      )}

      {unconfirmedRendered.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3 mt-2">
            <div className="h-px flex-1 bg-surface-400" />
            <span className="text-xs text-amber-400/80 font-medium px-2">Early Predictions — Lineup TBD</span>
            <div className="h-px flex-1 bg-surface-400" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {unconfirmedRendered}
          </div>
        </>
      )}

      {confirmedRendered.length === 0 && unconfirmedRendered.length === 0 && (
        <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
          No predictions available yet for today&apos;s games.
        </div>
      )}
    </div>
  );
}