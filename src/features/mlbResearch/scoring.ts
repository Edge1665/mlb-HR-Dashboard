import { MLB_RESEARCH_SCORE_WEIGHTS } from "@/features/mlbResearch/constants";
import type {
  MLBResearchScores,
  ResearchEnvironmentProfile,
  ResearchMatchupProfile,
  ResearchPitchMixProfile,
  ResearchRecentFormWindow,
  ResearchSplits,
  ResearchStatcastProfile,
  ResearchTrendFlag,
} from "@/features/mlbResearch/types";

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeStat(
  value: number | null | undefined,
  min: number,
  max: number,
): number {
  if (value == null || !Number.isFinite(value)) {
    return 50;
  }

  if (max <= min) {
    return 50;
  }

  return clamp(((value - min) / (max - min)) * 100);
}

export function computeContactQualityScore(
  statcast: ResearchStatcastProfile,
): number {
  const barrelScore = normalizeStat(statcast.barrelRate, 4, 18);
  const hardHitScore = normalizeStat(statcast.hardHitRate, 28, 55);
  const evScore = normalizeStat(statcast.averageExitVelocity, 86, 95);
  const xSlgScore = normalizeStat(statcast.xSlugging, 0.34, 0.68);
  return Math.round(
    barrelScore * 0.34 + hardHitScore * 0.26 + evScore * 0.2 + xSlgScore * 0.2,
  );
}

export function computeMatchupScore(
  matchup: ResearchMatchupProfile,
  splits: ResearchSplits,
): number {
  const pitcherHrScore = normalizeStat(matchup.pitcherHr9, 0.7, 2);
  const pitcherRecentScore = normalizeStat(
    matchup.pitcherRecentHr9Allowed,
    0.5,
    2.5,
  );
  const splitIsoScore = normalizeStat(
    matchup.pitcherHand === "L" ? splits.vsLhp?.iso : splits.vsRhp?.iso,
    0.08,
    0.32,
  );
  const recentVsOpponentScore = normalizeStat(
    matchup.recentVsOpponent?.iso,
    0.06,
    0.28,
  );

  return Math.round(
    pitcherHrScore * 0.42 +
      pitcherRecentScore * 0.24 +
      splitIsoScore * 0.24 +
      recentVsOpponentScore * 0.1,
  );
}

export function computeEnvironmentScore(
  environment: ResearchEnvironmentProfile,
): number {
  return Math.round(normalizeStat(environment.hrEnvironmentScore, 30, 75));
}

export function computePitchTypeFitScore(
  pitchMix: ResearchPitchMixProfile,
): number {
  return Math.round(normalizeStat(pitchMix.fitScore, 35, 65));
}

export function computeTrendStrengthScore(
  flags: ResearchTrendFlag[],
  recentForm: ResearchRecentFormWindow[],
): number {
  const positiveFlags = flags.filter((flag) => flag.tone === "positive").length;
  const cautionFlags = flags.filter((flag) => flag.tone === "caution").length;
  const last7HrScore = normalizeStat(
    recentForm.find((window) => window.label === "last7")?.homeRuns,
    0,
    4,
  );
  return Math.round(
    clamp(
      50 + positiveFlags * 9 - cautionFlags * 7 + (last7HrScore - 50) * 0.2,
    ),
  );
}

export function computeHrResearchScore(
  componentScores: Omit<MLBResearchScores, "hrResearchScore">,
): number {
  const totalWeight =
    MLB_RESEARCH_SCORE_WEIGHTS.contactQualityScore +
    MLB_RESEARCH_SCORE_WEIGHTS.matchupScore +
    MLB_RESEARCH_SCORE_WEIGHTS.environmentScore +
    MLB_RESEARCH_SCORE_WEIGHTS.pitchTypeFitScore +
    MLB_RESEARCH_SCORE_WEIGHTS.trendStrengthScore;

  const weightedTotal =
    componentScores.contactQualityScore *
      MLB_RESEARCH_SCORE_WEIGHTS.contactQualityScore +
    componentScores.matchupScore * MLB_RESEARCH_SCORE_WEIGHTS.matchupScore +
    componentScores.environmentScore *
      MLB_RESEARCH_SCORE_WEIGHTS.environmentScore +
    componentScores.pitchTypeFitScore *
      MLB_RESEARCH_SCORE_WEIGHTS.pitchTypeFitScore +
    componentScores.trendStrengthScore *
      MLB_RESEARCH_SCORE_WEIGHTS.trendStrengthScore;

  return Math.round(weightedTotal / totalWeight);
}
