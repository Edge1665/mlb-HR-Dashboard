'use client';
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Zap, FlaskConical, FileText, Sparkles, Clock } from 'lucide-react';

import ProgressBar from '@/components/ui/ProgressBar';
import StatPill from '@/components/ui/StatPill';
import type { HRProjection, Batter, Pitcher, Game, Ballpark, Team } from '@/types';
import { getConfidenceTierBg, getProbabilityColor, getPlatoonLabel, getPlatoonColor, formatAvg, getBarrelRateColor, getExitVeloColor, getParkFactorColor } from '@/lib/hrProjectionEngine';

interface HRProjectionCardProps {
  projection: HRProjection;
  batter: Batter;
  pitcher: Pitcher | null;
  game: Game | null;
  ballpark: Ballpark | null;
  rank: number;
  teams: Record<string, Team>;
}

export default function HRProjectionCard({ projection, batter, pitcher, game, ballpark, rank, teams }: HRProjectionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  const team = teams[batter?.teamId ?? ''];
  const oppTeamId = game
    ? (game.awayTeamId === batter?.teamId ? game.homeTeamId : game.awayTeamId)
    : '';
  const oppTeam = teams[oppTeamId ?? ''];

  const probColor = getProbabilityColor(projection.hrProbability);
  const tierBg = getConfidenceTierBg(projection.confidenceTier);

  const gaugeColor =
    projection.hrProbability >= 22 ? '#f59e0b' :
    projection.hrProbability >= 16 ? '#22c55e' :
    projection.hrProbability >= 10 ? '#60a5fa' : '#64748b';

  // Safe access to batter recent form
  const last7HR = batter?.last7?.hr ?? 0;
  const last7Avg = batter?.last7?.avg ?? 0;
  const isHot = last7HR >= 2;
  const isCold = last7HR === 0 && last7Avg < 0.200;
  const isLineupConfirmed = projection.lineupConfirmed !== false;

  // Safe access to statcast
  const barrelRate = batter?.statcast?.barrelRate ?? 0;
  const exitVeloAvg = batter?.statcast?.exitVelocityAvg ?? 0;
  const iso = batter?.season?.iso ?? 0;

  // Safe weather impact
  const weatherImpact = game?.weather?.hrImpact ?? 'neutral';

  // Safe ballpark factor
  const parkFactor = ballpark?.hrFactor ?? 1.0;

  if (!batter) return null;

  return (
    <div className={`card-base card-hover rounded-xl overflow-hidden transition-all duration-200 ${expanded ? 'border-brand-500/30' : ''} ${!isLineupConfirmed ? 'opacity-90 border-amber-500/10' : ''}`}>
      {/* Rank strip */}
      <div className={`h-0.5 w-full ${!isLineupConfirmed ? 'bg-gradient-to-r from-amber-500/40 to-amber-500/5' : rank <= 2 ? 'bg-gradient-to-r from-amber-400/80 to-amber-400/20' : rank <= 5 ? 'bg-gradient-to-r from-emerald-400/60 to-emerald-400/10' : 'bg-gradient-to-r from-blue-400/40 to-blue-400/5'}`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            {/* Rank badge */}
            <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono-stat ${rank === 1 ? 'bg-amber-400/20 text-amber-400' : rank <= 3 ? 'bg-emerald-400/20 text-emerald-400' : 'bg-surface-400 text-slate-400'}`}>
              {rank}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-100 truncate">{batter.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-slate-500">{team?.abbreviation ?? '—'}</span>
                <span className="text-slate-600 text-xs">·</span>
                <span className="text-xs text-slate-500">{batter.position}</span>
                <span className="text-slate-600 text-xs">·</span>
                <span className="text-xs text-slate-500">Bats {batter.bats}</span>
                {batter.lineupSpot != null && (
                  <>
                    <span className="text-slate-600 text-xs">·</span>
                    <span className="text-xs text-slate-500">#{batter.lineupSpot} spot</span>
                  </>
                )}
              </div>
              {/* Team name, matchup, and game time */}
              {team && (
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-slate-400">{team.city} {team.name}</span>
                </div>
              )}
              {game && (
                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {(() => {
                    const awayTeam = teams[game.awayTeamId];
                    const homeTeam = teams[game.homeTeamId];
                    const matchup = awayTeam && homeTeam
                      ? `${awayTeam.city} ${awayTeam.name} @ ${homeTeam.city} ${homeTeam.name}`
                      : null;
                    return matchup ? (
                      <span className="text-xs text-slate-500 truncate">{matchup}</span>
                    ) : null;
                  })()}
                  {(game.timeET || game.time) && (
                    <>
                      <span className="text-slate-600 text-xs">·</span>
                      <span className="text-xs text-slate-500">{game.timeET ?? game.time}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* HR Probability gauge */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#232f42" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  stroke={gaugeColor}
                  strokeWidth="3"
                  strokeDasharray={`${(projection.hrProbability / 40) * 87.96} 87.96`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-xs font-bold font-mono-stat ${probColor}`}>
                  {projection.hrProbability.toFixed(0)}%
                </span>
              </div>
            </div>
            <span className="text-xs text-slate-500 mt-0.5">HR%</span>
          </div>
        </div>

        {/* Matchup line */}
        <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
          <span className="text-slate-400">vs</span>
          {pitcher ? (
            <>
              <span className="font-medium text-slate-300">{pitcher.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${pitcher.throws === 'L' ? 'bg-blue-400/10 text-blue-400' : 'bg-orange-400/10 text-orange-400'}`}>
                {pitcher.throws}HP
              </span>
            </>
          ) : (
            <span className="text-slate-500 italic">TBD pitcher</span>
          )}
          {oppTeam && (
            <>
              <span className="text-slate-500">·</span>
              <span className="text-slate-500">{oppTeam.abbreviation}</span>
            </>
          )}
          {ballpark && (
            <>
              <span className="text-slate-500">·</span>
              <span className="text-slate-500 truncate">{ballpark.name.split(' ').slice(0, 2).join(' ')}</span>
            </>
          )}
        </div>

        {/* Key stats row */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          <StatPill label="Barrel%" value={`${barrelRate.toFixed(1)}%`} valueColor={getBarrelRateColor(barrelRate)} size="xs" />
          <StatPill label="Exit Velo" value={`${exitVeloAvg.toFixed(1)}`} valueColor={getExitVeloColor(exitVeloAvg)} size="xs" />
          <StatPill label="ISO" value={formatAvg(iso)} valueColor="text-slate-200" size="xs" />
          <StatPill label="HR/7d" value={last7HR.toString()} valueColor={last7HR >= 2 ? 'text-amber-400' : 'text-slate-300'} size="xs" />
        </div>

        {/* Progress bar */}
        <ProgressBar
          value={projection.hrProbability}
          max={35}
          color={projection.hrProbability >= 22 ? 'bg-amber-400' : projection.hrProbability >= 16 ? 'bg-emerald-400' : 'bg-blue-400'}
          height={3}
          className="mb-3"
        />

        {/* Tags row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Lineup TBD badge */}
          {!isLineupConfirmed && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              <Clock size={10} />
              Lineup TBD
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${tierBg}`}>
            {projection.confidenceTier.charAt(0).toUpperCase() + projection.confidenceTier.slice(1)}
          </span>
          <span className={`text-xs font-medium ${getPlatoonColor(projection.platoonAdvantage)}`}>
            {getPlatoonLabel(projection.platoonAdvantage)}
          </span>

          {isHot && (
            <span className="flex items-center gap-1 text-xs text-orange-400">
              <Zap size={10} />Hot
            </span>
          )}
          {isCold && (
            <span className="text-xs text-blue-400">Cold</span>
          )}

          {/* Model badge */}
          <span className="flex items-center gap-1 text-xs text-brand-400 ml-auto">
            <FlaskConical size={10} />
            <span>Model</span>
          </span>

          {/* Gemini AI badge — shown when Gemini enhancement is available */}
          {projection.geminiProbability != null && (
            <span className="flex items-center gap-1 text-xs text-violet-400">
              <Sparkles size={10} />
              <span>AI</span>
            </span>
          )}

          {/* Park factor */}
          <span className={`text-xs font-medium ${getParkFactorColor(parkFactor)}`}>
            {parkFactor.toFixed(2)}x park
          </span>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-400">
          {/* Key factors toggle */}
          <button
            onClick={() => { setExpanded(!expanded); if (showExplanation) setShowExplanation(false); }}
            className="flex-1 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{expanded ? 'Hide factors' : 'Key factors'}</span>
          </button>

          {/* Explanation toggle — only show if explanation is available */}
          {projection.explanation && (
            <>
              <div className="w-px h-4 bg-surface-400" />
              <button
                onClick={() => { setShowExplanation(!showExplanation); if (expanded) setExpanded(false); }}
                className="flex-1 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors duration-150"
              >
                <FileText size={13} />
                <span>{showExplanation ? 'Hide analysis' : 'Why this pick'}</span>
              </button>
            </>
          )}
        </div>

        {/* Expanded key factors */}
        {expanded && (
          <div className="mt-3 space-y-1.5 animate-slide-up">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Model Inputs</p>
            {(projection.keyFactors ?? []).map((factor, i) => (
              <div key={`factor-${projection.id}-${i}`} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-brand-400 mt-0.5 flex-shrink-0">›</span>
                <span>{factor}</span>
              </div>
            ))}
            <div className="mt-3 pt-3 border-t border-surface-400 grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-xs text-slate-500">Proj. PA</p>
                <p className="text-sm font-semibold font-mono-stat text-slate-200">{projection.projectedAtBats.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Matchup</p>
                <p className="text-sm font-semibold font-mono-stat text-slate-200">{projection.matchupScore}/100</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Weather</p>
                <p className={`text-sm font-semibold font-mono-stat ${weatherImpact === 'positive' ? 'text-emerald-400' : weatherImpact === 'negative' ? 'text-red-400' : 'text-slate-300'}`}>
                  {weatherImpact === 'positive' ? '↑ Boost' : weatherImpact === 'negative' ? '↓ Suppress' : '→ Neutral'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Plain-English explanation panel */}
        {showExplanation && projection.explanation && (
          <div className="mt-3 animate-slide-up">

            <div className="flex items-center gap-1.5 mb-2">
              <FileText size={12} className="text-brand-400" />
              <p className="text-xs text-slate-500 uppercase tracking-wider">Model Analysis</p>
            </div>
            <div className="bg-surface-300/50 rounded-lg p-3 border border-surface-400">
              <p className="text-xs text-slate-300 leading-relaxed">{projection.explanation}</p>
            </div>

            {/* Gemini AI Enhancement Panel */}
            {projection.geminiReasoning && (
              <div className="mt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={12} className="text-violet-400" />
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Gemini AI Analysis</p>
                  {projection.geminiConfidence && (
                    <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-medium ${
                      projection.geminiConfidence === 'high' ? 'bg-emerald-400/10 text-emerald-400' :
                      projection.geminiConfidence === 'medium'? 'bg-blue-400/10 text-blue-400' : 'bg-slate-500/10 text-slate-400'
                    }`}>
                      {projection.geminiConfidence.charAt(0).toUpperCase() + projection.geminiConfidence.slice(1)} confidence
                    </span>
                  )}
                </div>

                {/* Probability comparison — uses correct 50/50 reverse formula */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="bg-surface-300/50 rounded-lg p-2 border border-surface-400 text-center">
                    <p className="text-xs text-slate-500 mb-0.5">Base Model</p>
                    <p className="text-sm font-bold font-mono-stat text-slate-300">
                      {projection.geminiProbability != null && projection.blendedProbability != null
                        ? `${(projection.blendedProbability * 2 - projection.geminiProbability).toFixed(1)}%`
                        : `${projection.hrProbability.toFixed(1)}%`}
                    </p>
                  </div>
                  <div className="bg-violet-400/5 rounded-lg p-2 border border-violet-400/20 text-center">
                    <p className="text-xs text-violet-400 mb-0.5">Gemini AI</p>
                    <p className="text-sm font-bold font-mono-stat text-violet-300">
                      {projection.geminiProbability?.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-brand-500/5 rounded-lg p-2 border border-brand-500/20 text-center">
                    <p className="text-xs text-brand-400 mb-0.5">Blended</p>
                    <p className="text-sm font-bold font-mono-stat text-brand-300">
                      {projection.blendedProbability?.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Why is this number low? — contextual reasoning panel */}
                {projection.blendedProbability != null && projection.blendedProbability < 8 && (
                  <div className="bg-slate-500/10 rounded-lg p-2.5 border border-slate-500/20 mb-2">
                    <div className="flex items-start gap-1.5">
                      <span className="text-slate-400 text-xs mt-0.5 flex-shrink-0">ℹ</span>
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-1">Why is this probability low?</p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Both the base model ({projection.geminiProbability != null && projection.blendedProbability != null
                            ? `${(projection.blendedProbability * 2 - projection.geminiProbability).toFixed(1)}%`
                            : '—'}) and Gemini AI ({projection.geminiProbability?.toFixed(1)}%) independently
                          scored this matchup below average. The 50/50 blend reflects both sources agreeing on limited
                          power upside for this specific matchup today.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Key insight */}
                {projection.geminiKeyInsight && (
                  <div className="bg-violet-400/5 rounded-lg p-2.5 border border-violet-400/20 mb-2">
                    <div className="flex items-start gap-1.5">
                      <Sparkles size={10} className="text-violet-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-violet-200 font-medium leading-relaxed">{projection.geminiKeyInsight}</p>
                    </div>
                  </div>
                )}

                {/* Full reasoning */}
                <div className="bg-surface-300/50 rounded-lg p-3 border border-surface-400">
                  <p className="text-xs text-slate-300 leading-relaxed">{projection.geminiReasoning}</p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-600 mt-2 italic">
              {projection.geminiReasoning
                ? 'Blended probability: 50% feature model + 50% Gemini AI analysis.' :'Based on actual model inputs only. Missing data defaults to league-average assumptions.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}