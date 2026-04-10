CREATE TABLE IF NOT EXISTS public.hr_board_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  board_type TEXT NOT NULL CHECK (board_type IN ('model', 'best', 'edge')),
  lineup_mode TEXT NOT NULL CHECK (lineup_mode IN ('confirmed', 'all')),
  snapshot_kind TEXT NOT NULL DEFAULT 'official',
  generated_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  training_start_date DATE,
  training_example_count INTEGER,
  model_trained_at TIMESTAMPTZ,
  row_limit INTEGER NOT NULL DEFAULT 10,
  top5_hits INTEGER,
  top10_hits INTEGER,
  scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_board_snapshots_unique
  ON public.hr_board_snapshots(snapshot_date, board_type, lineup_mode, snapshot_kind);

CREATE INDEX IF NOT EXISTS idx_hr_board_snapshots_date
  ON public.hr_board_snapshots(snapshot_date DESC);

CREATE TABLE IF NOT EXISTS public.hr_board_snapshot_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.hr_board_snapshots(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  batter_id TEXT NOT NULL,
  batter_name TEXT NOT NULL,
  team_id TEXT NOT NULL,
  opponent_team_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  predicted_probability NUMERIC(8,4) NOT NULL,
  tier TEXT NOT NULL,
  sportsbook_odds_american INTEGER,
  implied_probability NUMERIC(8,4),
  edge NUMERIC(8,4),
  combined_score NUMERIC(8,4),
  sportsbook TEXT,
  lineup_confirmed BOOLEAN NOT NULL DEFAULT true,
  actual_hit_hr BOOLEAN,
  actual_hr_count SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_board_snapshot_rows_snapshot_rank
  ON public.hr_board_snapshot_rows(snapshot_id, rank);

CREATE INDEX IF NOT EXISTS idx_hr_board_snapshot_rows_snapshot
  ON public.hr_board_snapshot_rows(snapshot_id);

ALTER TABLE public.hr_board_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_board_snapshot_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_hr_board_snapshots" ON public.hr_board_snapshots;
CREATE POLICY "public_read_hr_board_snapshots"
ON public.hr_board_snapshots
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "public_insert_hr_board_snapshots" ON public.hr_board_snapshots;
CREATE POLICY "public_insert_hr_board_snapshots"
ON public.hr_board_snapshots
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_hr_board_snapshots" ON public.hr_board_snapshots;
CREATE POLICY "public_update_hr_board_snapshots"
ON public.hr_board_snapshots
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_hr_board_snapshots" ON public.hr_board_snapshots;
CREATE POLICY "public_delete_hr_board_snapshots"
ON public.hr_board_snapshots
FOR DELETE
TO public
USING (true);

DROP POLICY IF EXISTS "public_read_hr_board_snapshot_rows" ON public.hr_board_snapshot_rows;
CREATE POLICY "public_read_hr_board_snapshot_rows"
ON public.hr_board_snapshot_rows
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "public_insert_hr_board_snapshot_rows" ON public.hr_board_snapshot_rows;
CREATE POLICY "public_insert_hr_board_snapshot_rows"
ON public.hr_board_snapshot_rows
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_hr_board_snapshot_rows" ON public.hr_board_snapshot_rows;
CREATE POLICY "public_update_hr_board_snapshot_rows"
ON public.hr_board_snapshot_rows
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_hr_board_snapshot_rows" ON public.hr_board_snapshot_rows;
CREATE POLICY "public_delete_hr_board_snapshot_rows"
ON public.hr_board_snapshot_rows
FOR DELETE
TO public
USING (true);
