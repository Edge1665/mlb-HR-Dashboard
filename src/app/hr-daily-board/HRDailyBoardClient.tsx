"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import ResearchCheatsheet from "@/app/hr-daily-board/components/ResearchCheatsheet";
import ResearchSidePanel from "@/app/hr-daily-board/components/ResearchSidePanel";
import {
  formatProbabilityPercent,
  HR_CHANCE_INFO_TEXT,
  HR_CHANCE_LABEL,
} from "@/services/hrChanceDisplay";

type SortMode = "best" | "model" | "probability" | "edge" | "value";
type LineupMode = "confirmed" | "all";

type DailyBoardRow = {
  rank: number;
  batterId: string;
  batterName: string;
  teamId: string;
  opponentTeamId: string;
  awayTeamId: string;
  homeTeamId: string;
  gameId: string;
  gamePk: string;
  gameTime: string | null;
  matchupLabel: string;
  venueName: string | null;
  lineupConfirmed: boolean;
  rawModelProbability: number;
  calibratedHrProbability: number;
  predictedProbability: number;
  modelScore: number;
  sportsbookOddsAmerican: number | null;
  sportsbookImpliedProbability?: number | null;
  impliedProbability: number | null;
  modelEdge: number | null;
  edge: number | null;
  valueScore: number | null;
  valueTier: "Positive Value" | "Fair" | "Overpriced" | "No Odds";
  combinedScore: number | null;
  tier: string;
  hrTier:
    | "Tier 1 - Core"
    | "Tier 2 - Strong"
    | "Tier 3 - Value/Longshot"
    | "Tier 4 - Fringe";
  hrTierReason: string;
  sportsbook: string | null;
  reasons: string[];
  researchScores?: {
    hrResearchScore: number;
    contactQualityScore: number;
    matchupScore: number;
    environmentScore: number;
    pitchTypeFitScore: number;
    trendStrengthScore: number;
  } | null;
  research?: {
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
    trendFlags: Array<{
      key: string;
      label: string;
      tone: "positive" | "neutral" | "caution";
    }>;
    researchSummary: string;
  } | null;
};

type DailyBoardResponse = {
  ok: boolean;
  targetDate: string;
  sportsbooks: string[];
  generatedAt: string;
  trainingStartDate: string;
  trainingExampleCount: number;
  modelTrainedAt: string;
  sortMode: SortMode;
  lineupMode: LineupMode;
  confirmedCount: number;
  unconfirmedCount: number;
  predictedSlateEnvironment: "low_hr" | "medium_hr" | "high_hr";
  recommendedTopPlaysMin: number;
  recommendedTopPlaysMax: number;
  shouldConsiderSkippingSlate: boolean;
  diagnostics: {
    artifactVersion: string;
    calibrationBucketCount: number;
    globalPositiveRate: number;
    probabilitySummary: {
      rawMin: number;
      rawMedian: number;
      rawMax: number;
      calibratedMin: number;
      calibratedMedian: number;
      calibratedMax: number;
    };
    tierCounts: {
      tier1: number;
      tier2: number;
      tier3: number;
      tier4: number;
    };
    valueCounts: {
      positiveValue: number;
      fair: number;
      overpriced: number;
      noOdds: number;
    };
    exclusionCounts: Record<string, number>;
  };
  rows: DailyBoardRow[];
  fullRows?: DailyBoardRow[];
};

type CachedBoardPayload = {
  savedAt: string;
  sort: SortMode;
  lineupMode?: LineupMode;
  sportsbooks?: string;
  data: DailyBoardResponse;
};

const RAW_BOARD_CACHE_KEY_PREFIX = "hr-raw-board-cache-v6";

