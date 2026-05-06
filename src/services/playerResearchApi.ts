// Player Research — MLB Stats API integration
// Fetches real player data: search, season stats, game log, splits, today's matchup

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerSearchResult {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  primaryPosition: string;
  batSide: 'L' | 'R' | 'S';
  currentTeam: string;
  currentTeamId: number;
  jerseyNumber: string;
  active: boolean;
}

export interface PlayerSeasonStats {
  gamesPlayed: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbi: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  strikeOuts: number;
  baseOnBalls: number;
  stolenBases: number;
  doubles: number;
  triples: number;
  plateAppearances: number;
}

export interface PlayerGameLogEntry {
  date: string;
  opponent: string;
  atBats: number;
  hits: number;
  homeRuns: number;
  rbi: number;
  baseOnBalls: number;
  strikeOuts: number;
  avg: number;
  ops: number;
}

export interface PlayerSplitStats {
  vsLeft: {
    plateAppearances: number;
    avg: number;
    obp: number;
    slg: number;
    ops: number;
    homeRuns: number;
  } | null;
  vsRight: {
    plateAppearances: number;
    avg: number;
    obp: number;
    slg: number;
    ops: number;
    homeRuns: number;
  } | null;
}

export interface TodaysMatchup {
  gamePk: number;
  gameTimeET: string;
  awayTeamName: string;
  awayTeamAbbr: string;
  homeTeamName: string;
  homeTeamAbbr: string;
  matchupLabel: string;
  opponentTeamName: string;
  opponentTeamAbbr: string;
  isHome: boolean;
  venueName: string;
  probablePitcher: {
    id: number;
    fullName: string;
    throwSide: 'L' | 'R';
    era: number | null;
    whip: number | null;
    wins: number | null;
    losses: number | null;
    strikeOuts: number | null;
    inningsPitched: string | null;
  } | null;
}

export interface FullPlayerProfile {
  id: number;
  fullName: string;
  firstName: string;
  lastName: string;
  primaryPosition: string;
  batSide: 'L' | 'R' | 'S';
  throwSide: 'L' | 'R';
  currentTeam: string;
  currentTeamId: number;
  jerseyNumber: string;
  birthDate: string;
  age: number;
  height: string;
  weight: number;
  active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayET(): string {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentYear(): number {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etDate.getFullYear();
}

function formatGameTime(dateTimeUTC: string): string {
  if (!dateTimeUTC) return 'TBD';
  try {
    const d = new Date(dateTimeUTC);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });
  } catch {
    return 'TBD';
  }
}

function safeNum(val: unknown): number {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function safeAvg(val: unknown): number {
  const n = Number(val);
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

// ─── Player Search ────────────────────────────────────────────────────────────

export async function searchPlayers(query: string): Promise<PlayerSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const encoded = encodeURIComponent(query.trim());
  const url = `${MLB_API_BASE}/people/search?names=${encoded}&sportId=1&hydrate=currentTeam`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const people = data.people ?? [];
    return people
      .filter((p: Record<string, unknown>) => p.active === true)
      .map((p: Record<string, unknown>) => ({
        id: p.id as number,
        fullName: (p.fullName as string) ?? '',
        firstName: (p.firstName as string) ?? '',
        lastName: (p.lastName as string) ?? '',
        primaryPosition: ((p.primaryPosition as Record<string, unknown>)?.abbreviation as string) ?? '',
        batSide: (((p.batSide as Record<string, unknown>)?.code as string) ?? 'R') as 'L' | 'R' | 'S',
        currentTeam: ((p.currentTeam as Record<string, unknown>)?.name as string) ?? '',
        currentTeamId: ((p.currentTeam as Record<string, unknown>)?.id as number) ?? 0,
        jerseyNumber: (p.primaryNumber as string) ?? '',
        active: (p.active as boolean) ?? false,
      }))
      .slice(0, 30);
  } catch {
    return [];
  }
}

// ─── Player Profile ───────────────────────────────────────────────────────────

export async function getPlayerProfile(playerId: number): Promise<FullPlayerProfile | null> {
  const url = `${MLB_API_BASE}/people/${playerId}?hydrate=currentTeam`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data.people?.[0];
    if (!p) return null;
    return {
      id: p.id,
      fullName: p.fullName ?? '',
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      primaryPosition: p.primaryPosition?.abbreviation ?? '',
      batSide: (p.batSide?.code ?? 'R') as 'L' | 'R' | 'S',
      throwSide: (p.pitchHand?.code ?? 'R') as 'L' | 'R',
      currentTeam: p.currentTeam?.name ?? '',
      currentTeamId: p.currentTeam?.id ?? 0,
      jerseyNumber: p.primaryNumber ?? '',
      birthDate: p.birthDate ?? '',
      age: p.currentAge ?? 0,
      height: p.height ?? '',
      weight: p.weight ?? 0,
      active: p.active ?? false,
    };
  } catch {
    return null;
  }
}

// ─── Season Stats ─────────────────────────────────────────────────────────────

