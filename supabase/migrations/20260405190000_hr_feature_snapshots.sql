CREATE TABLE IF NOT EXISTS public.hr_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  batter_id TEXT NOT NULL,
  batter_name TEXT NOT NULL,

  season_hr_per_game NUMERIC(8,4) NOT NULL,
  barrel_rate NUMERIC(8,4) NOT NULL,
  exit_velocity_avg NUMERIC(8,4) NOT NULL,
  iso NUMERIC(8,4) NOT NULL,
  hard_hit_rate NUMERIC(8,4) NOT NULL,
  fly_ball_rate NUMERIC(8,4) NOT NULL,
  x_slugging NUMERIC(8,4) NOT NULL,
  pitcher_hr9 NUMERIC(8,4) NOT NULL,
  pitcher_fb_pct NUMERIC(8,4) NOT NULL,
  park_hr_factor NUMERIC(8,4) NOT NULL,
  weather_hr_impact_score NUMERIC(8,4) NOT NULL,
  projected_at_bats NUMERIC(8,4) NOT NULL,
  platoon_edge SMALLINT NOT NULL,
  team_hr_per_game NUMERIC(8,4) NOT NULL,
  last7_hr SMALLINT NOT NULL,
  last14_hr SMALLINT NOT NULL,
  last30_hr SMALLINT NOT NULL,

  hit_hr BOOLEAN,
  hr_count SMALLINT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_feature_snapshots_date
  ON public.hr_feature_snapshots(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_hr_feature_snapshots_batter
  ON public.hr_feature_snapshots(batter_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_feature_snapshots_date_batter
  ON public.hr_feature_snapshots(snapshot_date, batter_id);

ALTER TABLE public.hr_feature_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_hr_feature_snapshots" ON public.hr_feature_snapshots;
CREATE POLICY "public_read_hr_feature_snapshots"
ON public.hr_feature_snapshots
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "public_insert_hr_feature_snapshots" ON public.hr_feature_snapshots;
CREATE POLICY "public_insert_hr_feature_snapshots"
ON public.hr_feature_snapshots
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_hr_feature_snapshots" ON public.hr_feature_snapshots;
CREATE POLICY "public_update_hr_feature_snapshots"
ON public.hr_feature_snapshots
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_hr_feature_snapshots" ON public.hr_feature_snapshots;
CREATE POLICY "public_delete_hr_feature_snapshots"
ON public.hr_feature_snapshots
FOR DELETE
TO public
USING (true);
