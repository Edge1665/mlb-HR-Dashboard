"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw } from "lucide-react";

type HRRBoardRow = {
  rank: number;
  batterId: string;
  playerName: string;
  matchup: string;
  gameTime: string | null;
  probability1Plus: number;
  probability2Plus: number;
  probability3Plus: number;
  battingOrder: number | null;
  teamTotal: number | null;
  opposingPitcher: string | null;
  summaryTag: "Floor" | "Balanced" | "Ceiling";
  confidence: "High" | "Medium" | "Low";
  lineupConfirmed: boolean;
};

type HRRBoardResponse = {
  ok: boolean;
  targetDate: string;
  generatedAt: string;
  confirmedCount: number;
  unconfirmedCount: number;
  rows: HRRBoardRow[];
};

type SortDirection = "asc" | "desc";
type SortKey = "probability1Plus" | "probability2Plus" | "probability3Plus";

function formatGameTime(value: string | null): string {
  return value ?? "--";
}

function formatTeamTotal(value: number | null): string {
  return value == null ? "--" : value.toFixed(2);
}

function formatProbability(value: number): string {
  return `${value.toFixed(1)}%`;
}

function renderSortButton(
  label: string,
  buttonKey: SortKey,
  sortKey: SortKey,
  sortDirection: SortDirection,
  onToggle: (nextKey: SortKey) => void,
) {
  const isActive = sortKey === buttonKey;

  return (
    <button
      type="button"
      onClick={() => onToggle(buttonKey)}
      className="inline-flex items-center gap-2 font-semibold text-slate-100"
    >
      {label}
      {isActive ? (
        sortDirection === "desc" ? (
          <ArrowDown size={14} />
        ) : (
          <ArrowUp size={14} />
        )
      ) : null}
    </button>
  );
}

export default function HRRProbabilityBoardClient() {
  const [data, setData] = useState<HRRBoardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("probability2Plus");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    void loadBoard();
  }, []);

  async function loadBoard(force = false) {
    setLoading(true);
    setError(null);

    try {
      const url = force ? `/api/hrr-board?ts=${Date.now()}` : "/api/hrr-board";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load HRR board");
      }

      const payload = (await response.json()) as HRRBoardResponse;
      if (!payload.ok) {
        throw new Error("Failed to load HRR board");
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load HRR board");
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const source = data?.rows ?? [];
    const sorted = [...source].sort((a, b) => {
      const primary =
        sortDirection === "desc"
          ? b[sortKey] - a[sortKey]
          : a[sortKey] - b[sortKey];
      if (primary !== 0) return primary;

      if (sortDirection === "desc") {
        if (b.probability3Plus !== a.probability3Plus) {
          return b.probability3Plus - a.probability3Plus;
        }
        if (b.probability1Plus !== a.probability1Plus) {
          return b.probability1Plus - a.probability1Plus;
        }
      } else {
        if (a.probability3Plus !== b.probability3Plus) {
          return a.probability3Plus - b.probability3Plus;
        }
        if (a.probability1Plus !== b.probability1Plus) {
          return a.probability1Plus - b.probability1Plus;
        }
      }

      return a.playerName.localeCompare(b.playerName);
    });

    return sorted.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [data?.rows, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("desc");
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Loader2 size={32} className="animate-spin text-slate-300" />
        <p className="text-sm text-slate-300">Loading HRR Board...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">HRR Board</h1>
          <p className="mt-2 text-sm text-slate-400">
            Expected offensive production board for Hits + Runs + RBIs.
          </p>
        </div>
        <p className="text-sm text-rose-300">{error ?? "Failed to load board."}</p>
        <button
          type="button"
          onClick={() => void loadBoard(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 transition hover:bg-slate-800"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">HRR Board</h1>
          <p className="mt-2 text-sm text-slate-400">
            Separate board for expected Hits + Runs + RBIs using split floor,
            balanced, and ceiling probability views.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Date: {data.targetDate} | Generated: {data.generatedAt}
          </p>
          <p className="text-sm text-slate-400">
            Confirmed: {data.confirmedCount} | Unconfirmed: {data.unconfirmedCount}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadBoard(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Refresh board
        </button>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100">
        Default ranking is by 2+ HRR probability. Floor, balanced, and ceiling
        tags summarize which outcome profile stands out most for each hitter.
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="bg-slate-900/95 text-slate-200">
            <tr>
              <th className="border-b border-slate-800 px-4 py-3 text-left">#</th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Player Name
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Matchup
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Game Time
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                {renderSortButton(
                  "1+ HRR %",
                  "probability1Plus",
                  sortKey,
                  sortDirection,
                  toggleSort,
                )}
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                {renderSortButton(
                  "2+ HRR %",
                  "probability2Plus",
                  sortKey,
                  sortDirection,
                  toggleSort,
                )}
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                {renderSortButton(
                  "3+ HRR %",
                  "probability3Plus",
                  sortKey,
                  sortDirection,
                  toggleSort,
                )}
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Batting Order
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Team Total
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Opposing Pitcher
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Confidence
              </th>
              <th className="border-b border-slate-800 px-4 py-3 text-left">
                Tag
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.batterId}
                className="border-b border-slate-800/80 bg-slate-950/40 transition hover:bg-slate-900/60"
              >
                <td className="px-4 py-3 text-slate-300">{row.rank}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{row.playerName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.lineupConfirmed ? "Confirmed lineup" : "Projected lineup"}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">{row.matchup}</td>
                <td className="px-4 py-3 text-slate-300">
                  {formatGameTime(row.gameTime)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex min-w-20 justify-center rounded-full bg-sky-500/15 px-3 py-1 font-semibold text-sky-200">
                    {formatProbability(row.probability1Plus)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex min-w-20 justify-center rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-200">
                    {formatProbability(row.probability2Plus)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex min-w-20 justify-center rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-200">
                    {formatProbability(row.probability3Plus)}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {row.battingOrder ?? "--"}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {formatTeamTotal(row.teamTotal)}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {row.opposingPitcher ?? "--"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      row.confidence === "High"
                        ? "bg-emerald-500/15 text-emerald-200"
                        : row.confidence === "Medium"
                          ? "bg-amber-500/15 text-amber-200"
                          : "bg-rose-500/15 text-rose-200"
                    }`}
                  >
                    {row.confidence}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      row.summaryTag === "Floor"
                        ? "bg-sky-500/15 text-sky-200"
                        : row.summaryTag === "Ceiling"
                          ? "bg-amber-500/15 text-amber-200"
                          : "bg-emerald-500/15 text-emerald-200"
                    }`}
                  >
                    {row.summaryTag}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
