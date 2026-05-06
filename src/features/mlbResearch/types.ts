import type { PitchGroup } from "@/services/pitchMixTaxonomy";

export type PropMarketKey = "home_runs";

export type ResearchTrendFlagTone = "positive" | "neutral" | "caution";

export interface ResearchTrendFlag {
  key: string;
  label: string;
  tone: ResearchTrendFlagTone;
}

export interface ResearchOddsSnapshot {
  market: PropMarketKey;
  currentAmericanOdds: number | null;
  bestSportsbook: string | null;
  impliedProbability: number | null;
  openingAmericanOdds: number | null;
  lineMovementAmerican: number | null;
  noVigImpliedProbability: number | null;
}

export interface ResearchRecentFormWindow {
  label: "last7" | "last14" | "last30";
  gamesPlayed: number;
  plateAppearances: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  extraBaseHits: number;
  battingAverage: number | null;
  slugging: number | null;
  iso: number | null;
  hardHitProxy: number | null;
}

export interface ResearchSplitMetrics {
  sampleSize: number;
  homeRuns: number | null;
  battingAverage: number | null;
  slugging: number | null;
  iso: number | null;
  hrRate: number | null;
}

export interface ResearchSplits {
  vsRhp: ResearchSplitMetrics | null;
  vsLhp: ResearchSplitMetrics | null;
  home: ResearchSplitMetrics | null;
  away: ResearchSplitMetrics | null;
  last20: ResearchSplitMetrics | null;
}

export interface ResearchStatcastProfile {
  barrelRate: number | null;
  hardHitRate: number | null;
  flyBallRate: number | null;
  pullRate: number | null;
  averageExitVelocity: number | null;
  maxExitVelocity: number | null;
  xSlugging: number | null;
}

export interface ResearchMatchupProfile {
  opposingPitcherName: string | null;
  pitcherHand: "L" | "R" | null;
  pitcherHr9: number | null;
  pitcherFlyBallRate: number | null;
  pitcherHardContactAllowed: number | null;
  pitcherBarrelsAllowed: number | null;
  pitcherRecentHr9Allowed: number | null;
  batterVsPitcherHistory: {
    plateAppearances: number | null;
    homeRuns: number | null;
    battingAverage: number | null;
  } | null;
  recentVsOpponent: ResearchSplitMetrics | null;
}

export interface ResearchPitchMixDetail {
  pitchGroup: PitchGroup;
  usagePercent: number | null;
  hitterSkill: number | null;
}

export interface ResearchPitchMixProfile {
  pitcherUsage: Partial<Record<PitchGroup, number>>;
  hitterPerformance: Partial<Record<PitchGroup, number>>;
  fitDetails: ResearchPitchMixDetail[];
  fitScore: number | null;
}

export interface ResearchEnvironmentProfile {
  park: string | null;
  parkFactor: number | null;
  weather: {
    temperature: number | null;
    windSpeed: number | null;
    windDirection: string | null;
    windToward: "in" | "out" | "crosswind" | "neutral" | null;
    condition: string | null;
  };
  hrEnvironmentScore: number | null;
  hrEnvironmentLabel: "favorable" | "neutral" | "poor";
}

export interface MLBResearchScores {
  hrResearchScore: number;
  contactQualityScore: number;
  matchupScore: number;
  environmentScore: number;
  pitchTypeFitScore: number;
  trendStrengthScore: number;
}

export interface MLBPlayerResearchProfile {
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  awayTeam: string;
  homeTeam: string;
  matchupLabel: string;
  gameTime: string | null;
  battingOrder: number | null;
  handedness: {
    bats: "L" | "R" | "S" | null;
    throws: "L" | "R" | null;
  };
  homeAway: "home" | "away";
  opponentPitcherName: string | null;
  opponentPitcherHand: "L" | "R" | null;
  venueName: string | null;
  park: string | null;
  weather: ResearchEnvironmentProfile["weather"];
  odds: {
    markets: Partial<Record<PropMarketKey, ResearchOddsSnapshot>>;
  };
  recentForm: ResearchRecentFormWindow[];
  splits: ResearchSplits;
  statcast: ResearchStatcastProfile;
  matchup: ResearchMatchupProfile;
  pitchMix: ResearchPitchMixProfile;
  environment: ResearchEnvironmentProfile;
  trendFlags: ResearchTrendFlag[];
  researchSummary: string;
  scores: MLBResearchScores;
  modelReadyFeatures: Record<string, number | null>;
}
