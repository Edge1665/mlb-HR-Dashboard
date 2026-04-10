import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  buildDailyHRBoard,
  type DailyBoardLineupMode,
  type DailyBoardSortMode,
} from '@/services/hrDailyBoardService';

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export interface SavedBoardSnapshotSummary {
  id: string;
  snapshotDate: string;
  boardType: DailyBoardSortMode;
  lineupMode: DailyBoardLineupMode;
  snapshotKind: string;
  capturedAt: string;
  generatedAt: string | null;
  trainingStartDate: string | null;
  trainingExampleCount: number | null;
  modelTrainedAt: string | null;
  rowLimit: number;
  top5Hits: number | null;
  top10Hits: number | null;
  scoredAt: string | null;
}

export interface SavedBoardSnapshotRow {
  rank: number;
  batterId: string;
  batterName: string;
  teamId: string;
  opponentTeamId: string;
  gameId: string;
  predictedProbability: number;
  tier: string;
  sportsbookOddsAmerican: number | null;
  impliedProbability: number | null;
  edge: number | null;
  combinedScore: number | null;
  sportsbook: string | null;
  lineupConfirmed: boolean;
  actualHitHr: boolean | null;
  actualHrCount: number;
}

function mapSnapshotSummary(row: Record<string, unknown>): SavedBoardSnapshotSummary {
  return {
    id: String(row.id),
    snapshotDate: String(row.snapshot_date),
    boardType: row.board_type as DailyBoardSortMode,
    lineupMode: row.lineup_mode as DailyBoardLineupMode,
    snapshotKind: String(row.snapshot_kind),
    capturedAt: String(row.captured_at),
    generatedAt: row.generated_at ? String(row.generated_at) : null,
    trainingStartDate: row.training_start_date ? String(row.training_start_date) : null,
    trainingExampleCount:
      row.training_example_count != null ? Number(row.training_example_count) : null,
    modelTrainedAt: row.model_trained_at ? String(row.model_trained_at) : null,
    rowLimit: Number(row.row_limit ?? 10),
    top5Hits: row.top5_hits != null ? Number(row.top5_hits) : null,
    top10Hits: row.top10_hits != null ? Number(row.top10_hits) : null,
    scoredAt: row.scored_at ? String(row.scored_at) : null,
  };
}

function mapSnapshotRow(row: Record<string, unknown>): SavedBoardSnapshotRow {
  return {
    rank: Number(row.rank),
    batterId: String(row.batter_id),
    batterName: String(row.batter_name),
    teamId: String(row.team_id),
    opponentTeamId: String(row.opponent_team_id),
    gameId: String(row.game_id),
    predictedProbability: Number(row.predicted_probability),
    tier: String(row.tier),
    sportsbookOddsAmerican:
      row.sportsbook_odds_american != null ? Number(row.sportsbook_odds_american) : null,
    impliedProbability:
      row.implied_probability != null ? Number(row.implied_probability) : null,
    edge: row.edge != null ? Number(row.edge) : null,
    combinedScore: row.combined_score != null ? Number(row.combined_score) : null,
    sportsbook: row.sportsbook ? String(row.sportsbook) : null,
    lineupConfirmed: Boolean(row.lineup_confirmed),
    actualHitHr:
      row.actual_hit_hr === null || row.actual_hit_hr === undefined
        ? null
        : Boolean(row.actual_hit_hr),
    actualHrCount: Number(row.actual_hr_count ?? 0),
  };
}

