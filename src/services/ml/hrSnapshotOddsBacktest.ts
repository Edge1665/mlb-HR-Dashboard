import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { DailyBoardLineupMode, DailyBoardSortMode } from '@/services/hrDailyBoardService';

export interface SnapshotOddsBacktestRow {
  snapshotId: string;
  snapshotDate: string;
  boardType: DailyBoardSortMode;
  lineupMode: DailyBoardLineupMode;
  rank: number;
  batterId: string;
  batterName: string;
  predictedProbability: number;
  sportsbookOddsAmerican: number;
  impliedProbability: number;
  edge: number | null;
  sportsbook: string | null;
  actualHitHr: boolean;
  actualHrCount: number;
}

export interface SnapshotOddsStrategyResult {
  strategy: string;
  description: string;
  totalRows: number;
  totalBets: number;
  totalHits: number;
  hitRate: number;
  profitUnits: number;
  roi: number;
  averageOdds: number | null;
}

export interface SnapshotOddsSportsbookResult {
  sportsbook: string;
  totalBets: number;
  totalHits: number;
  hitRate: number;
  profitUnits: number;
  roi: number;
  averageOdds: number | null;
}

export interface SnapshotOddsBacktestSummary {
  totalRowsWithUsableOdds: number;
  overall: SnapshotOddsStrategyResult;
  strategyResults: SnapshotOddsStrategyResult[];
  sportsbookResults: SnapshotOddsSportsbookResult[];
  snapshotCoverage: {
    snapshotCount: number;
    uniqueDates: number;
    boardTypes: DailyBoardSortMode[];
    sportsbooks: string[];
  };
}

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function payoutUnitsFromAmericanOdds(americanOdds: number): number {
  if (americanOdds > 0) {
    return americanOdds / 100;
  }

  return 100 / Math.abs(americanOdds);
}

function summarizeSelection(
  strategy: string,
  description: string,
  rows: SnapshotOddsBacktestRow[]
): SnapshotOddsStrategyResult {
  const totalBets = rows.length;
  const totalHits = rows.reduce((sum, row) => sum + (row.actualHitHr ? 1 : 0), 0);
  const profitUnits = rows.reduce((sum, row) => {
    if (row.actualHitHr) {
      return sum + payoutUnitsFromAmericanOdds(row.sportsbookOddsAmerican);
    }

    return sum - 1;
  }, 0);

  return {
    strategy,
    description,
    totalRows: rows.length,
    totalBets,
    totalHits,
    hitRate: totalBets === 0 ? 0 : totalHits / totalBets,
    profitUnits,
    roi: totalBets === 0 ? 0 : profitUnits / totalBets,
    averageOdds:
      totalBets === 0
        ? null
        : rows.reduce((sum, row) => sum + row.sportsbookOddsAmerican, 0) / totalBets,
  };
}

function buildStrategyResults(rows: SnapshotOddsBacktestRow[]): SnapshotOddsStrategyResult[] {
  const byBoardType = new Map<DailyBoardSortMode, SnapshotOddsBacktestRow[]>();

  for (const row of rows) {
    const bucket = byBoardType.get(row.boardType) ?? [];
    bucket.push(row);
    byBoardType.set(row.boardType, bucket);
  }

  return [
    summarizeSelection('all_usable_rows', 'All saved snapshot rows with usable odds', rows),
    summarizeSelection(
      'positive_edge',
      'Saved snapshot rows with edge > 0',
      rows.filter((row) => (row.edge ?? Number.NEGATIVE_INFINITY) > 0)
    ),
    summarizeSelection(
      'edge_gt_0_05',
      'Saved snapshot rows with edge > 0.05',
      rows.filter((row) => (row.edge ?? Number.NEGATIVE_INFINITY) > 0.05)
    ),
    summarizeSelection(
      'edge_gt_0_10',
      'Saved snapshot rows with edge > 0.10',
      rows.filter((row) => (row.edge ?? Number.NEGATIVE_INFINITY) > 0.1)
    ),
    summarizeSelection(
      'model_board',
      'Rows from saved model boards',
      byBoardType.get('model') ?? []
    ),
    summarizeSelection(
      'best_board',
      'Rows from saved best boards',
      byBoardType.get('best') ?? []
    ),
    summarizeSelection(
      'edge_board',
      'Rows from saved edge boards',
      byBoardType.get('edge') ?? []
    ),
  ];
}

