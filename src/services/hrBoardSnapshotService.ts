import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  buildDailyHRBoard,
  type DailyBoardLineupMode,
  type DailyBoardSortMode,
} from '@/services/hrDailyBoardService';
import { fetchBatterOutcomesForDate } from '@/services/mlbHistoricalOutcomesService';

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function isMissingSoftDeleteColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return message.includes('is_deleted') || message.includes('deleted_at');
}

function getTodayETDateString(): string {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  isDeleted: boolean;
  deletedAt: string | null;
}

export type ValidationSnapshotType =
  | 'morning_full_day'
  | 'pre_first_pitch'
  | 'official';

export type OfficialSnapshotKind =
  | 'official'
  | 'official_early_full_day'
  | 'official_lock_time'
  | 'morning_full_day'
  | 'pre_first_pitch';

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

export interface SavedBoardSnapshotHitPlayer {
  batterId: string;
  batterName: string;
  rank: number;
  hrCount: number;
}

export interface ValidationBoardSnapshot extends SavedBoardSnapshotSummary {
  snapshotType: ValidationSnapshotType;
  top15Hits: number | null;
  top25Hits: number | null;
  totalHits: number | null;
  hitPlayers: SavedBoardSnapshotHitPlayer[];
  rows: SavedBoardSnapshotRow[];
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
    rowLimit: Number(row.row_limit ?? 25),
    top5Hits: row.top5_hits != null ? Number(row.top5_hits) : null,
    top10Hits: row.top10_hits != null ? Number(row.top10_hits) : null,
    scoredAt: row.scored_at ? String(row.scored_at) : null,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
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

function normalizeSnapshotType(snapshotKind: string): ValidationSnapshotType {
  if (
    snapshotKind === 'morning_full_day' ||
    snapshotKind === 'official_early_full_day'
  ) {
    return 'morning_full_day';
  }

  if (
    snapshotKind === 'pre_first_pitch' ||
    snapshotKind === 'official_lock_time'
  ) {
    return 'pre_first_pitch';
  }

  return 'official';
}

function computeHitCount(
  rows: SavedBoardSnapshotRow[],
  maxRank: number
): number | null {
  if (rows.length === 0) return null;

  return rows.reduce((count, row) => {
    if (row.rank <= maxRank && row.actualHitHr === true) {
      return count + 1;
    }
    return count;
  }, 0);
}

function mapValidationSnapshot(
  snapshotRow: Record<string, unknown>,
  rows: SavedBoardSnapshotRow[]
): ValidationBoardSnapshot {
  const summary = mapSnapshotSummary(snapshotRow);
  const scored = summary.scoredAt != null;
  const hitPlayers = rows
    .filter((row) => row.actualHitHr === true)
    .map((row) => ({
      batterId: row.batterId,
      batterName: row.batterName,
      rank: row.rank,
      hrCount: row.actualHrCount,
    }));

  return {
    ...summary,
    snapshotType: normalizeSnapshotType(summary.snapshotKind),
    top5Hits: scored ? computeHitCount(rows, 5) : summary.top5Hits,
    top10Hits: scored ? computeHitCount(rows, 10) : summary.top10Hits,
    top15Hits: scored ? computeHitCount(rows, 15) : null,
    top25Hits: scored ? computeHitCount(rows, 25) : null,
    totalHits: scored ? hitPlayers.length : null,
    hitPlayers,
    rows,
  };
}

export async function saveOfficialBoardSnapshot(options: {
  targetDate: string;
  sortMode: DailyBoardSortMode;
  lineupMode?: DailyBoardLineupMode;
  snapshotKind?: OfficialSnapshotKind;
  limit?: number;
  trainingStartDate?: string;
  sportsbooks?: string[];
}) {
  const supabase = getSupabase();
  const board = await buildDailyHRBoard({
    targetDate: options.targetDate,
    sortMode: options.sortMode,
    lineupMode: options.lineupMode,
    limit: options.limit ?? 25,
    trainingStartDate: options.trainingStartDate,
    sportsbooks: options.sportsbooks,
  });
  const snapshotKind = options.snapshotKind ?? 'official';

  let existingSnapshot = await supabase
    .from('hr_board_snapshots')
    .select('id')
    .eq('snapshot_date', board.targetDate)
    .eq('board_type', board.sortMode)
    .eq('lineup_mode', board.lineupMode)
    .eq('snapshot_kind', snapshotKind)
    .eq('is_deleted', false)
    .maybeSingle();

  if (isMissingSoftDeleteColumnError(existingSnapshot.error)) {
    existingSnapshot = await supabase
      .from('hr_board_snapshots')
      .select('id')
      .eq('snapshot_date', board.targetDate)
      .eq('board_type', board.sortMode)
      .eq('lineup_mode', board.lineupMode)
      .eq('snapshot_kind', snapshotKind)
      .maybeSingle();
  }

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
      snapshot_kind: snapshotKind,
      generated_at: board.generatedAt,
      captured_at: new Date().toISOString(),
      training_start_date: board.trainingStartDate,
      training_example_count: board.trainingExampleCount,
      model_trained_at: board.modelTrainedAt,
      row_limit: board.rows.length,
      is_deleted: false,
      deleted_at: null,
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
  const allowDirectHistoricalResolution = date < getTodayETDateString();
  let snapshotQuery = await supabase
    .from('hr_board_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .eq('is_deleted', false)
    .in('snapshot_kind', [
      'official',
      'official_early_full_day',
      'official_lock_time',
      'morning_full_day',
      'pre_first_pitch',
    ])
    .order('captured_at', { ascending: false });

  if (isMissingSoftDeleteColumnError(snapshotQuery.error)) {
    snapshotQuery = await supabase
      .from('hr_board_snapshots')
      .select('*')
      .eq('snapshot_date', date)
      .in('snapshot_kind', [
        'official',
        'official_early_full_day',
        'official_lock_time',
        'morning_full_day',
        'pre_first_pitch',
      ])
      .order('captured_at', { ascending: false });
  }

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
        snapshotKind: string;
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

  let historicalOutcomeByGameAndBatter = new Map<
    string,
    {
      hitHr: boolean;
      hrCount: number;
    }
  >();
  let sourceGameIds = new Set<string>();

  if (allowDirectHistoricalResolution) {
    try {
      const historicalOutcomes = await fetchBatterOutcomesForDate(date);
      sourceGameIds = new Set(
        historicalOutcomes.sourceGames.map((game) => String(game.gamePk))
      );
      historicalOutcomeByGameAndBatter = new Map(
        Object.values(historicalOutcomes.outcomes).map((outcome) => [
          `${String(outcome.gamePk)}::${outcome.batterId}`,
          {
            hitHr: outcome.hitHr,
            hrCount: outcome.hrCount,
          },
        ])
      );
    } catch (error) {
      console.warn(
        '[hrBoardSnapshotService] Failed to fetch direct historical outcomes; falling back to hr_feature_snapshots labels.',
        error
      );
    }
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
    snapshotKind: string;
    top5Hits: number;
    top10Hits: number;
  }> = [];

  for (const snapshot of snapshots) {
    const snapshotId = String(snapshot.id);
    const rows = rowsBySnapshot.get(snapshotId) ?? [];
    let top5Hits = 0;
    let top10Hits = 0;

    for (const row of rows) {
      const gameId = String(row.game_id);
      const batterId = String(row.batter_id);
      const directOutcome = historicalOutcomeByGameAndBatter.get(
        `${gameId}::${batterId}`
      );
      const label = labels.get(batterId);

      let actualHitHr: boolean | null = null;
      let actualHrCount = 0;

      if (directOutcome) {
        actualHitHr = directOutcome.hitHr;
        actualHrCount = directOutcome.hrCount;
      } else if (sourceGameIds.has(gameId)) {
        actualHitHr = false;
        actualHrCount = 0;
      } else if (label) {
        actualHitHr = label.hitHr;
        actualHrCount = label.hrCount;
      }

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
      snapshotKind: String(snapshot.snapshot_kind),
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

export async function fetchBoardSnapshotHistory(date?: string, options?: { includeDeleted?: boolean }) {
  const supabase = getSupabase();
  const buildQuery = (includeDeleted: boolean) => {
    let query = supabase
    .from('hr_board_snapshots')
    .select('*')
    .in('snapshot_kind', [
      'official',
      'official_early_full_day',
      'official_lock_time',
      'morning_full_day',
      'pre_first_pitch',
    ])
    .order('snapshot_date', { ascending: false })
    .order('captured_at', { ascending: false });

    if (!includeDeleted) {
      query = query.eq('is_deleted', false);
    }

    if (date) {
      query = query.eq('snapshot_date', date);
    }

    return query;
  };

  let snapshots = await buildQuery(Boolean(options?.includeDeleted));
  if (isMissingSoftDeleteColumnError(snapshots.error)) {
    snapshots = await buildQuery(true);
  }
  if (snapshots.error) {
    throw new Error(snapshots.error.message);
  }

  return (snapshots.data ?? []).map((row) =>
    mapSnapshotSummary(row as Record<string, unknown>)
  );
}

export async function fetchBoardSnapshotDetails(
  snapshotId: string,
  options?: { includeDeleted?: boolean }
) {
  const supabase = getSupabase();
  const buildSnapshotBuilder = (includeDeleted: boolean) => {
    let snapshotBuilder = supabase
    .from('hr_board_snapshots')
    .select('*')
    .eq('id', snapshotId);

    if (!includeDeleted) {
      snapshotBuilder = snapshotBuilder.eq('is_deleted', false);
    }

    return snapshotBuilder.single();
  };

  let snapshotQuery = await buildSnapshotBuilder(Boolean(options?.includeDeleted));
  if (isMissingSoftDeleteColumnError(snapshotQuery.error)) {
    snapshotQuery = await buildSnapshotBuilder(true);
  }

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

export async function fetchBoardSnapshotValidationData(
  date?: string,
  options?: { includeDeleted?: boolean }
) {
  const supabase = getSupabase();
  const buildSnapshotQuery = (includeDeleted: boolean) => {
    let snapshotQuery = supabase
    .from('hr_board_snapshots')
    .select('*')
    .in('snapshot_kind', [
      'official',
      'official_early_full_day',
      'official_lock_time',
      'morning_full_day',
      'pre_first_pitch',
    ])
    .order('snapshot_date', { ascending: false })
    .order('captured_at', { ascending: false });

    if (!includeDeleted) {
      snapshotQuery = snapshotQuery.eq('is_deleted', false);
    }

    if (date) {
      snapshotQuery = snapshotQuery.eq('snapshot_date', date);
    }

    return snapshotQuery;
  };

  let snapshotsResult = await buildSnapshotQuery(Boolean(options?.includeDeleted));
  if (isMissingSoftDeleteColumnError(snapshotsResult.error)) {
    snapshotsResult = await buildSnapshotQuery(true);
  }
  if (snapshotsResult.error) {
    throw new Error(snapshotsResult.error.message);
  }

  const snapshotRows = (snapshotsResult.data ?? []) as Record<string, unknown>[];
  if (snapshotRows.length === 0) {
    return [] as ValidationBoardSnapshot[];
  }

  const rowResult = await supabase
    .from('hr_board_snapshot_rows')
    .select('*')
    .in(
      'snapshot_id',
      snapshotRows.map((row) => String(row.id))
    )
    .order('rank', { ascending: true });

  if (rowResult.error) {
    throw new Error(rowResult.error.message);
  }

  const rowsBySnapshotId = new Map<string, SavedBoardSnapshotRow[]>();
  for (const row of (rowResult.data ?? []) as Record<string, unknown>[]) {
    const mapped = mapSnapshotRow(row);
    const snapshotId = String((row as Record<string, unknown>).snapshot_id);
    const bucket = rowsBySnapshotId.get(snapshotId) ?? [];
    bucket.push(mapped);
    rowsBySnapshotId.set(snapshotId, bucket);
  }

  return snapshotRows.map((snapshotRow) =>
    mapValidationSnapshot(
      snapshotRow,
      rowsBySnapshotId.get(String(snapshotRow.id)) ?? []
    )
  );
}

export async function softDeleteBoardSnapshot(snapshotId: string) {
  const supabase = getSupabase();
  const timestamp = new Date().toISOString();

  const snapshotQuery = await supabase
    .from('hr_board_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single();

  if (snapshotQuery.error || !snapshotQuery.data) {
    throw new Error(snapshotQuery.error?.message ?? 'Snapshot not found.');
  }

  if (isMissingSoftDeleteColumnError(snapshotQuery.error)) {
    throw new Error('Soft delete is not available until the snapshot migration is applied.');
  }

  if (Boolean(snapshotQuery.data.is_deleted)) {
    return {
      snapshot: mapSnapshotSummary(snapshotQuery.data as Record<string, unknown>),
      alreadyDeleted: true,
    };
  }

  const updateQuery = await supabase
    .from('hr_board_snapshots')
    .update({
      is_deleted: true,
      deleted_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', snapshotId)
    .select('*')
    .single();

  if (isMissingSoftDeleteColumnError(updateQuery.error)) {
    throw new Error(
      'Soft delete is not available yet because the snapshot migration has not been applied.'
    );
  }

  if (updateQuery.error || !updateQuery.data) {
    throw new Error(updateQuery.error?.message ?? 'Failed to delete snapshot.');
  }

  return {
    snapshot: mapSnapshotSummary(updateQuery.data as Record<string, unknown>),
    alreadyDeleted: false,
  };
}
