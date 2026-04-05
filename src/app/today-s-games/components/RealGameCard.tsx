'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Tv, Clock, MapPin, Wind, Thermometer } from 'lucide-react';
import type { RealMLBGame } from '@/services/mlbApi';
import type { WeatherResult } from '@/services/weatherService';
import type { GameLineup } from '@/services/lineupService';
import LineupStatusPanel from './LineupStatusPanel';

interface RealGameCardProps {
  game: RealMLBGame;
  weather: WeatherResult | null;
  lineup: GameLineup | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot?: string }> = {
  scheduled: { label: 'Scheduled', color: 'bg-slate-500/15 border-slate-500/30 text-slate-400' },
  in_progress: { label: 'Live', color: 'bg-red-500/15 border-red-500/30 text-red-400', dot: 'bg-red-400' },
  final: { label: 'Final', color: 'bg-slate-600/40 border-slate-500/20 text-slate-500' },
  delayed: { label: 'Delayed', color: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
};

function TeamInitialBadge({ abbr, color }: { abbr: string; color: string }) {
  return (
    <div
      className="w-5 h-5 rounded-sm flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color + '33', color }}
    >
      {abbr.charAt(0)}
    </div>
  );
}

// Deterministic color per team abbreviation for consistent visual identity
function teamColor(abbr: string): string {
  const palette: Record<string, string> = {
    NYY: '#003087', BOS: '#BD3039', LAD: '#005A9C', SF: '#FD5A1E', CHC: '#0E3386',
    STL: '#C41E3A', HOU: '#EB6E1F', ATL: '#CE1141', NYM: '#002D72', PHI: '#E81828',
    MIL: '#FFC52F', MIN: '#002B5C', CLE: '#E31937', DET: '#0C2340', CWS: '#27251F',
    KC: '#004687', TEX: '#003278', SEA: '#0C2C56', OAK: '#003831', LAA: '#BA0021',
    TOR: '#134A8E', BAL: '#DF4601', TB: '#092C5C', MIA: '#00A3E0', WSH: '#AB0003',
    COL: '#33006F', ARI: '#A71930', SD: '#2F241D', CIN: '#C6011F', PIT: '#FDB827',
  };
  return palette[abbr] ?? '#6366f1';
}

interface PitcherSlotProps {
  pitcher: { id: number; fullName: string } | null;
  side: 'away' | 'home';
  teamAbbr: string;
}

function PitcherSlot({ pitcher, side, teamAbbr }: PitcherSlotProps) {
  return (
    <div className="bg-surface-600 border border-surface-300 rounded-lg p-3 flex-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {side === 'away' ? 'Away' : 'Home'} SP
        </span>
        <span className="text-xs text-slate-500">{teamAbbr}</span>
      </div>
      {pitcher ? (
        <p className="text-sm font-semibold text-slate-100 leading-tight truncate">{pitcher.fullName}</p>
      ) : (
        <p className="text-xs text-slate-500 italic">Not confirmed yet</p>
      )}
    </div>
  );
}

function WeatherStrip({ weather }: { weather: WeatherResult | null }) {
  if (weather === null) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-600 border border-surface-300 rounded-lg text-xs text-slate-500">
        <Thermometer size={11} className="flex-shrink-0" />
        <span>Weather unavailable</span>
      </div>
    );
  }

  if ('unavailable' in weather && weather.unavailable) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-600 border border-surface-300 rounded-lg text-xs text-slate-500">
        <Thermometer size={11} className="flex-shrink-0" />
        <span>Weather unavailable</span>
      </div>
    );
  }

  const w = weather as import('@/services/weatherService').GameWeather;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-surface-600 border border-surface-300 rounded-lg">
      <div className="flex items-center gap-1 text-xs text-slate-300">
        <Thermometer size={11} className="text-sky-400 flex-shrink-0" />
        <span className="font-semibold font-mono-stat">{w.tempF}°F</span>
      </div>
      <div className="w-px h-3 bg-surface-300" />
      <div className="flex items-center gap-1 text-xs text-slate-300">
        <Wind size={11} className="text-slate-400 flex-shrink-0" />
        <span>{w.windSpeedMph} mph {w.windDirection}</span>
      </div>
      <div className="w-px h-3 bg-surface-300" />
      <span className="text-xs text-slate-400 truncate">{w.condition}</span>
    </div>
  );
}

