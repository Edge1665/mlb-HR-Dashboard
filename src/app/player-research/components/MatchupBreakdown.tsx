import React from 'react';
import type { Batter, Pitcher, Ballpark } from '@/types';
import { GAMES, PITCHERS, BALLPARKS, TEAMS } from '@/data/mockData';
import { HR_PROJECTIONS } from '@/data/mockData';
import {
  getProbabilityColor, getConfidenceTierBg, getPlatoonLabel,
  getPlatoonColor, getParkFactorColor, getParkFactorLabel,
  getWindImpactLabel, formatAvg
} from '@/lib/hrProjectionEngine';
import ProgressBar from '@/components/ui/ProgressBar';

interface MatchupBreakdownProps {
  batter: Batter;
}

export default function MatchupBreakdown({ batter }: MatchupBreakdownProps) {
  const projection = HR_PROJECTIONS.find(p => p.batterId === batter.id);

  if (!projection) {
    return (
      <div className="card-base rounded-xl p-6 text-center">
        <p className="text-sm text-slate-500">No game scheduled today for {batter.name}</p>
        <p className="text-xs text-slate-600 mt-1">Check back when the schedule is updated</p>
      </div>
    );
  }

  const game = GAMES.find(g => g.id === projection.gameId);
  const pitcher = PITCHERS[projection.opposingPitcherId];
  const ballpark = BALLPARKS[projection.ballparkId];

  if (!game || !pitcher || !ballpark) return null;

  const oppTeamId = game.awayTeamId === batter.teamId ? game.homeTeamId : game.awayTeamId;
  const oppTeam = TEAMS[oppTeamId];
  const batterTeam = TEAMS[batter.teamId];
  const probColor = getProbabilityColor(projection.hrProbability);
  const tierBg = getConfidenceTierBg(projection.confidenceTier);

  const splitData = pitcher.throws === 'L' ? batter.splits.vsLeft : batter.splits.vsRight;

  return (
    <div className="card-base rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-400 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Today's Matchup</h3>
          <p className="text-xs text-slate-500 mt-0.5">Apr 4, 2026 — {game.timeET}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${tierBg}`}>
            {projection.confidenceTier.charAt(0).toUpperCase() + projection.confidenceTier.slice(1)} Confidence
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* HR Probability hero */}
        <div className="bg-surface-600 border border-surface-300 rounded-xl p-4 text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">HR Probability Today</p>
          <p className={`text-5xl font-black font-mono-stat ${probColor}`}>
            {projection.hrProbability.toFixed(1)}%
          </p>
          <ProgressBar
            value={projection.hrProbability}
            max={35}
            color={projection.hrProbability >= 22 ? 'bg-amber-400' : projection.hrProbability >= 16 ? 'bg-emerald-400' : 'bg-blue-400'}
            height={6}
            className="mt-3 max-w-xs mx-auto"
          />
          <p className="text-xs text-slate-500 mt-2">
            {projection.projectedAtBats.toFixed(1)} projected AB · Rank #{projection.rank} today
          </p>
        </div>

        {/* Matchup details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pitcher */}
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Opposing Pitcher</p>
            <p className="text-sm font-bold text-slate-100">{pitcher.name}</p>
            <p className="text-xs text-slate-500 mb-2.5">{oppTeam?.abbreviation} · {pitcher.throws}HP · {pitcher.avgFastballVelo.toFixed(1)} mph FB</p>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-xs text-slate-500">ERA</p>
                <p className={`text-sm font-bold font-mono-stat ${pitcher.era <= 3.0 ? 'text-emerald-400' : pitcher.era >= 4.5 ? 'text-red-400' : 'text-amber-400'}`}>{pitcher.era.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">HR/9</p>
                <p className={`text-sm font-bold font-mono-stat ${pitcher.hr9 >= 1.3 ? 'text-red-400' : pitcher.hr9 >= 1.0 ? 'text-amber-400' : 'text-emerald-400'}`}>{pitcher.hr9.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">HR/FB</p>
                <p className={`text-sm font-bold font-mono-stat ${pitcher.hrFbRate >= 0.13 ? 'text-red-400' : pitcher.hrFbRate >= 0.10 ? 'text-amber-400' : 'text-emerald-400'}`}>{(pitcher.hrFbRate * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Split vs pitcher handedness */}
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              {batter.name.split(' ')[0]} vs {pitcher.throws}HP (2025)
            </p>
            <div className="grid grid-cols-3 gap-1 text-center mb-2">
              <div>
                <p className="text-xs text-slate-500">AVG</p>
                <p className="text-sm font-bold font-mono-stat text-slate-200">{formatAvg(splitData.avg)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">OBP</p>
                <p className="text-sm font-bold font-mono-stat text-slate-200">{formatAvg(splitData.obp)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">SLG</p>
                <p className="text-sm font-bold font-mono-stat text-slate-200">{formatAvg(splitData.slg)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-surface-400">
              <span className="text-xs text-slate-500">HR in {splitData.pa} PA</span>
              <span className="text-sm font-bold font-mono-stat text-amber-400">{splitData.hr} HR</span>
            </div>
            <div className="mt-1.5">
              <span className={`text-xs font-medium ${getPlatoonColor(projection.platoonAdvantage)}`}>
                {getPlatoonLabel(projection.platoonAdvantage)}
              </span>
            </div>
          </div>

          {/* Ballpark */}
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Ballpark</p>
            <p className="text-sm font-bold text-slate-100">{ballpark.name}</p>
            <p className="text-xs text-slate-500 mb-2">{ballpark.city} · {ballpark.elevation.toLocaleString()} ft elevation</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">HR Factor</span>
              <span className={`text-sm font-bold font-mono-stat ${getParkFactorColor(ballpark.hrFactor)}`}>
                {ballpark.hrFactor.toFixed(2)}x — {getParkFactorLabel(ballpark.hrFactor)}
              </span>
            </div>
          </div>

          {/* Weather */}
          <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Weather Conditions</p>
            <p className="text-sm font-bold text-slate-100">{game.weather.temp}°F · {game.weather.condition}</p>
            <p className="text-xs text-slate-500 mb-2">{getWindImpactLabel(game.weather.windToward, game.weather.windSpeed)}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">HR Impact</span>
              <span className={`text-sm font-bold ${game.weather.hrImpact === 'positive' ? 'text-emerald-400' : game.weather.hrImpact === 'negative' ? 'text-red-400' : 'text-slate-400'}`}>
                {game.weather.hrImpact === 'positive' ? '↑ Favorable' : game.weather.hrImpact === 'negative' ? '↓ Suppressing' : '→ Neutral'}
                {' '}({game.weather.hrImpactScore.toFixed(1)}/10)
              </span>
            </div>
          </div>
        </div>

        {/* Key factors */}
        <div className="bg-surface-600 border border-surface-300 rounded-lg p-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Key Projection Factors</p>
          <div className="space-y-1.5">
            {projection.keyFactors.map((factor, i) => (
              <div key={`kf-${projection.id}-${i}`} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-brand-400 flex-shrink-0 mt-0.5">›</span>
                <span>{factor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Matchup Score', value: `${projection.matchupScore}/100`, color: projection.matchupScore >= 80 ? 'text-amber-400' : projection.matchupScore >= 65 ? 'text-emerald-400' : 'text-slate-300' },
            { label: 'Park Boost', value: `${projection.parkFactorBoost.toFixed(2)}x`, color: projection.parkFactorBoost >= 1.15 ? 'text-red-400' : projection.parkFactorBoost >= 1.05 ? 'text-amber-400' : 'text-slate-400' },
            { label: 'Form Mult.', value: `${projection.formMultiplier.toFixed(2)}x`, color: projection.formMultiplier >= 1.1 ? 'text-emerald-400' : 'text-slate-300' },
          ].map(s => (
            <div key={`score-${s.label}`} className="bg-surface-600 border border-surface-300 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-sm font-bold font-mono-stat ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}