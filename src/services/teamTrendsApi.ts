// Team Trends — MLB Stats API integration
// Fetches real team offensive data: season stats, recent game logs, splits

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  division: string;
  league: string;
}

export interface TeamSeasonOffense {
  gamesPlayed: number;
  runsScored: number;
  runsPerGame: number;
  homeRuns: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  hits: number;
  doubles: number;
  triples: number;
  strikeOuts: number;
  baseOnBalls: number;
  stolenBases: number;
  leftOnBase: number;
}

export interface TeamGameLogEntry {
  date: string;
  opponent: string;
  isHome: boolean;
  runsScored: number;
  runsAllowed: number;
  hits: number;
  homeRuns: number;
  result: 'W' | 'L';
}

export interface TeamSplitOffense {
  home: {
    gamesPlayed: number;
    runsPerGame: number;
    avg: number;
    ops: number;
    homeRuns: number;
  } | null;
  away: {
    gamesPlayed: number;
    runsPerGame: number;
    avg: number;
    ops: number;
    homeRuns: number;
  } | null;
  vsLeft: {
    avg: number;
    ops: number;
    homeRuns: number;
    plateAppearances: number;
  } | null;
  vsRight: {
    avg: number;
    ops: number;
    homeRuns: number;
    plateAppearances: number;
  } | null;
}

export interface TeamTrendsData {
  team: TeamInfo;
  seasonOffense: TeamSeasonOffense | null;
  recentGames: TeamGameLogEntry[];
  splits: TeamSplitOffense;
  last5: {
    runsPerGame: number;
    homeRuns: number;
    avg: number;
    ops: number;
    wins: number;
    games: number;
  } | null;
  last10: {
    runsPerGame: number;
    homeRuns: number;
    avg: number;
    ops: number;
    wins: number;
    games: number;
  } | null;
}

// ─── MLB Teams List ────────────────────────────────────────────────────────────

export async function fetchAllTeams(): Promise<TeamInfo[]> {
  try {
    const res = await fetch(`${MLB_API_BASE}/teams?sportId=1&season=${new Date().getFullYear()}`, {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch teams');
    const data = await res.json();
    const teams: TeamInfo[] = (data.teams ?? [])
      .filter((t: any) => t.sport?.id === 1)
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        abbreviation: t.abbreviation ?? t.teamCode?.toUpperCase() ?? '',
        division: t.division?.name ?? '',
        league: t.league?.name ?? '',
      }))
      .sort((a: TeamInfo, b: TeamInfo) => a.name.localeCompare(b.name));
    return teams;
  } catch {
    return [];
  }
}

// ─── Team Season Offense ───────────────────────────────────────────────────────

