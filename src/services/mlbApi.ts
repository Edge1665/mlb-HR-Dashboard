// MLB Stats API + Baseball Savant Statcast API integration layer
import { GAMES, BATTERS, PITCHERS, BALLPARKS, TEAMS, HR_PROJECTIONS, TEAM_HR_DATA } from '@/data/mockData';
import type { Game, Batter, Pitcher, Ballpark, Team, HRProjection } from '@/types';
import type { MLBScheduleResponse } from '@/types/mlbApiTypes';

// ─── MLB Stats API: Real schedule fetch ────────────────────────────────────────

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

function getTodayDateString(): string {
  // Always use Eastern Time (ET) — MLB schedule dates are ET-based
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeScheduleDate(date?: string): string {
  if (!date) return getTodayDateString();
  return date.slice(0, 10);
}

function formatEasternScheduleDate(dateTimeUTC?: string | null): string | null {
  if (!dateTimeUTC) return null;

  try {
    const parsed = new Date(dateTimeUTC);
    if (isNaN(parsed.getTime())) return null;

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  } catch {
    return null;
  }
}

function formatGameTime(dateTimeUTC: string | undefined | null): string {
  if (!dateTimeUTC) return 'TBD';
  try {
    const d = new Date(dateTimeUTC);
    if (isNaN(d.getTime())) return 'TBD';
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

function mapMLBStatus(abstractGameState: string | undefined, detailedState: string | undefined): Game['status'] {
  const detail = (detailedState ?? '').toLowerCase();
  const abstract = (abstractGameState ?? '').toLowerCase();
  if (abstract === 'final') return 'final';
  if (abstract === 'live' || detail.includes('in progress') || detail.includes('warmup')) return 'in_progress';
  if (detail.includes('delayed') || detail.includes('postponed')) return 'delayed';
  return 'scheduled';
}

function buildPlaceholderWeather(): Game['weather'] {
  return {
    temp: 72,
    feelsLike: 70,
    condition: 'Clear',
    windSpeed: 8,
    windDirection: 'SW',
    windToward: 'neutral',
    precipitation: 0,
    humidity: 55,
    visibility: 10,
    hrImpact: 'neutral',
    hrImpactScore: 0,
  };
}

export interface RealMLBGame {
  gamePk: number;
  gameDate: string;
  gameTimeET: string;
  status: Game['status'];
  awayTeamId: number;
  awayTeamName: string;
  awayTeamAbbr: string;
  awayTeamRecord: { wins: number; losses: number };
  homeTeamId: number;
  homeTeamName: string;
  homeTeamAbbr: string;
  homeTeamRecord: { wins: number; losses: number };
  venueName: string;
  venueId: number;
  awayProbablePitcher: { id: number; fullName: string } | null;
  homeProbablePitcher: { id: number; fullName: string } | null;
  broadcasts: string[];
  awayScore?: number;
  homeScore?: number;
  inning?: number;
  inningState?: string;
}

export async function fetchTodaysMLBSchedule(date?: string): Promise<RealMLBGame[]> {
  const normalizedDate = normalizeScheduleDate(date);
  const url = `${MLB_API_BASE}/schedule?sportId=1&date=${normalizedDate}&hydrate=probablePitcher,linescore,broadcasts(all),team,venue&gameType=R`;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    throw new Error(`Network error fetching MLB schedule: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    throw new Error(`MLB API error: ${res.status} ${res.statusText}`);
  }

  let data: MLBScheduleResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error('Failed to parse MLB schedule response as JSON');
  }

  const games: RealMLBGame[] = [];

  for (const dateEntry of data?.dates ?? []) {
    for (const g of dateEntry?.games ?? []) {
      try {
        const gameDateEt = formatEasternScheduleDate(g.gameDate);
        if (gameDateEt && gameDateEt !== normalizedDate) {
          continue;
        }

        const away = g.teams?.away;
        const home = g.teams?.home;
        if (!away || !home) continue;

        const awayRecord = away.leagueRecord ?? { wins: 0, losses: 0 };
        const homeRecord = home.leagueRecord ?? { wins: 0, losses: 0 };

        const broadcasts: string[] = [];
        if (Array.isArray(g.broadcasts)) {
          for (const b of g.broadcasts) {
            if (b?.type === 'TV' && b?.name) broadcasts.push(b.name);
          }
        }

        // Validate gamePk is a usable number
        const gamePk = typeof g.gamePk === 'number' && g.gamePk > 0 ? g.gamePk : 0;
        if (gamePk === 0) continue;

        games.push({
          gamePk,
          gameDate: g.gameDate ?? '',
          gameTimeET: formatGameTime(g.gameDate),
          status: mapMLBStatus(
            g.status?.abstractGameState,
            g.status?.detailedState
          ),
          awayTeamId: away.team?.id ?? 0,
          awayTeamName: away.team?.name ?? 'Unknown',
          awayTeamAbbr: away.team?.abbreviation ?? '???',
          awayTeamRecord: { wins: awayRecord.wins ?? 0, losses: awayRecord.losses ?? 0 },
          homeTeamId: home.team?.id ?? 0,
          homeTeamName: home.team?.name ?? 'Unknown',
          homeTeamAbbr: home.team?.abbreviation ?? '???',
          homeTeamRecord: { wins: homeRecord.wins ?? 0, losses: homeRecord.losses ?? 0 },
          venueName: g.venue?.name ?? 'Unknown Venue',
          venueId: g.venue?.id ?? 0,
          awayProbablePitcher: away.probablePitcher?.id
            ? { id: away.probablePitcher.id, fullName: away.probablePitcher.fullName ?? 'Unknown' }
            : null,
          homeProbablePitcher: home.probablePitcher?.id
            ? { id: home.probablePitcher.id, fullName: home.probablePitcher.fullName ?? 'Unknown' }
            : null,
          broadcasts: broadcasts.slice(0, 2),
          awayScore: typeof away.score === 'number' ? away.score : undefined,
          homeScore: typeof home.score === 'number' ? home.score : undefined,
          inning: typeof g.linescore?.currentInning === 'number' ? g.linescore.currentInning : undefined,
          inningState: g.linescore?.inningState ?? undefined,
        });
      } catch (gameErr) {
        // Skip malformed game entries rather than crashing the whole fetch
        console.warn('[mlbApi] Skipping malformed game entry:', gameErr);
        continue;
      }
    }
  }

  return games;
}

// ─── Mock-based functions (kept for HR Dashboard & Player Research) ────────────

export async function getTodaysGames(): Promise<Game[]> {
  await new Promise(r => setTimeout(r, 400));
  return GAMES;
}

export async function getGame(id: string): Promise<Game | null> {
  await new Promise(r => setTimeout(r, 200));
  return GAMES.find(g => g.id === id) ?? null;
}

export async function getBatter(id: string): Promise<Batter | null> {
  await new Promise(r => setTimeout(r, 200));
  return BATTERS[id] ?? null;
}

export async function getAllBatters(): Promise<Batter[]> {
  await new Promise(r => setTimeout(r, 300));
  return Object.values(BATTERS);
}

export async function getPitcher(id: string): Promise<Pitcher | null> {
  await new Promise(r => setTimeout(r, 200));
  return PITCHERS[id] ?? null;
}

export async function getBallpark(id: string): Promise<Ballpark | null> {
  await new Promise(r => setTimeout(r, 100));
  return BALLPARKS[id] ?? null;
}

export async function getTeam(id: string): Promise<Team | null> {
  await new Promise(r => setTimeout(r, 100));
  return TEAMS[id] ?? null;
}

export async function getTodaysProjections(): Promise<HRProjection[]> {
  await new Promise(r => setTimeout(r, 500));
  return HR_PROJECTIONS.sort((a, b) => b.hrProbability - a.hrProbability);
}

export async function getTeamHRData() {
  await new Promise(r => setTimeout(r, 300));
  return TEAM_HR_DATA;
}
