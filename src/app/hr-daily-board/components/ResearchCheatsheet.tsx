"use client";

import React from "react";
import { formatProbabilityPercent, HR_CHANCE_LABEL } from "@/services/hrChanceDisplay";

type TrendFlag = {
  key: string;
  label: string;
  tone: "positive" | "neutral" | "caution";
};

type CheatsheetRow = {
  rank: number;
  batterId: string;
  batterName: string;
  matchupLabel: string;
  gameTime: string | null;
  sportsbookOddsAmerican: number | null;
  modelScore: number;
  displayedHrProbability?: number | null;
  researchScores: {
    hrResearchScore: number;
  };
  research: {
    trendFlags: TrendFlag[];
  };
};

function formatAmericanOdds(odds: number | null) {
  if (odds == null) return "--";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getFlagClass(tone: TrendFlag["tone"]): string {
  if (tone === "positive") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }

  if (tone === "caution") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  }

  return "border-slate-500/25 bg-slate-500/10 text-slate-300";
}

export default function ResearchCheatsheet({
  rows,
  onOpenResearch,
}: {
  rows: CheatsheetRow[];
  onOpenResearch: (batterId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
            Research Cheatsheet
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Quick scan for screenshots and fast reads
          </h2>
        </div>
        <p className="max-w-md text-right text-xs leading-relaxed text-slate-400">
          Compact research layer built from the same live board payload, with
          trend flags and parallel research scoring.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <button
            key={`cheatsheet-${row.batterId}`}
            type="button"
            onClick={() => onOpenResearch(row.batterId)}
            className="grid w-full gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-left transition hover:border-slate-600 hover:bg-slate-900 md:grid-cols-[56px_minmax(0,1.6fr)_120px_120px_120px_minmax(0,1.6fr)]"
          >
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Rank
              </p>
              <p className="mt-1 text-2xl font-semibold text-white">
                #{row.rank}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-white">
                {row.batterName}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {row.matchupLabel}
                {row.gameTime ? ` | ${row.gameTime}` : ""}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                HR Odds
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {formatAmericanOdds(row.sportsbookOddsAmerican)}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                {HR_CHANCE_LABEL}
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {formatProbabilityPercent(row.displayedHrProbability)}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Research
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-300">
                {row.researchScores.hrResearchScore}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {row.research.trendFlags.slice(0, 4).map((flag) => (
                <span
                  key={`${row.batterId}-${flag.key}`}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getFlagClass(flag.tone)}`}
                >
                  {flag.label}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
