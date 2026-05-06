ALTER TABLE public.hr_board_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_type TEXT NOT NULL DEFAULT 'filtered'
    CHECK (snapshot_type IN ('filtered', 'full')),
  ADD COLUMN IF NOT EXISTS filter_applied BOOLEAN NOT NULL DEFAULT true;

DROP INDEX IF EXISTS idx_hr_board_snapshots_active_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_board_snapshots_active_unique
  ON public.hr_board_snapshots(snapshot_date, board_type, lineup_mode, snapshot_kind, snapshot_type)
  WHERE is_deleted = false;
