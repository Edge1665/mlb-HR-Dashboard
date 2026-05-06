import type { MLBResearchScores } from "@/features/mlbResearch/types";

export const MLB_RESEARCH_SCORE_WEIGHTS: Record<
  keyof MLBResearchScores,
  number
> = {
  hrResearchScore: 1,
  contactQualityScore: 0.24,
  matchupScore: 0.23,
  environmentScore: 0.17,
  pitchTypeFitScore: 0.14,
  trendStrengthScore: 0.22,
};

export const RESEARCH_FLAG_THRESHOLDS = {
  hotRecentHrForm: 2,
  strongSplitIso: 0.2,
  favorableEnvironment: 62,
  hrPronePitcherHr9: 1.35,
  strongPitchTypeFit: 60,
  likelyValueEdgePct: 0.025,
};

export const RESEARCH_ENVIRONMENT_LABELS = {
  favorable: "favorable",
  neutral: "neutral",
  poor: "poor",
} as const;

// TODO: Expand these keys into a shared cross-prop registry once hits, total bases,
// RBI, runs, strikeouts, and pitcher outs all consume the same research object.
export const MODEL_READY_RESEARCH_FEATURE_KEYS = [
  "researchHrScore",
  "researchContactQualityScore",
  "researchMatchupScore",
  "researchEnvironmentScore",
  "researchPitchTypeFitScore",
  "researchTrendStrengthScore",
  "recentFormLast7Iso",
  "recentFormLast14Iso",
  "splitIsoVsHand",
  "pitcherHr9",
  "environmentHrScore",
  "pitchTypeFitScore",
] as const;
