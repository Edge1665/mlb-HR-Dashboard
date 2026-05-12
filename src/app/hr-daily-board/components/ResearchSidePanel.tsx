"use client";

import React from "react";
import { X } from "lucide-react";
import { formatProbabilityPercent, HR_CHANCE_LABEL } from "@/services/hrChanceDisplay";
import { PITCH_GROUP_DISPLAY_NAMES } from "@/services/pitchMixTaxonomy";

type TrendFlag = {
  key: string;
  label: string;
  tone: "positive" | "neutral" | "caution";
};

type ResearchRow = {
  batterId: string;
  batterName: string;
  matchupLabel: string;
  gameTime: string | null;
  modelScore: number;
  displayedHrProbability?: number | null;
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  researchScores: {
    hrResearchScore: number;
    contactQualityScore: number;
    matchupScore: number;
    environmentScore: number;
    pitchTypeFitScore: number;
    trendStrengthScore: number;
  };
  research: {
    battingOrder: number | null;
    homeAway: "home" | "away";
    opponentPitcherName: string | null;
    opponentPitcherHand: "L" | "R" | null;
    park: string | null;
    weather: {
      temperature: number | null;
      windSpeed: number | null;
      windDirection: string | null;
      windToward: "in" | "out" | "crosswind" | "neutral" | null;
      condition: string | null;
    };
    recentForm: Array<{
      label: "last7" | "last14" | "last30";
      gamesPlayed: number;
      plateAppearances: number;
      atBats: number;
      hits: number;
      homeRuns: number;
      extraBaseHits: number;
      battingAverage: number | null;
      slugging: number | null;
      iso: number | null;
      hardHitProxy: number | null;
    }>;
    splits: {
      vsRhp: {
        slugging: number | null;
        iso: number | null;
        homeRuns: number | null;
        sampleSize: number;
      } | null;
      vsLhp: {
        slugging: number | null;
        iso: number | null;
        homeRuns: number | null;
        sampleSize: number;
      } | null;
      home: {
        slugging: number | null;
        iso: number | null;
        homeRuns: number | null;
        sampleSize: number;
      } | null;
      away: {
        slugging: number | null;
        iso: number | null;
        homeRuns: number | null;
        sampleSize: number;
      } | null;
      last20: {
        slugging: number | null;
        iso: number | null;
        homeRuns: number | null;
        sampleSize: number;
      } | null;
    };
    matchup: {
      pitcherHr9: number | null;
      pitcherFlyBallRate: number | null;
      pitcherRecentHr9Allowed: number | null;
      recentVsOpponent: {
        slugging: number | null;
        iso: number | null;
        homeRuns: number | null;
        sampleSize: number;
      } | null;
    };
    statcast: {
      barrelRate: number | null;
      hardHitRate: number | null;
      averageExitVelocity: number | null;
      xSlugging: number | null;
      flyBallRate: number | null;
      pullRate: number | null;
    };
    pitchMix: {
      fitDetails: Array<{
        pitchGroup: "FF_SI" | "SL" | "CH" | "CU" | "FC" | "FS_SPL";
        usagePercent: number | null;
        hitterSkill: number | null;
      }>;
    };
    environment: {
      parkFactor: number | null;
      hrEnvironmentScore: number | null;
      hrEnvironmentLabel: "favorable" | "neutral" | "poor";
    };
    trendFlags: TrendFlag[];
    researchSummary: string;
  };
};

function formatAmericanOdds(odds: number | null) {
  if (odds == null) return "--";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatDecimal(value: number | null, digits = 3) {
  if (value == null) return "--";
  return value.toFixed(digits);
}

function getFlagClass(tone: TrendFlag["tone"]): string {
  if (tone === "positive")
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  if (tone === "caution")
    return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  return "border-slate-500/25 bg-slate-500/10 text-slate-300";
}

function scoreCard(label: string, value: number) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function splitCard(
  label: string,
  split: {
    slugging: number | null;
    iso: number | null;
    homeRuns: number | null;
    sampleSize: number;
  } | null,
) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">
        SLG {formatDecimal(split?.slugging ?? null)}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        ISO {formatDecimal(split?.iso ?? null)} | HR {split?.homeRuns ?? "--"} |
        Sample {split?.sampleSize ?? "--"}
      </p>
    </div>
  );
}