export default function RealGameCard({ game, weather, lineup }: RealGameCardProps) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[game.status] ?? STATUS_CONFIG.scheduled;
  const awayColor = teamColor(game.awayTeamAbbr);
  const homeColor = teamColor(game.homeTeamAbbr);
  const isLive = game.status === 'in_progress';
  const isFinal = game.status === 'final';

  const broadcastLabel = game.broadcasts.length > 0 ? game.broadcasts.join(', ') : 'MLB.TV';

  return (
    <div className="card-base card-hover rounded-xl overflow-hidden">
      {/* Top accent */}
      <div
        className={`h-0.5 w-full ${isLive ? 'bg-gradient-to-r from-red-400/80 to-red-400/10' : isFinal ? 'bg-gradient-to-r from-slate-500/30 to-slate-500/5' : 'bg-gradient-to-r from-brand-400/50 to-brand-400/5'}`}
      />

      <div className="p-4">
        {/* Header: matchup + time + status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            {/* Teams row */}
            <div className="flex items-center gap-2 mb-1.5">
              {/* Away team */}
              <div className="flex items-center gap-1.5">
                <TeamInitialBadge abbr={game.awayTeamAbbr} color={awayColor} />
                <span className="text-sm font-semibold text-slate-100">{game.awayTeamAbbr}</span>
                <span className="text-xs text-slate-500">
                  {game.awayTeamRecord.wins}-{game.awayTeamRecord.losses}
                </span>
              </div>

              {/* Score or @ */}
              {(isLive || isFinal) && game.awayScore !== undefined && game.homeScore !== undefined ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold font-mono-stat text-slate-100">{game.awayScore}</span>
                  <span className="text-slate-500 text-xs font-medium">–</span>
                  <span className="text-sm font-bold font-mono-stat text-slate-100">{game.homeScore}</span>
                </div>
              ) : (
                <span className="text-slate-500 text-xs font-medium">@</span>
              )}

              {/* Home team */}
              <div className="flex items-center gap-1.5">
                <TeamInitialBadge abbr={game.homeTeamAbbr} color={homeColor} />
                <span className="text-sm font-semibold text-slate-100">{game.homeTeamAbbr}</span>
                <span className="text-xs text-slate-500">
                  {game.homeTeamRecord.wins}-{game.homeTeamRecord.losses}
                </span>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <div className="flex items-center gap-1">
                <Clock size={11} />
                <span>
                  {isLive && game.inning
                    ? `${game.inningState ?? ''} ${game.inning}`
                    : game.gameTimeET}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Tv size={11} />
                <span className="truncate max-w-[80px]">{broadcastLabel}</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin size={11} />
                <span className="truncate max-w-[100px]">{game.venueName}</span>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md border flex items-center gap-1.5 ${statusCfg.color}`}>
              {statusCfg.dot && (
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} animate-pulse`} />
              )}
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* Weather strip */}
        <WeatherStrip weather={weather} />

        {/* Probable pitchers */}
        <div className="flex gap-2 mt-3">
          <PitcherSlot pitcher={game.awayProbablePitcher} side="away" teamAbbr={game.awayTeamAbbr} />
          <PitcherSlot pitcher={game.homeProbablePitcher} side="home" teamAbbr={game.homeTeamAbbr} />
        </div>

        {/* Lineup status */}
        <LineupStatusPanel
          lineup={lineup}
          awayAbbr={game.awayTeamAbbr}
          homeAbbr={game.homeTeamAbbr}
        />

        {/* Expand: full team names */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 pt-3 border-t border-surface-400 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          <span>{expanded ? 'Hide details' : 'Game details'}</span>
        </button>

        {expanded && (
          <div className="mt-3 animate-slide-up">
            <div className="bg-surface-600 border border-surface-300 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Away</span>
                <span className="text-xs font-medium text-slate-200">{game.awayTeamName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Home</span>
                <span className="text-xs font-medium text-slate-200">{game.homeTeamName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Venue</span>
                <span className="text-xs font-medium text-slate-200">{game.venueName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Game ID</span>
                <span className="text-xs font-mono-stat text-slate-400">{game.gamePk}</span>
              </div>
              {game.broadcasts.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Broadcast</span>
                  <span className="text-xs font-medium text-slate-200">{game.broadcasts.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