export async function getPlayerSeasonStats(playerId: number): Promise<PlayerSeasonStats | null> {
  const season = getCurrentYear();
  const url = `${MLB_API_BASE}/people/${playerId}/stats?stats=season&group=hitting&season=${season}&sportId=1`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const splits = data.stats?.[0]?.splits;
    if (!splits || splits.length === 0) return null;
    const s = splits[0].stat;
    return {
      gamesPlayed: safeNum(s.gamesPlayed),
      atBats: safeNum(s.atBats),
      hits: safeNum(s.hits),
      homeRuns: safeNum(s.homeRuns),
      rbi: safeNum(s.rbi),
      avg: safeAvg(s.avg),
      obp: safeAvg(s.obp),
      slg: safeAvg(s.slg),
      ops: safeAvg(s.ops),
      strikeOuts: safeNum(s.strikeOuts),
      baseOnBalls: safeNum(s.baseOnBalls),
      stolenBases: safeNum(s.stolenBases),
      doubles: safeNum(s.doubles),
      triples: safeNum(s.triples),
      plateAppearances: safeNum(s.plateAppearances),
    };
  } catch {
    return null;
  }
}

// ─── Game Log ─────────────────────────────────────────────────────────────────

export async function getPlayerGameLog(playerId: number, limit: number = 10): Promise<PlayerGameLogEntry[]> {
  const season = getCurrentYear();
  const url = `${MLB_API_BASE}/people/${playerId}/stats?stats=gameLog&group=hitting&season=${season}&sportId=1`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    const splits: Record<string, unknown>[] = data.stats?.[0]?.splits ?? [];
    // Most recent games first
    const recent = splits.slice(-limit).reverse();
    return recent.map((entry: Record<string, unknown>) => {
      const s = entry.stat as Record<string, unknown>;
      const opponent = entry.opponent as Record<string, unknown>;
      const date = entry.date as string ?? '';
      const atBats = safeNum(s?.atBats);
      const hits = safeNum(s?.hits);
      const bb = safeNum(s?.baseOnBalls);
      const hr = safeNum(s?.homeRuns);
      // Calculate OPS from raw stats
      const obp = atBats + bb > 0 ? (hits + bb) / (atBats + bb) : 0;
      const slg = atBats > 0 ? (hits - safeNum(s?.doubles) - safeNum(s?.triples) - hr + safeNum(s?.doubles) * 2 + safeNum(s?.triples) * 3 + hr * 4) / atBats : 0;
      return {
        date: date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
        opponent: (opponent?.abbreviation as string) ?? (opponent?.name as string) ?? '???',
        atBats,
        hits,
        homeRuns: hr,
        rbi: safeNum(s?.rbi),
        baseOnBalls: bb,
        strikeOuts: safeNum(s?.strikeOuts),
        avg: safeAvg(s?.avg),
        ops: Math.round((obp + slg) * 1000) / 1000,
      };
    });
  } catch {
    return [];
  }
}

// ─── Splits ───────────────────────────────────────────────────────────────────

export async function getPlayerSplits(playerId: number): Promise<PlayerSplitStats> {
  const season = getCurrentYear();
  const url = `${MLB_API_BASE}/people/${playerId}/stats?stats=statSplits&group=hitting&season=${season}&sportId=1&sitCodes=vl,vr`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { vsLeft: null, vsRight: null };
    const data = await res.json();
    const splits: Record<string, unknown>[] = data.stats?.[0]?.splits ?? [];

    let vsLeft = null;
    let vsRight = null;

    for (const split of splits) {
      const sitCode = (split.split as Record<string, unknown>)?.code as string;
      const s = split.stat as Record<string, unknown>;
      const entry = {
        plateAppearances: safeNum(s?.plateAppearances),
        avg: safeAvg(s?.avg),
        obp: safeAvg(s?.obp),
        slg: safeAvg(s?.slg),
        ops: safeAvg(s?.ops),
        homeRuns: safeNum(s?.homeRuns),
      };
      if (sitCode === 'vl') vsLeft = entry;
      if (sitCode === 'vr') vsRight = entry;
    }

    return { vsLeft, vsRight };
  } catch {
    return { vsLeft: null, vsRight: null };
  }
}

// ─── Today's Matchup ──────────────────────────────────────────────────────────

