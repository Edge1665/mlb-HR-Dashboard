import type { Game, Team } from "@/types";
import { getTeamAbbreviation } from "@/services/mlbTeamMetadata";

export interface StructuredGameContext {
  gamePk: string;
  awayTeamId: string;
  homeTeamId: string;
  venueName: string | null;
  matchupLabel: string;
}

export function formatAwayHomeMatchup(
  awayTeamId: string,
  homeTeamId: string,
): string {
  return `${getTeamAbbreviation(awayTeamId)} @ ${getTeamAbbreviation(homeTeamId)}`;
}

export function buildStructuredGameContext(params: {
  gamePk: string | number;
  awayTeamId: string | number;
  homeTeamId: string | number;
  venueName?: string | null;
}): StructuredGameContext {
  const awayTeamId = String(params.awayTeamId);
  const homeTeamId = String(params.homeTeamId);

  return {
    gamePk: String(params.gamePk),
    awayTeamId,
    homeTeamId,
    venueName: params.venueName ?? null,
    matchupLabel: formatAwayHomeMatchup(awayTeamId, homeTeamId),
  };
}

export function getOpponentTeamIdForPlayer(
  game: Pick<Game, "awayTeamId" | "homeTeamId">,
  playerTeamId: string,
): string {
  return game.awayTeamId === playerTeamId ? game.homeTeamId : game.awayTeamId;
}

export function formatDetailedAwayHomeMatchup(
  game: Pick<Game, "awayTeamId" | "homeTeamId"> | null | undefined,
  teams: Record<string, Team>,
): string | null {
  if (!game) return null;

  const awayTeam = teams[game.awayTeamId];
  const homeTeam = teams[game.homeTeamId];
  if (!awayTeam || !homeTeam) return null;

  return `${awayTeam.city} ${awayTeam.name} @ ${homeTeam.city} ${homeTeam.name}`;
}
