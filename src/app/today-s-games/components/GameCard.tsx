'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Tv, Clock, MapPin } from 'lucide-react';
import WeatherPanel from './WeatherPanel';
import ProbablePitcherPanel from './ProbablePitcherPanel';
import LineupStatusPanel from './LineupStatusPanel';
import type { Game, Team, Pitcher, Ballpark } from '@/types';
import { getParkFactorColor, getParkFactorLabel } from '@/lib/hrProjectionEngine';

interface GameCardProps {
  game: Game;
  awayTeam: Team;
  homeTeam: Team;
  awayPitcher: Pitcher;
  homePitcher: Pitcher;
  ballpark: Ballpark;
}

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'bg-slate-500/15 border-slate-500/30 text-slate-400' },
  lineup_confirmed: { label: 'Lineups Set', color: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  in_progress: { label: 'Live', color: 'bg-red-500/15 border-red-500/30 text-red-400' },
  final: { label: 'Final', color: 'bg-slate-600/40 border-slate-500/20 text-slate-500' },
  delayed: { label: 'Delayed', color: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
};

export default function GameCard({ game, awayTeam, homeTeam, awayPitcher, homePitcher, ballpark }: GameCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[game.status];

  return (
    <div className="card-base card-hover rounded-xl overflow-hidden">
      {/* Top accent — weather impact */}
      <div className={`h-0.5 w-full ${game.weather.hrImpact === 'positive' ? 'bg-gradient-to-r from-emerald-400/70 to-emerald-400/10' : game.weather.hrImpact === 'negative' ? 'bg-gradient-to-r from-red-400/70 to-red-400/10' : 'bg-gradient-to-r from-slate-500/40 to-slate-500/5'}`} />

      <div className="p-4">
        {/* Header: matchup + time + status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            {/* Teams */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-sm flex items-center justify-center text-xs font-bold" style={{ backgroundColor: awayTeam.logoColor + '22', color: awayTeam.logoColor }}>
                  {awayTeam.abbreviation.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-slate-100">{awayTeam.abbreviation}</span>
                <span className="text-xs text-slate-500">{awayTeam.record.wins}-{awayTeam.record.losses}</span>
              </div>
              <span className="text-slate-500 text-xs font-medium">@</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-sm flex items-center justify-center text-xs font-bold" style={{ backgroundColor: homeTeam.logoColor + '22', color: homeTeam.logoColor }}>
                  {homeTeam.abbreviation.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-slate-100">{homeTeam.abbreviation}</span>
                <span className="text-xs text-slate-500">{homeTeam.record.wins}-{homeTeam.record.losses}</span>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <div className="flex items-center gap-1">
                <Clock size={11} />
                <span>{game.timeET}</span>
              </div>
              <div className="flex items-center gap-1">
                <Tv size={11} />
                <span>{game.tvNetwork}</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin size={11} />
                <span className="truncate">{ballpark.name}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${status.color}`}>
              {status.label}
            </span>
            {/* Park factor badge */}
            <span className={`text-xs font-mono-stat font-semibold ${getParkFactorColor(ballpark.hrFactor)}`}>
              {ballpark.hrFactor.toFixed(2)}x HR
            </span>
          </div>
        </div>

        {/* Pitchers row */}
        <div className="flex gap-2 mb-3">
          <ProbablePitcherPanel pitcher={awayPitcher} team={awayTeam} side="away" />
          <ProbablePitcherPanel pitcher={homePitcher} team={homeTeam} side="home" />
        </div>

        {/* Weather panel */}
        <WeatherPanel weather={game.weather} />

        {/* Lineup status */}
        <div className="mt-2">
          <LineupStatusPanel
            awayStatus={game.lineupStatus.away}
            homeStatus={game.lineupStatus.home}
            awayAbbr={awayTeam.abbreviation}
            homeAbbr={homeTeam.abbreviation}
          />
        </div>

        {/* Expand: ballpark details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 pt-3 border-t border-surface-400 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          <span>{expanded ? 'Hide park info' : 'Ballpark details'}</span>
        </button>

        {expanded && (
          <div className="mt-3 animate-slide-up">
            <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">{ballpark.name}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">HR Factor</span>
                  <span className={`text-xs font-bold font-mono-stat ${getParkFactorColor(ballpark.hrFactor)}`}>{ballpark.hrFactor.toFixed(2)}x</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Tier</span>
                  <span className={`text-xs font-medium ${getParkFactorColor(ballpark.hrFactor)}`}>{getParkFactorLabel(ballpark.hrFactor)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Elevation</span>
                  <span className="text-xs font-mono-stat text-slate-300">{ballpark.elevation.toLocaleString()} ft</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">CF</span>
                  <span className="text-xs font-mono-stat text-slate-300">{ballpark.dimensions.centerField} ft</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">LF</span>
                  <span className="text-xs font-mono-stat text-slate-300">{ballpark.dimensions.leftField} ft</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">RF</span>
                  <span className="text-xs font-mono-stat text-slate-300">{ballpark.dimensions.rightField} ft</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}