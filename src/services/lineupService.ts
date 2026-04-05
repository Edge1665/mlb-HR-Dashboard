// MLB Lineup Service — fetches batting order and handedness per game
// Structured for future use by the home run projection model

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

export type LineupStatus = 'confirmed' | 'projected' | 'unavailable';

export interface LineupPlayer {
  id: number;
  fullName: string;
  battingOrder: number; // 1–9
  position: string; // e.g. "CF", "DH", "1B"
  batSide: 'L' | 'R' | 'S'; // Left, Right, Switch
}

export interface TeamLineup {
  status: LineupStatus;
  players: LineupPlayer[]; // ordered 1–9 when available
}

export interface GameLineup {
  gamePk: number;
  away: TeamLineup;
  home: TeamLineup;
}

// MLB boxscore API response shape (partial)
interface BoxscoreTeamPlayer {
  person?: { id?: number; fullName?: string };
  jerseyNumber?: string;
  position?: { abbreviation?: string };
  status?: { code?: string };
  battingOrder?: string; // "100", "200", ... "900"
  stats?: {
    batting?: Record<string, unknown>;
  };
  seasonStats?: {
    batting?: Record<string, unknown>;
  };
  gameStatus?: { isCurrentBatter?: boolean; isCurrentPitcher?: boolean; isOnBench?: boolean; isSubstitute?: boolean };
}

interface BoxscoreTeam {
  players?: Record<string, BoxscoreTeamPlayer>;
  battingOrder?: number[];
  info?: Array<{ title?: string; fieldList?: Array<{ label?: string; value?: string }> }>;
}

interface BoxscoreResponse {
  teams?: {
    away?: BoxscoreTeam;
    home?: BoxscoreTeam;
  };
}

// Player details response for bat side
interface PlayerDetailsResponse {
  people?: Array<{
    id?: number;
    fullName?: string;
    batSide?: { code?: string };
  }>;
}

