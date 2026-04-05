-- HR History Tracking: daily top 10 picks + actual outcomes

-- Table: daily_top10_picks
-- Stores each day's top 10 HR targets with predicted probabilities
CREATE TABLE IF NOT EXISTS public.daily_top10_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_date DATE NOT NULL,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10),
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_abbreviation TEXT NOT NULL,
  opposing_pitcher TEXT,
  hr_probability NUMERIC(5,2) NOT NULL,
  gemini_probability NUMERIC(5,2),
  blended_probability NUMERIC(5,2),
  confidence_tier TEXT NOT NULL,
  platoon_advantage TEXT NOT NULL,
  matchup_score INTEGER,
  key_factors TEXT[],
  lineup_confirmed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: hr_outcomes
-- Records whether each player in the daily top 10 actually hit a HR
CREATE TABLE IF NOT EXISTS public.hr_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_id UUID NOT NULL REFERENCES public.daily_top10_picks(id) ON DELETE CASCADE,
  pick_date DATE NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  hit_hr BOOLEAN,
  hr_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_top10_picks_date ON public.daily_top10_picks(pick_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_top10_picks_player ON public.daily_top10_picks(player_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_top10_picks_date_rank ON public.daily_top10_picks(pick_date, rank);
CREATE INDEX IF NOT EXISTS idx_hr_outcomes_pick_date ON public.hr_outcomes(pick_date DESC);
CREATE INDEX IF NOT EXISTS idx_hr_outcomes_pick_id ON public.hr_outcomes(pick_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_outcomes_pick_id_unique ON public.hr_outcomes(pick_id);

-- Enable RLS
ALTER TABLE public.daily_top10_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS Policies: public read, no auth required (analytics app)
DROP POLICY IF EXISTS "public_read_daily_top10_picks" ON public.daily_top10_picks;
CREATE POLICY "public_read_daily_top10_picks"
ON public.daily_top10_picks
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "public_insert_daily_top10_picks" ON public.daily_top10_picks;
CREATE POLICY "public_insert_daily_top10_picks"
ON public.daily_top10_picks
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public_delete_daily_top10_picks" ON public.daily_top10_picks;
CREATE POLICY "public_delete_daily_top10_picks"
ON public.daily_top10_picks
FOR DELETE
TO public
USING (true);

DROP POLICY IF EXISTS "public_read_hr_outcomes" ON public.hr_outcomes;
CREATE POLICY "public_read_hr_outcomes"
ON public.hr_outcomes
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "public_insert_hr_outcomes" ON public.hr_outcomes;
CREATE POLICY "public_insert_hr_outcomes"
ON public.hr_outcomes
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "public_update_hr_outcomes" ON public.hr_outcomes;
CREATE POLICY "public_update_hr_outcomes"
ON public.hr_outcomes
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);
