import { createClient as createSupabaseClient } from '@supabase/supabase-js';

type StabilityBoardType = 'model' | 'best' | 'edge';

type SnapshotRankRow = {
  batterId: string;
  rank: number;
};

export type PriorBoardReference = {
  snapshotId: string;
  capturedAt: string;
  lineupMode: 'confirmed' | 'all';
  rows: SnapshotRankRow[];
};

export type BoardStabilityFields = {
  morningRank: number | null;
  currentRank: number | null;
  rankChange: number | null;
  wasInMorningTop10: boolean;
  wasInMorningTop20: boolean;
};

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function toSnapshotRankRow(row: Record<string, unknown>): SnapshotRankRow {
  return {
    batterId: String(row.batter_id),
    rank: Number(row.rank),
  };
}

export async function fetchPriorBoardReference(params: {
  targetDate: string;
  boardType: StabilityBoardType;
}): Promise<PriorBoardReference | null> {
  if (params.boardType === 'edge') {
    return null;
  }

  const supabase = getSupabase();
  const snapshotQuery = await supabase
    .from('hr_board_snapshots')
    .select('id, captured_at, lineup_mode')
    .eq('snapshot_date', params.targetDate)
    .eq('board_type', params.boardType)
    .eq('is_deleted', false)
    .eq('snapshot_kind', 'official')
    .order('captured_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (snapshotQuery.error) {
    throw new Error(snapshotQuery.error.message);
  }

  if (!snapshotQuery.data?.id) {
    return null;
  }

  const rowQuery = await supabase
    .from('hr_board_snapshot_rows')
    .select('batter_id, rank')
    .eq('snapshot_id', snapshotQuery.data.id)
    .order('rank', { ascending: true });

  if (rowQuery.error) {
    throw new Error(rowQuery.error.message);
  }

  return {
    snapshotId: String(snapshotQuery.data.id),
    capturedAt: String(snapshotQuery.data.captured_at),
    lineupMode:
      snapshotQuery.data.lineup_mode === 'all' ? 'all' : 'confirmed',
    rows: ((rowQuery.data ?? []) as Record<string, unknown>[]).map(toSnapshotRankRow),
  };
}

export function buildPriorRankMap(
  rows: SnapshotRankRow[]
): Map<string, number> {
  return new Map(rows.map((row) => [row.batterId, row.rank]));
}

export function getBoardStabilityFields(
  batterId: string,
  priorRankMap: Map<string, number> | null
): BoardStabilityFields {
  const morningRank = priorRankMap?.get(batterId) ?? null;

  return {
    morningRank,
    currentRank: null,
    rankChange: null,
    wasInMorningTop10: morningRank != null && morningRank <= 10,
    wasInMorningTop20: morningRank != null && morningRank <= 20,
  };
}