export default function ResearchSidePanel({
  row,
  onClose,
}: {
  row: ResearchRow | null;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-950 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Player Research
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {row.batterName}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {row.matchupLabel}
              {row.gameTime ? ` | ${row.gameTime}` : ""}
              {row.research.battingOrder
                ? ` | Batting ${row.research.battingOrder}`
                : ""}
              {` | ${row.research.homeAway}`}
            </p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-emerald-300">
              {HR_CHANCE_LABEL} {formatProbabilityPercent(row.displayedHrProbability)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white"
            aria-label="Close research panel"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
          <p className="text-sm leading-relaxed text-slate-100">
            {row.research.researchSummary}
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {scoreCard("Model Score", Math.round(row.modelScore * 100))}
          {scoreCard("Research Score", row.researchScores.hrResearchScore)}
          {scoreCard("Pitch-Type Fit", row.researchScores.pitchTypeFitScore)}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              HR Odds
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {formatAmericanOdds(row.sportsbookOddsAmerican)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Implied {formatProbabilityPercent(row.impliedProbability)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Pitcher
            </p>
            <p className="mt-1 text-base font-semibold text-white">
              {row.research.opponentPitcherName ?? "--"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Throws {row.research.opponentPitcherHand ?? "--"} | HR/9{" "}
              {formatDecimal(row.research.matchup.pitcherHr9 ?? null, 2)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Environment
            </p>
            <p className="mt-1 text-base font-semibold capitalize text-white">
              {row.research.environment.hrEnvironmentLabel}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Park{" "}
              {formatDecimal(row.research.environment.parkFactor ?? null, 2)} |
              Score{" "}
              {formatDecimal(
                row.research.environment.hrEnvironmentScore ?? null,
                1,
              )}
            </p>
          </div>
        </div>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Trend Flags
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.research.trendFlags.map((flag) => (
              <span
                key={`${row.batterId}-${flag.key}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${getFlagClass(flag.tone)}`}
              >
                {flag.label}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Recent Form
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {row.research.recentForm.map((window) => (
              <div
                key={`${row.batterId}-${window.label}`}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  {window.label}
                </p>
                <p className="mt-2 text-sm font-medium text-white">
                  {window.homeRuns} HR | {window.extraBaseHits} XBH |{" "}
                  {window.gamesPlayed} G
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  PA {window.plateAppearances} | AVG{" "}
                  {formatDecimal(window.battingAverage)} | SLG{" "}
                  {formatDecimal(window.slugging)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  ISO {formatDecimal(window.iso)} | Hard-hit proxy{" "}
                  {formatDecimal(window.hardHitProxy, 1)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Handedness And Venue Splits
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {splitCard("Vs RHP", row.research.splits.vsRhp)}
            {splitCard("Vs LHP", row.research.splits.vsLhp)}
            {splitCard("Home", row.research.splits.home)}
            {splitCard("Away", row.research.splits.away)}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Opponent Pitcher And Environment
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Pitcher context
              </p>
              <p className="mt-2 text-sm text-white">
                HR/9 {formatDecimal(row.research.matchup.pitcherHr9, 2)} |
                Recent HR/9{" "}
                {formatDecimal(row.research.matchup.pitcherRecentHr9Allowed, 2)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Fly-ball tendency{" "}
                {formatDecimal(row.research.matchup.pitcherFlyBallRate, 1)}%
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Recent vs opponent: ISO{" "}
                {formatDecimal(
                  row.research.matchup.recentVsOpponent?.iso ?? null,
                )}{" "}
                | HR {row.research.matchup.recentVsOpponent?.homeRuns ?? "--"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Weather and park
              </p>
              <p className="mt-2 text-sm text-white">
                {row.research.park ?? "--"} |{" "}
                {row.research.weather.condition ?? "Conditions unavailable"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Temp {row.research.weather.temperature ?? "--"} | Wind{" "}
                {row.research.weather.windSpeed ?? "--"} mph{" "}
                {row.research.weather.windDirection ?? ""}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Wind toward {row.research.weather.windToward ?? "--"} |
                Environment {row.research.environment.hrEnvironmentLabel}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Statcast Snapshot
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Contact quality
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Barrel {formatDecimal(row.research.statcast.barrelRate, 1)}% |
                Hard-hit {formatDecimal(row.research.statcast.hardHitRate, 1)}%
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Avg EV{" "}
                {formatDecimal(row.research.statcast.averageExitVelocity, 1)} |
                xSLG {formatDecimal(row.research.statcast.xSlugging)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Batted-ball shape
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Fly-ball {formatDecimal(row.research.statcast.flyBallRate, 1)}%
                | Pull {formatDecimal(row.research.statcast.pullRate, 1)}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Score detail
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Contact {row.researchScores.contactQualityScore} | Matchup{" "}
                {row.researchScores.matchupScore}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Environment {row.researchScores.environmentScore} | Trend{" "}
                {row.researchScores.trendStrengthScore}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Pitch-Type Layer
          </h3>
          <div className="mt-3 space-y-2">
            {row.research.pitchMix.fitDetails.slice(0, 5).map((detail) => (
              <div
                key={`${row.batterId}-${detail.pitchGroup}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-white">
                    {PITCH_GROUP_DISPLAY_NAMES[detail.pitchGroup]}
                  </p>
                  <p className="text-xs text-slate-400">
                    Usage {formatDecimal(detail.usagePercent, 1)}%
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">
                  Skill {formatDecimal(detail.hitterSkill, 2)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
