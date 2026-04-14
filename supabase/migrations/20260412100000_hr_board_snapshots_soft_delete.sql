ALTER TABLE public.hr_board_snapshots
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_hr_board_snapshots_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_board_snapshots_active_unique
  ON public.hr_board_snapshots(snapshot_date, board_type, lineup_mode, snapshot_kind)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_hr_board_snapshots_active_date
  ON public.hr_board_snapshots(snapshot_date DESC, captured_at DESC)
  WHERE is_deleted = false;