function buildSportsbookResults(rows: SnapshotOddsBacktestRow[]): SnapshotOddsSportsbookResult[] {
  const bySportsbook = new Map<string, SnapshotOddsBacktestRow[]>();

  for (const row of rows) {
    const sportsbook = row.sportsbook?.trim() || 'Unknown';
    const bucket = bySportsbook.get(sportsbook) ?? [];
    bucket.push(row);
    bySportsbook.set(sportsbook, bucket);
  }

  return Array.from(bySportsbook.entries())
    .map(([sportsbook, bucket]) => ({
      sportsbook,
      ...summarizeSelection(`sportsbook_${sportsbook}`, `Rows from ${sportsbook}`, bucket),
    }))
    .map((entry) => ({
      sportsbook: entry.sportsbook,
      totalBets: entry.totalBets,
      totalHits: entry.totalHits,
      hitRate: entry.hitRate,
      profitUnits: entry.profitUnits,
      roi: entry.roi,
      averageOdds: entry.averageOdds,
    }))
    .sort((left, right) => right.totalBets - left.totalBets || left.sportsbook.localeCompare(right.sportsbook));
}

export async function fetchSavedSnapshotOddsRows(): Promise<SnapshotOddsBacktestRow[]> {
  const supabase = getSupabase();
  const snapshotsQuery = await supabase
    .from('hr_board_snapshots')
    .select('id, snapshot_date, board_type, lineup_mode')
    .eq('snapshot_kind', 'official');

  if (snapshotsQuery.error) {
    throw new Error(snapshotsQuery.error.message);
  }

  const snapshots = (snapshotsQuery.data ?? []) as Array<Record<string, unknown>>;
  if (snapshots.length === 0) {
    return [];
  }

  const snapshotMetaById = new Map(
    snapshots.map((row) => [
      String(row.id),
      {
        snapshotDate: String(row.snapshot_date),
        boardType: row.board_type as DailyBoardSortMode,
        lineupMode: row.lineup_mode as DailyBoardLineupMode,
      },
    ])
  );

  const rowsQuery = await supabase
    .from('hr_board_snapshot_rows')
    .select(
      'snapshot_id, rank, batter_id, batter_name, predicted_probability, sportsbook_odds_american, implied_probability, edge, sportsbook, actual_hit_hr, actual_hr_count'
    )
    .in('snapshot_id', snapshots.map((row) => String(row.id)))
    .not('sportsbook_odds_american', 'is', null)
    .not('predicted_probability', 'is', null)
    .not('actual_hit_hr', 'is', null);

  if (rowsQuery.error) {
    throw new Error(rowsQuery.error.message);
  }

  return ((rowsQuery.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const snapshotId = String(row.snapshot_id);
      const meta = snapshotMetaById.get(snapshotId);
      if (!meta) {
        return null;
      }

      return {
        snapshotId,
        snapshotDate: meta.snapshotDate,
        boardType: meta.boardType,
        lineupMode: meta.lineupMode,
        rank: Number(row.rank),
        batterId: String(row.batter_id),
        batterName: String(row.batter_name),
        predictedProbability: Number(row.predicted_probability),
        sportsbookOddsAmerican: Number(row.sportsbook_odds_american),
        impliedProbability: Number(row.implied_probability),
        edge: row.edge != null ? Number(row.edge) : null,
        sportsbook: row.sportsbook ? String(row.sportsbook) : null,
        actualHitHr: Boolean(row.actual_hit_hr),
        actualHrCount: Number(row.actual_hr_count ?? 0),
      } satisfies SnapshotOddsBacktestRow;
    })
    .filter((row): row is SnapshotOddsBacktestRow => row != null);
}

export async function runSavedSnapshotOddsBacktest(): Promise<SnapshotOddsBacktestSummary> {
  const rows = await fetchSavedSnapshotOddsRows();
  const strategyResults = buildStrategyResults(rows);
  const overall =
    strategyResults.find((strategy) => strategy.strategy === 'all_usable_rows') ??
    summarizeSelection('all_usable_rows', 'All saved snapshot rows with usable odds', rows);
  const snapshotIds = new Set(rows.map((row) => row.snapshotId));
  const dates = new Set(rows.map((row) => row.snapshotDate));
  const boardTypes = Array.from(new Set(rows.map((row) => row.boardType))).sort();
  const sportsbooks = Array.from(new Set(rows.map((row) => row.sportsbook?.trim() || 'Unknown'))).sort();

  return {
    totalRowsWithUsableOdds: rows.length,
    overall,
    strategyResults,
    sportsbookResults: buildSportsbookResults(rows),
    snapshotCoverage: {
      snapshotCount: snapshotIds.size,
      uniqueDates: dates.size,
      boardTypes,
      sportsbooks,
    },
  };
}
