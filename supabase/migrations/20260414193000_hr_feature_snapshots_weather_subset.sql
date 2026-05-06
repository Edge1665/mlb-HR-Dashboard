ALTER TABLE public.hr_feature_snapshots
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS humidity NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS wind_speed NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS wind_out_to_center NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS wind_in_from_center NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS crosswind NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS air_density_proxy NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS density_altitude NUMERIC(8,4);