// In-memory cache: gamePk → { data, fetchedAt }
const lineupCache = new Map<number, { data: GameLineup; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function emptyTeamLineup(): TeamLineup {
  return { status: 'unavailable', players: [] };
}

async function fetchPlayerBatSides(playerIds: number[]): Promise<Map<number, 'L' | 'R' | 'S'>> {
  const batSideMap = new Map<number, 'L' | 'R' | 'S'>();
  if (playerIds.length === 0) return batSideMap;

  try {
    const ids = playerIds.join(',');
    const res = await fetch(`${MLB_API_BASE}/people?personIds=${ids}&hydrate=batSide`, {
      cache: 'no-store',
    });
    if (!res.ok) return batSideMap;

    let data: PlayerDetailsResponse;
    try {
      data = await res.json();
    } catch {
      return batSideMap;
    }

    for (const p of data?.people ?? []) {
      if (p?.id && p?.batSide?.code) {
        const code = p.batSide.code as 'L' | 'R' | 'S';
        if (code === 'L' || code === 'R' || code === 'S') {
          batSideMap.set(p.id, code);
        }
      }
    }
  } catch {
    // silently fail — bat side is supplemental
  }
  return batSideMap;
}

function parseTeamLineup(team: BoxscoreTeam | undefined): TeamLineup {
  if (!team?.players) return emptyTeamLineup();

  const battingOrderIds = Array.isArray(team.battingOrder) ? team.battingOrder : [];

  // Build ordered lineup from battingOrder array (most reliable)
  if (battingOrderIds.length > 0) {
    const playerMap = team.players;
    const ordered: Array<{ id: number; fullName: string; position: string; slot: number }> = [];

    for (let i = 0; i < battingOrderIds.length; i++) {
      const pid = battingOrderIds[i];
      if (typeof pid !== 'number' || pid <= 0) continue;
      const key = `ID${pid}`;
      const p = playerMap[key];
      if (!p?.person?.id) continue;
      const slot = i + 1;
      ordered.push({
        id: p.person.id,
        fullName: p.person.fullName ?? 'Unknown',
        position: p.position?.abbreviation ?? '?',
        slot,
      });
    }

    if (ordered.length >= 8) {
      return {
        status: 'confirmed',
        players: ordered.slice(0, 9).map(o => ({
          id: o.id,
          fullName: o.fullName,
          battingOrder: o.slot,
          position: o.position,
          batSide: 'R', // placeholder — enriched after
        })),
      };
    }
  }

  // Fallback: scan players for battingOrder field
  const starters: Array<{ id: number; fullName: string; position: string; slot: number }> = [];
  for (const [, p] of Object.entries(team.players)) {
    if (!p?.battingOrder || !p?.person?.id) continue;
    const rawSlot = parseInt(p.battingOrder, 10);
    if (isNaN(rawSlot)) continue;
    const slot = Math.round(rawSlot / 100);
    if (slot < 1 || slot > 9) continue;
    if (p.gameStatus?.isSubstitute) continue;
    starters.push({
      id: p.person.id,
      fullName: p.person.fullName ?? 'Unknown',
      position: p.position?.abbreviation ?? '?',
      slot,
    });
  }

  starters.sort((a, b) => a.slot - b.slot);

  if (starters.length >= 8) {
    return {
      status: 'confirmed',
      players: starters.slice(0, 9).map(s => ({
        id: s.id,
        fullName: s.fullName,
        battingOrder: s.slot,
        position: s.position,
        batSide: 'R', // placeholder — enriched after
      })),
    };
  }

  return emptyTeamLineup();
}

export async function fetchGameLineup(gamePk: number): Promise<GameLineup> {
  if (typeof gamePk !== 'number' || gamePk <= 0) {
    return { gamePk: gamePk ?? 0, away: emptyTeamLineup(), home: emptyTeamLineup() };
  }

  // Check cache
  const cached = lineupCache.get(gamePk);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const fallback: GameLineup = {
    gamePk,
    away: emptyTeamLineup(),
    home: emptyTeamLineup(),
  };

  try {
    const res = await fetch(`${MLB_API_BASE}/game/${gamePk}/boxscore`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      lineupCache.set(gamePk, { data: fallback, fetchedAt: Date.now() });
      return fallback;
    }

    let data: BoxscoreResponse;
    try {
      data = await res.json();
    } catch {
      lineupCache.set(gamePk, { data: fallback, fetchedAt: Date.now() });
      return fallback;
    }

    const awayLineup = parseTeamLineup(data?.teams?.away);
    const homeLineup = parseTeamLineup(data?.teams?.home);

    // Enrich with bat sides
    const allPlayerIds = [
      ...awayLineup.players.map(p => p.id),
      ...homeLineup.players.map(p => p.id),
    ].filter(id => typeof id === 'number' && id > 0);

    const batSideMap = await fetchPlayerBatSides(allPlayerIds);

    for (const p of awayLineup.players) {
      p.batSide = batSideMap.get(p.id) ?? 'R';
    }
    for (const p of homeLineup.players) {
      p.batSide = batSideMap.get(p.id) ?? 'R';
    }

    const result: GameLineup = { gamePk, away: awayLineup, home: homeLineup };
    lineupCache.set(gamePk, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    lineupCache.set(gamePk, { data: fallback, fetchedAt: Date.now() });
    return fallback;
  }
}

export async function fetchLineupsForAllGames(gamePks: number[]): Promise<Map<number, GameLineup>> {
  if (!Array.isArray(gamePks) || gamePks.length === 0) {
    return new Map();
  }

  const validPks = gamePks.filter(pk => typeof pk === 'number' && pk > 0);
  const results = await Promise.allSettled(validPks.map(pk => fetchGameLineup(pk)));
  const map = new Map<number, GameLineup>();

  for (let i = 0; i < validPks.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      map.set(validPks[i], r.value);
    } else {
      map.set(validPks[i], {
        gamePk: validPks[i],
        away: emptyTeamLineup(),
        home: emptyTeamLineup(),
      });
    }
  }
  return map;
}