export async function saveOfficialBoardSnapshot(options: {
  targetDate: string;
  sortMode: DailyBoardSortMode;
  lineupMode?: DailyBoardLineupMode;
  limit?: number;
  trainingStartDate?: string;
  sportsbooks?: string[];
}) {
  const supabase = getSupabase();
  const board = await buildDailyHRBoard({
    targetDate: options.targetDate,
    sortMode: options.sortMode,
    lineupMode: options.lineupMode,
    limit: options.limit ?? 10,
    trainingStartDate: options.trainingStartDate,
    sportsbooks: options.sportsbooks,
  });

  const existingSnapshot = await supabase
    .from('hr_board_snapshots')
    .select('id')
    .eq('snapshot_date', board.targetDate)
    .eq('board_type', board.sortMode)
    .eq('lineup_mode', board.lineupMode)
    .eq('snapshot_kind', 'official')
    .maybeSingle();

  if (existingSnapshot.error) {
    throw new Error(existingSnapshot.error.message);
  }

  if (existingSnapshot.data?.id) {
    const { error: deleteRowsError } = await supabase
      .from('hr_board_snapshot_rows')
      .delete()
      .eq('snapshot_id', existingSnapshot.data.id);
    if (deleteRowsError) throw new Error(deleteRowsError.message);

    const { error: deleteSnapshotError } = await supabase
      .from('hr_board_snapshots')
      .delete()
      .eq('id', existingSnapshot.data.id);
    if (deleteSnapshotError) throw new Error(deleteSnapshotError.message);
  }

  const snapshotInsert = await supabase
    .from('hr_board_snapshots')
    .insert({
      snapshot_date: board.targetDate,
      board_type: board.sortMode,
      lineup_mode: board.lineupMode,
      snapshot_kind: 'official',
      generated_at: board.generatedAt,
      captured_at: new Date().toISOString(),
      training_start_date: board.trainingStartDate,
      training_example_count: board.trainingExampleCount,
      model_trained_at: board.modelTrainedAt,
      row_limit: board.rows.length,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (snapshotInsert.error || !snapshotInsert.data) {
    throw new Error(snapshotInsert.error?.message ?? 'Failed to save board snapshot.');
  }

  const snapshotId = String(snapshotInsert.data.id);
  const rowInserts = board.rows.map((row) => ({
    snapshot_id: snapshotId,
    rank: row.rank,
    batter_id: row.batterId,
    batter_name: row.batterName,
    team_id: row.teamId,
    opponent_team_id: row.opponentTeamId,
    game_id: row.gameId,
    predicted_probability: row.predictedProbability,
    tier: row.tier,
    sportsbook_odds_american: row.sportsbookOddsAmerican,
    implied_probability: row.impliedProbability,
    edge: row.edge,
    combined_score: row.combinedScore,
    sportsbook: row.sportsbook,
    lineup_confirmed: row.lineupConfirmed,
    actual_hit_hr: null,
    actual_hr_count: 0,
    updated_at: new Date().toISOString(),
  }));

  const insertedRows = await supabase
    .from('hr_board_snapshot_rows')
    .insert(rowInserts)
    .select('*')
    .order('rank', { ascending: true });

  if (insertedRows.error) {
    throw new Error(insertedRows.error.message);
  }

  return {
    snapshot: mapSnapshotSummary(snapshotInsert.data as Record<string, unknown>),
    rows: (insertedRows.data ?? []).map((row) =>
      mapSnapshotRow(row as Record<string, unknown>)
    ),
  };
}

export async function scoreBoardSnapshotsForDate(date: string) {
  const supabase = getSupabase();
  const snapshotQuery = await supabase
    .from('hr_board_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .eq('snapshot_kind', 'official')
    .order('captured_at', { ascending: false });

  if (snapshotQuery.error) {
    throw new Error(snapshotQuery.error.message);
  }

  const snapshots = (snapshotQuery.data ?? []) as Record<string, unknown>[];
  if (snapshots.length === 0) {
    return {
      date,
      snapshotCount: 0,
      scoredSnapshots: [] as Array<{
        snapshotId: string;
        boardType: DailyBoardSortMode;
        lineupMode: DailyBoardLineupMode;
        top5Hits: number;
        top10Hits: number;
      }>,
    };
  }

  const rowQuery = await supabase
    .from('hr_board_snapshot_rows')
    .select('*')
    .in(
      'snapshot_id',
      snapshots.map((snapshot) => String(snapshot.id))
    )
    .order('rank', { ascending: true });

  if (rowQuery.error) {
    throw new Error(rowQuery.error.message);
  }

  const labelQuery = await supabase
    .from('hr_feature_snapshots')
    .select('batter_id, hit_hr, hr_count')
    .eq('snapshot_date', date)
    .not('hit_hr', 'is', null);

  if (labelQuery.error) {
    throw new Error(labelQuery.error.message);
  }

  const labels = new Map(
    ((labelQuery.data ?? []) as Record<string, unknown>[]).map((row) => [
      String(row.batter_id),
      {
        hitHr: Boolean(row.hit_hr),
        hrCount: Number(row.hr_count ?? 0),
      },
    ])
  );

  const rowsBySnapshot = new Map<string, Record<string, unknown>[]>();
  for (const row of (rowQuery.data ?? []) as Record<string, unknown>[]) {
    const snapshotId = String(row.snapshot_id);
    const bucket = rowsBySnapshot.get(snapshotId) ?? [];
    bucket.push(row);
    rowsBySnapshot.set(snapshotId, bucket);
  }

  const scoredSnapshots: Array<{
    snapshotId: string;
    boardType: DailyBoardSortMode;
    lineupMode: DailyBoardLineupMode;
    top5Hits: number;
    top10Hits: number;
  }> = [];

  for (const snapshot of snapshots) {
    const snapshotId = String(snapshot.id);
    const rows = rowsBySnapshot.get(snapshotId) ?? [];
    let top5Hits = 0;
    let top10Hits = 0;

    for (const row of rows) {
      const label = labels.get(String(row.batter_id));
      const actualHitHr = label ? label.hitHr : null;
      const actualHrCount = label ? label.hrCount : 0;

      const { error: updateRowError } = await supabase
        .from('hr_board_snapshot_rows')
        .update({
          actual_hit_hr: actualHitHr,
          actual_hr_count: actualHrCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updateRowError) {
        throw new Error(updateRowError.message);
      }

      if (actualHitHr) {
        top10Hits += 1;
        if (Number(row.rank) <= 5) {
          top5Hits += 1;
        }
      }
    }

    const { error: updateSnapshotError } = await supabase
      .from('hr_board_snapshots')
      .update({
        top5_hits: top5Hits,
        top10_hits: top10Hits,
        scored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', snapshotId);

    if (updateSnapshotError) {
      throw new Error(updateSnapshotError.message);
    }

    scoredSnapshots.push({
      snapshotId,
      boardType: snapshot.board_type as DailyBoardSortMode,
      lineupMode: snapshot.lineup_mode as DailyBoardLineupMode,
      top5Hits,
      top10Hits,
    });
  }

  return {
    date,
    snapshotCount: snapshots.length,
    scoredSnapshots,
  };
}

export async function fetchBoardSnapshotHistory(date?: string) {
  const supabase = getSupabase();
  let query = supabase
    .from('hr_board_snapshots')
    .select('*')
    .eq('snapshot_kind', 'official')
    .order('snapshot_date', { ascending: false })
    .order('captured_at', { ascending: false });

  if (date) {
    query = query.eq('snapshot_date', date);
  }

  const snapshots = await query;
  if (snapshots.error) {
    throw new Error(snapshots.error.message);
  }

  return (snapshots.data ?? []).map((row) =>
    mapSnapshotSummary(row as Record<string, unknown>)
  );
}

export async function fetchBoardSnapshotDetails(snapshotId: string) {
  const supabase = getSupabase();
  const snapshotQuery = await supabase
    .from('hr_board_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single();

  if (snapshotQuery.error || !snapshotQuery.data) {
    throw new Error(snapshotQuery.error?.message ?? 'Snapshot not found.');
  }

  const rowQuery = await supabase
    .from('hr_board_snapshot_rows')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .order('rank', { ascending: true });

  if (rowQuery.error) {
    throw new Error(rowQuery.error.message);
  }

  return {
    snapshot: mapSnapshotSummary(snapshotQuery.data as Record<string, unknown>),
    rows: (rowQuery.data ?? []).map((row) =>
      mapSnapshotRow(row as Record<string, unknown>)
    ),
  };
}