export async function getTodaysMatchup(playerId: number, teamId: number): Promise<TodaysMatchup | null> {
  const today = getTodayET();
  const scheduleUrl = `${MLB_API_BASE}/schedule?sportId=1&date=${today}&hydrate=probablePitcher,team,venue&gameType=R,S&teamId=${teamId}`;
  try {
    const res = await fetch(scheduleUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const dates = data.dates ?? [];
    if (dates.length === 0) return null;
    const games = dates[0]?.games ?? [];
    if (games.length === 0) return null;
    const game = games[0];

    const awayTeam = game.teams?.away;
    const homeTeam = game.teams?.home;
    const isHome = homeTeam?.team?.id === teamId;
    const opponentSide = isHome ? awayTeam : homeTeam;
    const mySide = isHome ? homeTeam : awayTeam;

    const probablePitcherRaw = opponentSide?.probablePitcher;
    let probablePitcher = null;

    if (probablePitcherRaw?.id) {
      // Fetch pitcher season stats
      const pitcherStatsUrl = `${MLB_API_BASE}/people/${probablePitcherRaw.id}/stats?stats=season&group=pitching&season=${getCurrentYear()}&sportId=1`;
      try {
        const pRes = await fetch(pitcherStatsUrl, { cache: 'no-store' });
        let era: number | null = null;
        let whip: number | null = null;
        let wins: number | null = null;
        let losses: number | null = null;
        let strikeOuts: number | null = null;
        let inningsPitched: string | null = null;
        if (pRes.ok) {
          const pData = await pRes.json();
          const pSplits = pData.stats?.[0]?.splits;
          if (pSplits && pSplits.length > 0) {
            const ps = pSplits[0].stat;
            era = ps.era ? safeAvg(ps.era) : null;
            whip = ps.whip ? safeAvg(ps.whip) : null;
            wins = ps.wins != null ? safeNum(ps.wins) : null;
            losses = ps.losses != null ? safeNum(ps.losses) : null;
            strikeOuts = ps.strikeOuts != null ? safeNum(ps.strikeOuts) : null;
            inningsPitched = ps.inningsPitched ?? null;
          }
        }
        // Get pitcher handedness
        const pitcherProfileUrl = `${MLB_API_BASE}/people/${probablePitcherRaw.id}`;
        const ppRes = await fetch(pitcherProfileUrl, { cache: 'no-store' });
        let throwSide: 'L' | 'R' = 'R';
        if (ppRes.ok) {
          const ppData = await ppRes.json();
          throwSide = (ppData.people?.[0]?.pitchHand?.code ?? 'R') as 'L' | 'R';
        }
        probablePitcher = {
          id: probablePitcherRaw.id,
          fullName: probablePitcherRaw.fullName ?? '',
          throwSide,
          era,
          whip,
          wins,
          losses,
          strikeOuts,
          inningsPitched,
        };
      } catch {
        probablePitcher = {
          id: probablePitcherRaw.id,
          fullName: probablePitcherRaw.fullName ?? '',
          throwSide: 'R' as 'L' | 'R',
          era: null,
          whip: null,
          wins: null,
          losses: null,
          strikeOuts: null,
          inningsPitched: null,
        };
      }
    }

    return {
      gamePk: game.gamePk,
      gameTimeET: formatGameTime(game.gameDate),
      awayTeamName: awayTeam?.team?.name ?? 'Unknown',
      awayTeamAbbr: awayTeam?.team?.abbreviation ?? '???',
      homeTeamName: homeTeam?.team?.name ?? 'Unknown',
      homeTeamAbbr: homeTeam?.team?.abbreviation ?? '???',
      matchupLabel: `${awayTeam?.team?.abbreviation ?? '???'} @ ${homeTeam?.team?.abbreviation ?? '???'}`,
      opponentTeamName: opponentSide?.team?.name ?? 'Unknown',
      opponentTeamAbbr: opponentSide?.team?.abbreviation ?? '???',
      isHome,
      venueName: game.venue?.name ?? '',
      probablePitcher,
    };
  } catch {
    return null;
  }
}

// ─── Recent form aggregation (last 5 / last 10) ───────────────────────────────

export interface RecentFormSummary {
  games: number;
  avg: number;
  homeRuns: number;
  rbi: number;
  ops: number;
  hits: number;
  atBats: number;
}

export function computeRecentForm(gameLog: PlayerGameLogEntry[], games: number): RecentFormSummary {
  const slice = gameLog.slice(0, games);
  if (slice.length === 0) return { games: 0, avg: 0, homeRuns: 0, rbi: 0, ops: 0, hits: 0, atBats: 0 };
  const totAB = slice.reduce((s, g) => s + g.atBats, 0);
  const totH = slice.reduce((s, g) => s + g.hits, 0);
  const totBB = slice.reduce((s, g) => s + g.baseOnBalls, 0);
  const totHR = slice.reduce((s, g) => s + g.homeRuns, 0);
  const totRBI = slice.reduce((s, g) => s + g.rbi, 0);
  const avg = totAB > 0 ? totH / totAB : 0;
  const obp = (totAB + totBB) > 0 ? (totH + totBB) / (totAB + totBB) : 0;
  // Simplified SLG: (singles + 2*2B + 3*3B + 4*HR) / AB — we only have HR from game log
  // Approximate: use season SLG ratio or just use hits-based
  const slg = totAB > 0 ? (totH + totHR * 3) / totAB : 0; // rough approximation
  return {
    games: slice.length,
    avg: Math.round(avg * 1000) / 1000,
    homeRuns: totHR,
    rbi: totRBI,
    ops: Math.round((obp + slg) * 1000) / 1000,
    hits: totH,
    atBats: totAB,
  };
}