function formatAmericanOdds(odds: number | null) {
  if (odds == null) return "--";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatEdge(edge: number | null) {
  if (edge == null) return "--";
  const pct = (edge * 100).toFixed(2);
  return edge >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatCombinedScore(score: number | null) {
  if (score == null) return "--";
  return score.toFixed(3);
}

function formatValueScore(score: number | null) {
  if (score == null) return "--";
  return score.toFixed(2);
}

type DailyBoardRowWithResearch = DailyBoardRow & {
  researchScores: NonNullable<DailyBoardRow["researchScores"]>;
  research: NonNullable<DailyBoardRow["research"]>;
};

function hasResearch(row: DailyBoardRow): row is DailyBoardRowWithResearch {
  return Boolean(row.research && row.researchScores);
}

function getSlateGuidanceCopy(data: DailyBoardResponse): string {
  if (data.predictedSlateEnvironment === "high_hr") {
    return `High HR slate: reasonable to consider ${data.recommendedTopPlaysMin} to ${data.recommendedTopPlaysMax} plays.`;
  }

  if (data.predictedSlateEnvironment === "low_hr") {
    return "Low HR slate: possible skip slate, keep exposure very limited.";
  }

  return `Medium HR slate: tighter card, consider ${data.recommendedTopPlaysMin} to ${data.recommendedTopPlaysMax} plays.`;
}

function getSlateGuidanceClass(
  environment: DailyBoardResponse["predictedSlateEnvironment"],
): string {
  if (environment === "high_hr") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  if (environment === "low_hr") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  return "border-blue-500/30 bg-blue-500/10 text-blue-200";
}

function getTodayEtDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildCacheKey(
  sort: SortMode,
  lineupMode?: LineupMode,
  sportsbooks?: string,
): string {
  return `${RAW_BOARD_CACHE_KEY_PREFIX}:${sort}:${lineupMode ?? ""}:${sportsbooks ?? ""}`;
}

function readCachedBoard(
  sort: SortMode,
  lineupMode?: LineupMode,
  sportsbooks?: string,
): CachedBoardPayload | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(
    buildCacheKey(sort, lineupMode, sportsbooks),
  );
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedBoardPayload;
    if (parsed.data?.targetDate !== getTodayEtDateString()) {
      return null;
    }
    if (!Array.isArray(parsed.data?.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedBoard(payload: CachedBoardPayload) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    buildCacheKey(payload.sort, payload.lineupMode, payload.sportsbooks),
    JSON.stringify(payload),
  );
}

async function fetchDailyBoard(
  sort: SortMode,
  lineupMode?: LineupMode,
  sportsbooks?: string,
) {
  const params = new URLSearchParams({ sort });
  if (lineupMode) params.set("lineupMode", lineupMode);
  if (sportsbooks) params.set("sportsbooks", sportsbooks);

  const res = await fetch(`/api/hr-daily-board?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to load HR daily board");
  }

  return (await res.json()) as DailyBoardResponse;
}

export default function HRDailyBoardClient() {
  const searchParams = useSearchParams();
  const sort = useMemo<SortMode>(() => {
    const value = searchParams.get("sort");
    return value === "edge"
      ? "edge"
      : value === "best"
        ? "best"
        : value === "probability"
          ? "probability"
          : value === "value"
            ? "value"
            : "model";
  }, [searchParams]);
  const lineupMode = useMemo<LineupMode | undefined>(() => {
    const value = searchParams.get("lineupMode");
    return value === "all"
      ? "all"
      : value === "confirmed"
        ? "confirmed"
        : undefined;
  }, [searchParams]);
  const sportsbooks = searchParams.get("sportsbooks") ?? undefined;

  const [data, setData] = useState<DailyBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedAt, setLockedAt] = useState<string | null>(null);
  const [selectedBatterId, setSelectedBatterId] = useState<string | null>(null);

  const loadBoard = useCallback(
    async (options?: { force?: boolean }) => {
      const forceRefresh = options?.force === true;
      const cached = !forceRefresh
        ? readCachedBoard(sort, lineupMode, sportsbooks)
        : null;

      if (cached) {
        setData(cached.data);
        setLockedAt(cached.savedAt);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchDailyBoard(sort, lineupMode, sportsbooks);
        const payload: CachedBoardPayload = {
          savedAt: new Date().toISOString(),
          sort,
          lineupMode,
          sportsbooks,
          data: response,
        };
        writeCachedBoard(payload);
        setData(response);
        setLockedAt(payload.savedAt);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load HR daily board",
        );
      } finally {
        setLoading(false);
      }
    },
    [lineupMode, sort, sportsbooks],
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const handleManualRefresh = useCallback(() => {
    void loadBoard({ force: true });
  }, [loadBoard]);

  const selectedRow = useMemo<DailyBoardRowWithResearch | null>(
    () =>
      (data?.fullRows ?? data?.rows ?? [])
        .filter(hasResearch)
        .find((row) => row.batterId === selectedBatterId) ?? null,
    [data?.fullRows, data?.rows, selectedBatterId],
  );

  const selectedResearchRow = useMemo<
    React.ComponentProps<typeof ResearchSidePanel>["row"]
  >(
    () =>
      selectedRow
        ? { ...selectedRow, matchupLabel: selectedRow.matchupLabel }
        : null,
    [selectedRow],
  );

  const cheatsheetRows = useMemo(
    () =>
      (data?.rows ?? [])
        .filter(hasResearch)
        .slice(0, 20)
        .map((row) => ({
          ...row,
          matchupLabel: row.matchupLabel,
        })),
    [data?.rows],
  );

  const openResearch = useCallback((batterId: string) => {
    setSelectedBatterId(batterId);
  }, []);

  const closeResearch = useCallback(() => {
    setSelectedBatterId(null);
  }, []);

  const lockedAtLabel = lockedAt
    ? new Date(lockedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
          <Loader2 size={32} className="animate-spin text-slate-300" />
          <p className="text-sm text-slate-300">Loading Daily HR Board...</p>
        </div>
      </main>
    );
  }

  if (error || !data?.ok) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="mb-4 text-2xl font-bold">Daily HR Board</h1>
        <p>{error ?? "Failed to load board."}</p>
        <button
          onClick={handleManualRefresh}
          className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Daily HR Board</h1>
          <p className="text-sm text-gray-300">
            Date: {data.targetDate} | Generated: {data.generatedAt}
          </p>
          <p className="text-sm text-gray-300">
            Locked: {lockedAtLabel ?? "--"} | Refreshing the page will keep this
            board until you manually refresh it.
          </p>
          <p className="text-sm text-gray-300">
            Training start: {data.trainingStartDate} | Training examples:{" "}
            {data.trainingExampleCount}
          </p>
          <p className="text-sm text-gray-300">
            Sort mode: <span className="font-semibold">{data.sortMode}</span>
          </p>
          <p className="text-sm text-gray-300">
            Lineup mode:{" "}
            <span className="font-semibold">{data.lineupMode}</span> |
            Confirmed: {data.confirmedCount} | Unconfirmed:{" "}
            {data.unconfirmedCount}
          </p>
          {Array.isArray(data.sportsbooks) && data.sportsbooks.length > 0 && (
            <p className="text-sm text-gray-300">
              Sportsbooks: {data.sportsbooks.join(", ")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <a
              href="/hr-daily-board?sort=model"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Model View
            </a>
            <a
              href="/hr-daily-board?sort=edge"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Edge View
            </a>
            <a
              href="/hr-daily-board?sort=best"
              className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              Best Bets
            </a>
          </div>
          <a
            href={`/hr-daily-board?sort=${sort}&lineupMode=confirmed${sportsbooks ? `&sportsbooks=${encodeURIComponent(sportsbooks)}` : ""}`}
            className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            Confirmed Only
          </a>
          <a
            href={`/hr-daily-board?sort=${sort}&lineupMode=all${sportsbooks ? `&sportsbooks=${encodeURIComponent(sportsbooks)}` : ""}`}
            className="rounded border px-3 py-2 text-sm text-white hover:bg-gray-800"
          >
            Include Unconfirmed
          </a>
          <button
            onClick={handleManualRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh board now
          </button>
        </div>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 ${getSlateGuidanceClass(data.predictedSlateEnvironment)}`}
      >
        <p className="text-xs uppercase tracking-wide opacity-80">
          Slate guidance
        </p>
        <p className="mt-1 text-lg font-semibold">
          {data.predictedSlateEnvironment === "high_hr"
            ? "High HR slate"
            : data.predictedSlateEnvironment === "low_hr"
              ? "Low HR slate"
              : "Medium HR slate"}
        </p>
        <p className="mt-1 text-sm">{getSlateGuidanceCopy(data)}</p>
        <p className="mt-1 text-xs opacity-80">
          Recommended plays: {data.recommendedTopPlaysMin} to{" "}
          {data.recommendedTopPlaysMax}
          {data.shouldConsiderSkippingSlate
            ? " | Caution or possible skip slate"
            : ""}
        </p>
        <p className="mt-2 text-xs opacity-80">{HR_CHANCE_INFO_TEXT}</p>
      </div>

      <div className="rounded-xl border border-surface-400 bg-surface-800 px-4 py-3 text-xs text-slate-400">
        <p>
          Artifact {data.diagnostics.artifactVersion} | calibration buckets{" "}
          {data.diagnostics.calibrationBucketCount} | global positive rate{" "}
          {formatProbabilityPercent(data.diagnostics.globalPositiveRate)}
        </p>
        <p className="mt-1">
          Raw min/med/max {formatProbabilityPercent(data.diagnostics.probabilitySummary.rawMin)} /{" "}
          {formatProbabilityPercent(data.diagnostics.probabilitySummary.rawMedian)} /{" "}
          {formatProbabilityPercent(data.diagnostics.probabilitySummary.rawMax)}
        </p>
        <p className="mt-1">
          Cal min/med/max {formatProbabilityPercent(data.diagnostics.probabilitySummary.calibratedMin)} /{" "}
          {formatProbabilityPercent(data.diagnostics.probabilitySummary.calibratedMedian)} /{" "}
          {formatProbabilityPercent(data.diagnostics.probabilitySummary.calibratedMax)}
        </p>
      </div>

      <ResearchCheatsheet rows={cheatsheetRows} onOpenResearch={openResearch} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border text-sm">
          <thead>
            <tr className="bg-gray-100 text-black">
              <th className="border p-2 text-left">Rank</th>
              <th className="border p-2 text-left">Matchup</th>
              <th className="border p-2 text-left">Player</th>
              <th className="border p-2 text-left">Lineup</th>
              <th className="border p-2 text-left" title={HR_CHANCE_INFO_TEXT}>
                {HR_CHANCE_LABEL}
              </th>
              <th className="border p-2 text-left">Cal HR %</th>
              <th className="border p-2 text-left">Odds</th>
              <th className="border p-2 text-left">Implied</th>
              <th className="border p-2 text-left">Edge</th>
              <th className="border p-2 text-left">Value Score</th>
              <th className="border p-2 text-left">Value Tier</th>
              <th className="border p-2 text-left">Research</th>
              <th className="border p-2 text-left">Best Score</th>
              <th className="border p-2 text-left">Tier</th>
              <th className="border p-2 text-left">HR Tier</th>
              <th className="border p-2 text-left">Reasons</th>
              <th className="border p-2 text-left">Research View</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr
                key={`${row.gameId}-${row.batterId}`}
                onClick={() => {
                  if (hasResearch(row)) {
                    openResearch(row.batterId);
                  }
                }}
                className={
                  hasResearch(row)
                    ? "cursor-pointer transition hover:bg-slate-900/40"
                    : undefined
                }
              >
                <td className="border p-2">{row.rank}</td>
                <td className="border p-2">{row.matchupLabel}</td>
                <td className="border p-2 font-medium">{row.batterName}</td>
                <td className="border p-2">
                  {row.lineupConfirmed ? "Confirmed" : "Projected"}
                </td>
                <td className="border p-2">
                  {formatProbabilityPercent(row.predictedProbability)}
                </td>
                <td className="border p-2">
                  {formatProbabilityPercent(row.calibratedHrProbability)}
                </td>
                <td className="border p-2">
                  {formatAmericanOdds(row.sportsbookOddsAmerican)}
                </td>
                <td className="border p-2">
                  {formatProbabilityPercent(row.impliedProbability)}
                </td>
                <td className="border p-2">{formatEdge(row.edge)}</td>
                <td className="border p-2">{formatValueScore(row.valueScore)}</td>
                <td className="border p-2">{row.valueTier}</td>
                <td className="border p-2">
                  <div className="font-semibold text-emerald-300">
                    {row.researchScores?.hrResearchScore ?? "--"}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {row.research?.trendFlags
                      ?.slice(0, 2)
                      .map((flag) => flag.label)
                      .join(" | ") || "--"}
                  </div>
                </td>
                <td className="border p-2">
                  {formatCombinedScore(row.combinedScore)}
                </td>
                <td className="border p-2">{row.tier}</td>
                <td className="border p-2" title={row.hrTierReason}>
                  {row.hrTier}
                </td>
                <td className="border p-2">
                  <ul className="ml-5 list-disc">
                    {row.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {row.sportsbook && (
                    <div className="mt-2 text-xs text-gray-400">
                      Book: {row.sportsbook}
                    </div>
                  )}
                </td>
                <td className="border p-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (hasResearch(row)) {
                        openResearch(row.batterId);
                      }
                    }}
                    disabled={!hasResearch(row)}
                    className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-400"
                  >
                    {hasResearch(row) ? "Open Research" : "No Research"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResearchSidePanel row={selectedResearchRow} onClose={closeResearch} />
    </main>
  );
}
