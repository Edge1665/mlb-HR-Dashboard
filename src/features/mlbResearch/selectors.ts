import type {
  MLBPlayerResearchProfile,
  ResearchTrendFlag,
} from "@/features/mlbResearch/types";

export interface MLBResearchCheatsheetRow {
  rank: number;
  playerId: string;
  playerName: string;
  matchupLabel: string;
  gameTime: string | null;
  hrOdds: number | null;
  modelScore: number;
  researchScore: number;
  trendFlags: ResearchTrendFlag[];
}

export function selectTopResearchFlags(
  profile: MLBPlayerResearchProfile,
  limit = 4,
): ResearchTrendFlag[] {
  return profile.trendFlags.slice(0, limit);
}

export function selectResearchCheatsheetRow(
  profile: MLBPlayerResearchProfile,
  rank: number,
  modelScore: number,
): MLBResearchCheatsheetRow {
  return {
    rank,
    playerId: profile.playerId,
    playerName: profile.playerName,
    matchupLabel: profile.matchupLabel,
    gameTime: profile.gameTime,
    hrOdds: profile.odds.markets.home_runs?.currentAmericanOdds ?? null,
    modelScore,
    researchScore: profile.scores.hrResearchScore,
    trendFlags: selectTopResearchFlags(profile),
  };
}

export function selectResearchSummary(
  profile: MLBPlayerResearchProfile,
): string {
  return profile.researchSummary;
}
