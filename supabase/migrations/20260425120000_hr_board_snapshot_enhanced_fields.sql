ALTER TABLE public.hr_board_snapshots
  ADD COLUMN IF NOT EXISTS diagnostics JSONB;

ALTER TABLE public.hr_board_snapshot_rows
  ADD COLUMN IF NOT EXISTS hr_tier TEXT,
  ADD COLUMN IF NOT EXISTS raw_model_probability NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS calibrated_hr_probability NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS model_edge NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS value_score NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS value_tier TEXT;