async function fetchTeamSeasonOffense(teamId: number, season: number): Promise<TeamSeasonOffense | null> {
  try {
    const res = await fetch(
      `${MLB_API_BASE}/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const s = data.stats?.[0]?.splits?.[0]?.stat;
    if (!s) return null;
    const gp = s.gamesPlayed ?? 0;
    return {
      gamesPlayed: gp,
      runsScored: s.runs ?? 0,
      runsPerGame: gp > 0 ? parseFloat(((s.runs ?? 0) / gp).toFixed(2)) : 0,
      homeRuns: s.homeRuns ?? 0,
      avg: parseFloat(s.avg ?? '0'),
      obp: parseFloat(s.obp ?? '0'),
      slg: parseFloat(s.slg ?? '0'),
      ops: parseFloat(s.ops ?? '0'),
      hits: s.hits ?? 0,
      doubles: s.doubles ?? 0,
      triples: s.triples ?? 0,
      strikeOuts: s.strikeOuts ?? 0,
      baseOnBalls: s.baseOnBalls ?? 0,
      stolenBases: s.stolenBases ?? 0,
      leftOnBase: s.leftOnBase ?? 0,
    };
  } catch {
    return null;
  }
}

// ─── Team Game Log ─────────────────────────────────────────────────────────────

async function fetchTeamGameLog(teamId: number, season: number): Promise<TeamGameLogEntry[]> {
  try {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await fetch(
      `${MLB_API_BASE}/schedule?teamId=${teamId}&sportId=1&startDate=${startDate}&endDate=${endDate}&gameType=R&hydrate=linescore`,
      { cache: 'no-store' }
    );
    if (!res.ok) return [];
    const data = await res.json();

    const games: TeamGameLogEntry[] = [];
    for (const dateEntry of (data.dates ?? [])) {
      for (const game of (dateEntry.games ?? [])) {
        if (game.status?.abstractGameState !== 'Final') continue;
        let home = game.teams?.home;
        let away = game.teams?.away;
        const isHome = home?.team?.id === teamId;
        const myTeam = isHome ? home : away;
        const oppTeam = isHome ? away : home;
        const myScore = myTeam?.score ?? 0;
        const oppScore = oppTeam?.score ?? 0;
        const linescore = game.linescore;
        const myHits = isHome ? (linescore?.teams?.home?.hits ?? 0) : (linescore?.teams?.away?.hits ?? 0);
        const myHR = myTeam?.leagueRecord ? 0 : 0; // HR not in schedule, will use 0

        games.push({
          date: dateEntry.date,
          opponent: oppTeam?.team?.abbreviation ?? oppTeam?.team?.name ?? 'OPP',
          isHome,
          runsScored: myScore,
          runsAllowed: oppScore,
          hits: myHits,
          homeRuns: 0, // schedule endpoint doesn't include HR per team
          result: myScore > oppScore ? 'W' : 'L',
        });
      }
    }

    // Sort by date descending, take last 15
    return games.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  } catch {
    return [];
  }
}

// ─── Team Splits ───────────────────────────────────────────────────────────────

async function fetchTeamSplits(teamId: number, season: number): Promise<TeamSplitOffense> {
  const empty: TeamSplitOffense = { home: null, away: null, vsLeft: null, vsRight: null };
  try {
    const [homeRes, awayRes] = await Promise.allSettled([
      fetch(`${MLB_API_BASE}/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${season}&sitCodes=h`, { cache: 'no-store' }),
      fetch(`${MLB_API_BASE}/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${season}&sitCodes=a`, { cache: 'no-store' }),
    ]);

    let home: TeamSplitOffense['home'] = null;
    let away: TeamSplitOffense['away'] = null;

    if (homeRes.status === 'fulfilled' && homeRes.value.ok) {
      const d = await homeRes.value.json();
      const s = d.stats?.[0]?.splits?.[0]?.stat;
      if (s) {
        const gp = s.gamesPlayed ?? 0;
        home = {
          gamesPlayed: gp,
          runsPerGame: gp > 0 ? parseFloat(((s.runs ?? 0) / gp).toFixed(2)) : 0,
          avg: parseFloat(s.avg ?? '0'),
          ops: parseFloat(s.ops ?? '0'),
          homeRuns: s.homeRuns ?? 0,
        };
      }
    }

    if (awayRes.status === 'fulfilled' && awayRes.value.ok) {
      const d = await awayRes.value.json();
      const s = d.stats?.[0]?.splits?.[0]?.stat;
      if (s) {
        const gp = s.gamesPlayed ?? 0;
        away = {
          gamesPlayed: gp,
          runsPerGame: gp > 0 ? parseFloat(((s.runs ?? 0) / gp).toFixed(2)) : 0,
          avg: parseFloat(s.avg ?? '0'),
          ops: parseFloat(s.ops ?? '0'),
          homeRuns: s.homeRuns ?? 0,
        };
      }
    }

    return { ...empty, home, away };
  } catch {
    return empty;
  }
}

// ─── Compute Recent Form ───────────────────────────────────────────────────────

function computeRecentForm(games: TeamGameLogEntry[], n: number) {
  const slice = games.slice(0, n);
  if (slice.length === 0) return null;
  const totalRuns = slice.reduce((s, g) => s + g.runsScored, 0);
  const totalHR = slice.reduce((s, g) => s + g.homeRuns, 0);
  const wins = slice.filter(g => g.result === 'W').length;
  return {
    runsPerGame: parseFloat((totalRuns / slice.length).toFixed(2)),
    homeRuns: totalHR,
    avg: 0, // not available from schedule
    ops: 0,
    wins,
    games: slice.length,
  };
}

// ─── Main Fetch ────────────────────────────────────────────────────────────────

export async function fetchTeamTrends(teamId: number): Promise<TeamTrendsData | null> {
  const season = new Date().getFullYear();

  try {
    // Fetch team info
    const teamRes = await fetch(`${MLB_API_BASE}/teams/${teamId}`, { cache: 'no-store' });
    if (!teamRes.ok) return null;
    const teamData = await teamRes.json();
    const t = teamData.teams?.[0];
    if (!t) return null;

    const team: TeamInfo = {
      id: t.id,
      name: t.name,
      abbreviation: t.abbreviation ?? '',
      division: t.division?.name ?? '',
      league: t.league?.name ?? '',
    };

    const [seasonOffense, recentGames, splits] = await Promise.all([
      fetchTeamSeasonOffense(teamId, season),
      fetchTeamGameLog(teamId, season),
      fetchTeamSplits(teamId, season),
    ]);

    const last5 = computeRecentForm(recentGames, 5);
    const last10 = computeRecentForm(recentGames, 10);

    return { team, seasonOffense, recentGames, splits, last5, last10 };
  } catch {
    return null;
  }
}
