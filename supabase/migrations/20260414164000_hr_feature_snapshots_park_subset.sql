ALTER TABLE public.hr_feature_snapshots
  ADD COLUMN IF NOT EXISTS park_hr_factor_vs_hand NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS average_fence_distance NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS fence_distance_index NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS estimated_hr_parks_for_typical_400ft_fly NUMERIC(8,4);
