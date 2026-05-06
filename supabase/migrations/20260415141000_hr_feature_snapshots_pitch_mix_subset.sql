ALTER TABLE public.hr_feature_snapshots
  ADD COLUMN IF NOT EXISTS pitch_mix_matchup_score NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS pitcher_vulnerability_vs_hand NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS batter_vs_pitch_mix_power NUMERIC(8,4);
