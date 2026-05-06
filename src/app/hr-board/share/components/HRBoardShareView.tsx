import React from 'react';
import Link from 'next/link';
import type { DailyHRBoardResponse, DailyHRBoardRow } from '@/services/hrDailyBoardService';

interface HRBoardShareViewProps {
  board: DailyHRBoardResponse;
  rowLimit: 10 | 20;
}

function formatBoardDate(value: string): string {
  const date = new Date(`${value}T12:00:00-04:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(date);
}

function ShareRow({ row }: { row: DailyHRBoardRow }) {
  return (
    <div className="grid grid-cols-[38px_minmax(0,1fr)] gap-3 rounded-2xl border border-surface-400 bg-surface-800/90 px-4 py-3 shadow-[0_10px_24px_rgba(2,6,23,0.18)] print:border-slate-300 print:bg-white print:shadow-none">
      <div className="flex items-start justify-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-300 bg-surface-700 text-sm font-semibold text-slate-100 print:border-slate-300 print:bg-slate-50 print:text-slate-900">
          {row.rank}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-slate-100 print:text-slate-900">
            {row.batterName}
          </h2>
          <span className="rounded-full border border-surface-300 px-2 py-1 text-[11px] text-slate-400 print:border-slate-300 print:text-slate-600">
            {row.lineupConfirmed ? 'Confirmed' : 'Projected'}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400 print:text-slate-700">
          <span className="font-medium text-slate-200 print:text-slate-900">
            {row.matchupLabel}
          </span>
          <span>{row.gameTime ?? 'TBD'}</span>
        </div>
      </div>
    </div>
  );
}

export default function HRBoardShareView({ board, rowLimit }: HRBoardShareViewProps) {
  const rows = board.rows.slice(0, rowLimit);
  const boardDateLabel = formatBoardDate(board.targetDate);
  const leftColumnRows = rows.slice(0, Math.min(10, rows.length));
  const rightColumnRows = rows.slice(10, 20);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.12),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,1),_rgba(2,6,23,1))] px-4 py-6 text-slate-100 print:min-h-0 print:bg-white print:px-0 print:py-0 print:text-slate-900">
      <div className="mx-auto max-w-4xl space-y-5 print:max-w-none">
        <div className="rounded-3xl border border-surface-400 bg-surface-800/95 px-5 py-5 shadow-[0_18px_40px_rgba(2,6,23,0.28)] print:rounded-none print:border-slate-300 print:bg-white print:px-0 print:py-0 print:shadow-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-brand-300">Share View</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-100">HR Board Snapshot</h1>
              <p className="mt-2 text-sm text-slate-400">
                Screenshot-friendly version of the live best board with only the essentials.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/hr-board/share?view=10"
                className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  rowLimit === 10
                    ? 'border-brand-500/30 bg-brand-500/15 text-brand-300'
                    : 'border-surface-300 bg-surface-700 text-slate-300 hover:bg-surface-600'
                }`}
              >
                Top 10
              </Link>
              <Link
                href="/hr-board/share?view=20"
                className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  rowLimit === 20
                    ? 'border-brand-500/30 bg-brand-500/15 text-brand-300'
                    : 'border-surface-300 bg-surface-700 text-slate-300 hover:bg-surface-600'
                }`}
              >
                Top 20
              </Link>
              <Link
                href="/home-run-dashboard"
                className="rounded-full border border-surface-300 bg-surface-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-surface-600"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          <div className="mt-5 border-t border-surface-400/80 pt-5 print:mt-0 print:border-t-0 print:pt-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-surface-400/80 pb-4 print:border-slate-300">
              <div>
                <h2 className="text-xl font-semibold text-slate-100 print:text-slate-900">
                  Top {rowLimit} Home Run Targets
                </h2>
              </div>

              <div className="text-right">
                <p className="text-sm font-medium text-slate-200 print:text-slate-900">{boardDateLabel}</p>
                <p className="text-xs text-slate-500 print:text-slate-500">
                  Generated {new Date(board.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            <div className={`mt-4 grid gap-3 ${rowLimit === 20 ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-3">
                {leftColumnRows.map((row) => (
                  <ShareRow key={`${row.gameId}-${row.batterId}-share-left`} row={row} />
                ))}
              </div>
              {rowLimit === 20 && (
                <div className="space-y-3">
                  {rightColumnRows.map((row) => (
                    <ShareRow key={`${row.gameId}-${row.batterId}-share-right`} row={row} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
