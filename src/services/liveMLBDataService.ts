/**
 * Live MLB Data Service
 * Fetches real data from the MLB Stats API and converts it into the app's
 * internal Batter / Pitcher / Game / Ballpark types for the HR prediction model.
 */

import type { Batter, Pitcher, Game, Ballpark, Team, Weather } from '@/types';
import { fetchTodaysMLBSchedule, type RealMLBGame } from './mlbApi';
import { fetchGameLineup } from './lineupService';
import { fetchWeatherForTeamHomePark, getNeutralWeather } from '@/services/weatherService';

const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';

function normalizeTargetDate(value?: string): string {
  if (value) return value.slice(0, 10);

  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getSeasonFromDate(value?: string): number {
  const normalized = normalizeTargetDate(value);
  const [year] = normalized.split('-').map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function isTodayETDate(date: string): boolean {
  return normalizeTargetDate(date) === normalizeTargetDate();
}

function toGameWeather(
  weather: Awaited<ReturnType<typeof fetchWeatherForTeamHomePark>> | null
): Weather {
  if (!weather) {
    return {
      temp: 70,
      feelsLike: 70,
      condition: 'Unknown',
      windSpeed: 0,
      windDirection: 'N',
      windToward: 'neutral',
      precipitation: 0,
      humidity: 50,
      visibility: 10,
      hrImpact: 'neutral',
      hrImpactScore: 0,
    };
  }

  const mappedImpact: Weather['hrImpact'] =
    weather.hrImpact === 'poor'
      ? 'negative'
      : weather.hrImpact === 'good' || weather.hrImpact === 'great'
        ? 'positive'
        : 'neutral';

  const mappedToward: Weather['windToward'] =
    weather.windToward === 'out' || weather.windToward === 'in'
      ? weather.windToward
      : 'neutral';

  const mappedDirection: Weather['windDirection'] =
    weather.windDirection === 'N' ||
    weather.windDirection === 'NE' ||
    weather.windDirection === 'E' ||
    weather.windDirection === 'SE' ||
    weather.windDirection === 'S' ||
    weather.windDirection === 'SW' ||
    weather.windDirection === 'W' ||
    weather.windDirection === 'NW'
      ? weather.windDirection
      : 'N';

  return {
    temp: weather.temp,
    feelsLike: weather.feelsLike,
    condition: weather.condition,
    windSpeed: weather.windSpeed,
    windDirection: mappedDirection,
    windToward: mappedToward,
    precipitation: weather.precipitation,
    humidity: weather.humidity,
    visibility: weather.visibility,
    hrImpact: mappedImpact,
    hrImpactScore: weather.hrImpactScore,
  };
}

// ─── Fetch helper with AbortController timeout ────────────────────────────────
// Prevents the Node.js TransformStream race condition (controller[kState].transformAlgorithm)
// that occurs when many concurrent fetch streams are left open/abandoned.
async function fetchWithTimeout(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Park factor lookup by MLB venue ID ──────────────────────────────────────
// Source: multi-year park factor data (Statcast / FanGraphs)
const PARK_FACTORS: Record<number, { hrFactor: number; elevation: number; name: string }> = {
  1:    { hrFactor: 0.97,  elevation: 830,  name: 'Target Field' },           // MIN
  2:    { hrFactor: 0.96,  elevation: 20,   name: 'Tropicana Field' },         // TB
  3:    { hrFactor: 1.04,  elevation: 595,  name: 'Wrigley Field' },           // CHC
  4:    { hrFactor: 1.06,  elevation: 595,  name: 'Guaranteed Rate Field' },   // CWS
  5:    { hrFactor: 0.94,  elevation: 489,  name: 'Great American Ball Park' },// CIN (old id)
  15:   { hrFactor: 1.28,  elevation: 489,  name: 'Great American Ball Park' },// CIN
  17:   { hrFactor: 0.88,  elevation: 600,  name: 'Comerica Park' },           // DET
  19:   { hrFactor: 1.38,  elevation: 5280, name: 'Coors Field' },             // COL
  22:   { hrFactor: 0.97,  elevation: 830,  name: 'Target Field' },            // MIN
  26:   { hrFactor: 1.16,  elevation: 551,  name: 'Globe Life Field' },        // TEX
  27:   { hrFactor: 0.82,  elevation: 12,   name: 'Oracle Park' },             // SF
  28:   { hrFactor: 0.98,  elevation: 512,  name: 'Dodger Stadium' },          // LAD
  29:   { hrFactor: 0.94,  elevation: 17,   name: 'T-Mobile Park' },           // SEA
  30:   { hrFactor: 1.06,  elevation: 43,   name: 'Minute Maid Park' },        // HOU
  31:   { hrFactor: 1.22,  elevation: 20,   name: 'Citizens Bank Park' },      // PHI
  32:   { hrFactor: 1.08,  elevation: 1050, name: 'Truist Park' },             // ATL
  34:   { hrFactor: 0.92,  elevation: 20,   name: 'Fenway Park' },             // BOS
  36:   { hrFactor: 1.18,  elevation: 55,   name: 'Yankee Stadium' },          // NYY
  2392: { hrFactor: 1.02,  elevation: 15,   name: 'loanDepot park' },          // MIA
  2395: { hrFactor: 1.10,  elevation: 840,  name: 'Chase Field' },             // ARI
  2681: { hrFactor: 1.04,  elevation: 595,  name: 'Wrigley Field' },           // CHC alt
  2889: { hrFactor: 1.12,  elevation: 20,   name: 'Citi Field' },              // NYM
  3289: { hrFactor: 1.00,  elevation: 20,   name: 'Nationals Park' },          // WSH
  3309: { hrFactor: 1.05,  elevation: 20,   name: 'Camden Yards' },            // BAL
  3312: { hrFactor: 1.00,  elevation: 20,   name: 'PNC Park' },                // PIT
  4169: { hrFactor: 1.02,  elevation: 20,   name: 'Petco Park' },              // SD
  4705: { hrFactor: 1.14,  elevation: 840,  name: 'American Family Field' },   // MIL
  5325: { hrFactor: 1.00,  elevation: 20,   name: 'Busch Stadium' },           // STL
  5380: { hrFactor: 1.00,  elevation: 20,   name: 'Progressive Field' },       // CLE
  680:  { hrFactor: 1.00,  elevation: 20,   name: 'Oakland Coliseum' },        // OAK
  2500: { hrFactor: 1.00,  elevation: 20,   name: 'Sutter Health Park' },      // OAK alt
  5000: { hrFactor: 1.00,  elevation: 20,   name: 'Sahlen Field' },            // BUF
};

function getParkData(venueId: number, venueName: string): { hrFactor: number; elevation: number; name: string } {
  return PARK_FACTORS[venueId] ?? { hrFactor: 1.0, elevation: 20, name: venueName };
}

// ─── MLB team color lookup by team ID ────────────────────────────────────────
const TEAM_COLORS: Record<number, string> = {
  108: '#BA0021', // LAA
  109: '#A71930', // ARI
  110: '#DF4601', // BAL
  111: '#BD3039', // BOS
  112: '#0E3386', // CHC
  113: '#C6011F', // CIN
  114: '#00385D', // CLE
  115: '#33006F', // COL
  116: '#0C2340', // DET
  117: '#002D62', // HOU
  118: '#004687', // KC
  119: '#005A9C', // LAD
  158: '#12284B', // MIL
  120: '#AB0003', // WSH
  121: '#002D72', // NYM
  133: '#003831', // OAK
  134: '#27251F', // PIT
  135: '#2F241D', // SD
  136: '#0C2C56', // SEA
  137: '#FD5A1E', // SF
  138: '#C41E3A', // STL
  139: '#092C5C', // TB
  140: '#003278', // TEX
  141: '#134A8E', // TOR
  142: '#002B5C', // MIN
  143: '#E81828', // PHI
  144: '#CE1141', // ATL
  145: '#27251F', // CWS
  146: '#00A3E0', // MIA
  147: '#003087', // NYY
};

// ─── MLB team city lookup by team ID ─────────────────────────────────────────
const TEAM_CITIES: Record<number, string> = {
  108: 'Los Angeles',   // LAA
  109: 'Arizona',       // ARI
  110: 'Baltimore',     // BAL
  111: 'Boston',        // BOS
  112: 'Chicago',       // CHC
  113: 'Cincinnati',    // CIN
  114: 'Cleveland',     // CLE
  115: 'Colorado',      // COL
  116: 'Detroit',       // DET
  117: 'Houston',       // HOU
  118: 'Kansas City',   // KC
  119: 'Los Angeles',   // LAD
  120: 'Washington',    // WSH
  121: 'New York',      // NYM
  133: 'Oakland',       // OAK
  134: 'Pittsburgh',    // PIT
  135: 'San Diego',     // SD
  136: 'Seattle',       // SEA
  137: 'San Francisco', // SF
  138: 'St. Louis',     // STL
  139: 'Tampa Bay',     // TB
  140: 'Texas',         // TEX
  141: 'Toronto',       // TOR
  142: 'Minnesota',     // MIN
  143: 'Philadelphia',  // PHI
  144: 'Atlanta',       // ATL
  145: 'Chicago',       // CWS
  146: 'Miami',         // MIA
  147: 'New York',      // NYY
  158: 'Milwaukee',     // MIL
};

// ─── MLB team short name (without city) lookup ────────────────────────────────
const TEAM_SHORT_NAMES: Record<number, string> = {
  108: 'Angels',
  109: 'Diamondbacks',
  110: 'Orioles',
  111: 'Red Sox',
  112: 'Cubs',
  113: 'Reds',
  114: 'Guardians',
  115: 'Rockies',
  116: 'Tigers',
  117: 'Astros',
  118: 'Royals',
  119: 'Dodgers',
  120: 'Nationals',
  121: 'Mets',
  133: 'Athletics',
  134: 'Pirates',
  135: 'Padres',
  136: 'Mariners',
  137: 'Giants',
  138: 'Cardinals',
  139: 'Rays',
  140: 'Rangers',
  141: 'Blue Jays',
  142: 'Twins',
  143: 'Phillies',
  144: 'Braves',
  145: 'White Sox',
  146: 'Marlins',
  147: 'Yankees',
  158: 'Brewers',
};

// ─── Pitcher stats fetcher ────────────────────────────────────────────────────

interface MLBPitcherStats {
  era: number;
  whip: number;
  hr9: number;
  hrFbRate: number;
  kPer9: number;
  bbPer9: number;
  fbPct: number;
  avgFastballVelo: number;
  gamesStarted: number;
  innings: number;
}

async function fetchPitcherStats(pitcherId: number, season: number): Promise<MLBPitcherStats | null> {
  if (!pitcherId || pitcherId <= 0) return null;
  try {
    const res = await fetchWithTimeout(
      `${MLB_API_BASE}/people/${pitcherId}?hydrate=stats(group=[pitching],type=[season,statSplits],season=${season})`,
      { cache: 'no-store', timeoutMs: 8000 }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const person = data?.people?.[0];
    if (!person) return null;

    const seasonStats = person.stats?.find(
      (s: { type?: { displayName?: string }; group?: { displayName?: string } }) =>
        s.type?.displayName === 'season' && s.group?.displayName === 'pitching'
    )?.splits?.[0]?.stat;

    if (!seasonStats) return null;

    const ip = parseFloat(seasonStats.inningsPitched ?? '0') || 0;
    const hr = parseInt(seasonStats.homeRuns ?? '0', 10) || 0;
    const hr9 = ip > 0 ? (hr / ip) * 9 : 1.2;
    const era = parseFloat(seasonStats.era ?? '4.50') || 4.5;
    const whip = parseFloat(seasonStats.whip ?? '1.30') || 1.3;
    const k = parseInt(seasonStats.strikeOuts ?? '0', 10) || 0;
    const bb = parseInt(seasonStats.baseOnBalls ?? '0', 10) || 0;
    const kPer9 = ip > 0 ? (k / ip) * 9 : 8.5;
    const bbPer9 = ip > 0 ? (bb / ip) * 9 : 3.0;
    const gs = parseInt(seasonStats.gamesStarted ?? '0', 10) || 0;

    return {
      era,
      whip,
      hr9: Math.round(hr9 * 100) / 100,
      hrFbRate: Math.min(0.25, hr9 / 9),
      kPer9: Math.round(kPer9 * 10) / 10,
      bbPer9: Math.round(bbPer9 * 10) / 10,
      fbPct: 42.0, // MLB Stats API doesn't expose FB% directly; use league avg
      avgFastballVelo: 93.5, // MLB Stats API doesn't expose velo directly; use league avg
      gamesStarted: gs,
      innings: ip,
    };
  } catch {
    return null;
  }
}

// ─── Batter season stats fetcher ─────────────────────────────────────────────

interface MLBBatterStats {
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  hr: number;
  rbi: number;
  games: number;
  iso: number;
  hrVsLeft: number;
  paVsLeft: number;
  hrVsRight: number;
  paVsRight: number;
  slgVsLeft: number;
  slgVsRight: number;
}

async function fetchBatterStats(batterId: number, season: number): Promise<MLBBatterStats | null> {
  if (!batterId || batterId <= 0) return null;
  try {
    const res = await fetchWithTimeout(
      `${MLB_API_BASE}/people/${batterId}?hydrate=stats(group=[hitting],type=[season,statSplits],season=${season},sitCodes=[vl,vr])`,
      { cache: 'no-store', timeoutMs: 8000 }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const person = data?.people?.[0];
    if (!person) return null;

    // Season totals
    const seasonSplit = person.stats?.find(
      (s: { type?: { displayName?: string }; group?: { displayName?: string } }) =>
        s.type?.displayName === 'season' && s.group?.displayName === 'hitting'
    )?.splits?.[0]?.stat;

    if (!seasonSplit) return null;

    const avg = parseFloat(seasonSplit.avg ?? '.000') || 0;
    const obp = parseFloat(seasonSplit.obp ?? '.000') || 0;
    const slg = parseFloat(seasonSplit.slg ?? '.000') || 0;
    const ops = parseFloat(seasonSplit.ops ?? '.000') || 0;
    const hr = parseInt(seasonSplit.homeRuns ?? '0', 10) || 0;
    const rbi = parseInt(seasonSplit.rbi ?? '0', 10) || 0;
    const games = parseInt(seasonSplit.gamesPlayed ?? '0', 10) || 0;
    const iso = Math.max(0, slg - avg);

    // vs LHP / vs RHP splits
    const splitStats = person.stats?.find(
      (s: { type?: { displayName?: string }; group?: { displayName?: string } }) =>
        s.type?.displayName === 'statSplits' && s.group?.displayName === 'hitting'
    )?.splits ?? [];

    let hrVsLeft = 0, paVsLeft = 0, slgVsLeft = 0;
    let hrVsRight = 0, paVsRight = 0, slgVsRight = 0;

    for (const split of splitStats) {
      const code = split?.split?.code;
      const st = split?.stat;
      if (!st) continue;
      if (code === 'vl') {
        hrVsLeft = parseInt(st.homeRuns ?? '0', 10) || 0;
        paVsLeft = parseInt(st.plateAppearances ?? '0', 10) || 0;
        slgVsLeft = parseFloat(st.slg ?? '.000') || 0;
      } else if (code === 'vr') {
        hrVsRight = parseInt(st.homeRuns ?? '0', 10) || 0;
        paVsRight = parseInt(st.plateAppearances ?? '0', 10) || 0;
        slgVsRight = parseFloat(st.slg ?? '.000') || 0;
      }
    }

    return { avg, obp, slg, ops, hr, rbi, games, iso, hrVsLeft, paVsLeft, hrVsRight, paVsRight, slgVsLeft, slgVsRight };
  } catch {
    return null;
  }
}

// ─── Batter recent form fetcher (game log) ────────────────────────────────────

interface BatterRecentForm {
  last7HR: number;
  last7OPS: number;
  last14HR: number;
  last14OPS: number;
  last30HR: number;
  last30OPS: number;
}

async function fetchBatterRecentForm(
  batterId: number,
  targetDate: string,
  season: number
): Promise<BatterRecentForm> {
  const defaultForm: BatterRecentForm = { last7HR: 0, last7OPS: 0, last14HR: 0, last14OPS: 0, last30HR: 0, last30OPS: 0 };
  if (!batterId || batterId <= 0) return defaultForm;
  try {
    const res = await fetchWithTimeout(
      `${MLB_API_BASE}/people/${batterId}/stats?stats=gameLog&group=hitting&season=${season}`,
      { cache: 'no-store', timeoutMs: 8000 }
    );
    if (!res.ok) return defaultForm;
    const data = await res.json();

    const splits: Array<{ date: string; stat: Record<string, string> }> =
      data?.stats?.[0]?.splits ?? [];

    if (splits.length === 0) return defaultForm;

    const [targetYear, targetMonth, targetDay] = normalizeTargetDate(targetDate).split('-').map(Number);
    const todayMs = Date.UTC(targetYear, targetMonth - 1, targetDay);

    let hr7 = 0, ab7 = 0, h7 = 0, bb7 = 0, hbp7 = 0, sf7 = 0, tb7 = 0;
    let hr14 = 0, ab14 = 0, h14 = 0, bb14 = 0, hbp14 = 0, sf14 = 0, tb14 = 0;
    let hr30 = 0, ab30 = 0, h30 = 0, bb30 = 0, hbp30 = 0, sf30 = 0, tb30 = 0;

    for (const split of splits) {
      // Game date format from MLB API: "2025-04-01"
      const gameDate = split?.date;
      if (!gameDate) continue;
      const [yyyy, mm, dd] = gameDate.split('-').map(Number);
      if (!yyyy || !mm || !dd) continue;
      const gameDateMs = Date.UTC(yyyy, mm - 1, dd);
      const daysAgo = (todayMs - gameDateMs) / (1000 * 60 * 60 * 24);

      // Only include completed games (not future)
      if (daysAgo < 0) continue;

      const st = split.stat;
      if (!st) continue;

      const hr = parseInt(st.homeRuns ?? '0', 10) || 0;
      const ab = parseInt(st.atBats ?? '0', 10) || 0;
      const h = parseInt(st.hits ?? '0', 10) || 0;
      const bb = parseInt(st.baseOnBalls ?? '0', 10) || 0;
      const hbp = parseInt(st.hitByPitch ?? '0', 10) || 0;
      const sf = parseInt(st.sacFlies ?? '0', 10) || 0;
      // Total bases: 1B + 2*2B + 3*3B + 4*HR
      const doubles = parseInt(st.doubles ?? '0', 10) || 0;
      const triples = parseInt(st.triples ?? '0', 10) || 0;
      const singles = h - doubles - triples - hr;
      const tb = singles + 2 * doubles + 3 * triples + 4 * hr;

      if (daysAgo <= 7) {
        hr7 += hr; ab7 += ab; h7 += h; bb7 += bb; hbp7 += hbp; sf7 += sf; tb7 += tb;
      }
      if (daysAgo <= 14) {
        hr14 += hr; ab14 += ab; h14 += h; bb14 += bb; hbp14 += hbp; sf14 += sf; tb14 += tb;
      }
      if (daysAgo <= 30) {
        hr30 += hr; ab30 += ab; h30 += h; bb30 += bb; hbp30 += hbp; sf30 += sf; tb30 += tb;
      }
    }

    const calcOPS = (ab: number, h: number, bb: number, hbp: number, sf: number, tb: number): number => {
      const pa = ab + bb + hbp + sf;
      if (pa === 0) return 0;
      const obp = (h + bb + hbp) / pa;
      const slg = ab > 0 ? tb / ab : 0;
      return Math.round((obp + slg) * 1000) / 1000;
    };

    return {
      last7HR: hr7,
      last7OPS: calcOPS(ab7, h7, bb7, hbp7, sf7, tb7),
      last14HR: hr14,
      last14OPS: calcOPS(ab14, h14, bb14, hbp14, sf14, tb14),
      last30HR: hr30,
      last30OPS: calcOPS(ab30, h30, bb30, hbp30, sf30, tb30),
    };
  } catch {
    return { last7HR: 0, last7OPS: 0, last14HR: 0, last14OPS: 0, last30HR: 0, last30OPS: 0 };
  }
}

// ─── Statcast leaderboard fetcher (Baseball Savant) ──────────────────────────

interface StatcastRow {
  barrelRate: number;
  exitVelocityAvg: number;
  launchAngleAvg: number;
  hardHitRate: number;
  xSlugging: number;
  xwOBA: number;
}

/**
 * Fetches the Baseball Savant Statcast leaderboard CSV for the current year
 * and returns a map of { [mlbPlayerId]: StatcastRow }.
 * Uses min=1 BBE so early-season players with few batted balls are included.
 * Falls back to an empty map on any error so the rest of the pipeline still works.
 */
async function fetchStatcastLeaderboard(season: number): Promise<Record<string, StatcastRow>> {
  const url =
    `https://baseballsavant.mlb.com/leaderboard/custom` +
    `?year=${season}&type=batter&filter=&sort=4&sortDir=desc&min=1` +
    `&selections=exit_velocity_avg,launch_angle_avg,sweet_spot_percent,barrel_batted_rate,hard_hit_percent,xslg,xwoba` +
    `&chart=false&csv=true`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MLBAnalytics/1.0)' },
      cache: 'no-store',
      timeoutMs: 15000,
    });
    if (!res.ok) return {};

    // Use arrayBuffer() + TextDecoder instead of res.text() to avoid the
    // Node.js TransformStream race condition (controller[kState].transformAlgorithm)
    const buffer = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    const lines = text.trim().split('\n');
    if (lines.length < 2) return {};

    // Parse CSV header to find column indices
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const idx = (name: string) => headers.indexOf(name);

    const playerIdIdx = idx('player_id');
    const evIdx = idx('exit_velocity_avg');
    const laIdx = idx('launch_angle_avg');
    const barrelIdx = idx('barrel_batted_rate');
    const hardHitIdx = idx('hard_hit_percent');
    const xslgIdx = idx('xslg');
    const xwobaIdx = idx('xwoba');

    if (playerIdIdx === -1) return {};

    const map: Record<string, StatcastRow> = {};

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const playerId = cols[playerIdIdx];
      if (!playerId) continue;

      const parseNum = (colIdx: number) => {
        if (colIdx === -1) return 0;
        const val = parseFloat(cols[colIdx] ?? '0');
        return isNaN(val) ? 0 : val;
      };

      map[playerId] = {
        barrelRate: parseNum(barrelIdx),
        exitVelocityAvg: parseNum(evIdx),
        launchAngleAvg: parseNum(laIdx),
        hardHitRate: parseNum(hardHitIdx),
        xSlugging: parseNum(xslgIdx),
        xwOBA: parseNum(xwobaIdx),
      };
    }

    return map;
  } catch {
    return {};
  }
}

// ─── Roster fetcher for games without confirmed lineups ───────────────────────

interface RosterPlayer {
  id: number;
  fullName: string;
  position: string;
  batSide: 'L' | 'R' | 'S';
}

async function fetchTeamRoster(teamId: number): Promise<RosterPlayer[]> {
  if (!teamId || teamId <= 0) return [];
  try {
    const res = await fetchWithTimeout(
      `${MLB_API_BASE}/teams/${teamId}/roster?rosterType=active&hydrate=person(batSide)`,
      { cache: 'no-store', timeoutMs: 8000 }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const roster: RosterPlayer[] = [];
    for (const entry of data?.roster ?? []) {
      const person = entry?.person;
      if (!person?.id || !person?.fullName) continue;
      const pos = entry?.position?.abbreviation ?? 'DH';
      // Exclude pitchers from HR predictions
      if (pos === 'P' || pos === 'SP' || pos === 'RP') continue;
      const batCode = person?.batSide?.code;
      const batSide: 'L' | 'R' | 'S' = batCode === 'L' ? 'L' : batCode === 'S' ? 'S' : 'R';
      roster.push({ id: person.id, fullName: person.fullName, position: pos, batSide });
    }
    return roster;
  } catch {
    return [];
  }
}

// ─── Main export: fetch all live data for today ───────────────────────────────

export interface LiveMLBData {
  batters: Record<string, Batter>;
  pitchers: Record<string, Pitcher>;
  games: Game[];
  ballparks: Record<string, Ballpark>;
  teams: Record<string, Team>;
}

export async function fetchLiveMLBData(targetDate?: string): Promise<LiveMLBData> {
  const batters: Record<string, Batter> = {};
  const pitchers: Record<string, Pitcher> = {};
  const games: Game[] = [];
  const ballparks: Record<string, Ballpark> = {};
  const teams: Record<string, Team> = {};
  const normalizedTargetDate = normalizeTargetDate(targetDate);
  const season = getSeasonFromDate(normalizedTargetDate);
  const allowRosterFallback = isTodayETDate(normalizedTargetDate);
  const allowLiveWeather = isTodayETDate(normalizedTargetDate);

  // 1. Fetch the target-date schedule AND season-aligned Statcast leaderboard in parallel
  let schedule: RealMLBGame[] = [];
  let statcastMap: Record<string, StatcastRow> = {};

  try {
    [schedule, statcastMap] = await Promise.all([
      fetchTodaysMLBSchedule(normalizedTargetDate),
      fetchStatcastLeaderboard(season),
    ]);
  } catch (err) {
    console.error('[liveMLBData] Schedule fetch failed:', err);
    return { batters, pitchers, games, ballparks, teams };
  }

  if (schedule.length === 0) {
    return { batters, pitchers, games, ballparks, teams };
  }

  // 2. Build teams + ballparks from schedule
  for (const g of schedule) {
    const awayId = String(g.awayTeamId);
    const homeId = String(g.homeTeamId);

    if (!teams[awayId]) {
      const awayCity = TEAM_CITIES[g.awayTeamId] ?? (g.awayTeamName.split(' ').slice(0, -1).join(' ') || g.awayTeamName);
      const awayShortName = TEAM_SHORT_NAMES[g.awayTeamId] ?? (g.awayTeamName.split(' ').slice(-1)[0] ?? g.awayTeamName);
      teams[awayId] = {
        id: awayId,
        name: awayShortName,
        abbreviation: g.awayTeamAbbr,
        city: awayCity,
        league: 'AL',
        division: 'East',
        record: g.awayTeamRecord,
        logoColor: TEAM_COLORS[g.awayTeamId] ?? '#64748b',
      };
    }
    if (!teams[homeId]) {
      const homeCity = TEAM_CITIES[g.homeTeamId] ?? (g.homeTeamName.split(' ').slice(0, -1).join(' ') || g.homeTeamName);
      const homeShortName = TEAM_SHORT_NAMES[g.homeTeamId] ?? (g.homeTeamName.split(' ').slice(-1)[0] ?? g.homeTeamName);
      teams[homeId] = {
        id: homeId,
        name: homeShortName,
        abbreviation: g.homeTeamAbbr,
        city: homeCity,
        league: 'AL',
        division: 'East',
        record: g.homeTeamRecord,
        logoColor: TEAM_COLORS[g.homeTeamId] ?? '#64748b',
      };
    }

    const parkId = String(g.venueId);
    if (!ballparks[parkId]) {
      const park = getParkData(g.venueId, g.venueName);
      ballparks[parkId] = {
        id: parkId,
        name: park.name,
        city: g.venueName,
        teamId: homeId,
        hrFactor: park.hrFactor,
        hrFactorTier: park.hrFactor >= 1.1 ? 'hitter' : park.hrFactor <= 0.92 ? 'pitcher' : 'neutral',
        elevation: park.elevation,
        dimensions: { leftField: 330, centerField: 400, rightField: 325 },
      };
    }
  }

  // 3. Fetch probable pitcher stats in parallel
  const pitcherFetchPromises: Promise<void>[] = [];
  const pitcherIdSet = new Set<number>();

  for (const g of schedule) {
    if (g.awayProbablePitcher?.id) pitcherIdSet.add(g.awayProbablePitcher.id);
    if (g.homeProbablePitcher?.id) pitcherIdSet.add(g.homeProbablePitcher.id);
  }

  for (const pid of pitcherIdSet) {
    pitcherFetchPromises.push(
      (async () => {
        const stats = await fetchPitcherStats(pid, season);
        // Find which game/team this pitcher belongs to
        const game = schedule.find(
          g => g.awayProbablePitcher?.id === pid || g.homeProbablePitcher?.id === pid
        );
        const isAway = game?.awayProbablePitcher?.id === pid;
        const teamId = isAway ? String(game?.awayTeamId ?? 0) : String(game?.homeTeamId ?? 0);
        const name = isAway
          ? (game?.awayProbablePitcher?.fullName ?? 'Unknown')
          : (game?.homeProbablePitcher?.fullName ?? 'Unknown');

        pitchers[String(pid)] = {
          id: String(pid),
          name,
          teamId,
          throws: 'R', // MLB Stats API doesn't return throws in this endpoint; default R, enriched below
          era: stats?.era ?? 4.50,
          whip: stats?.whip ?? 1.30,
          hr9: stats?.hr9 ?? 1.2,
          hrFbRate: stats?.hrFbRate ?? 0.12,
          kPer9: stats?.kPer9 ?? 8.5,
          bbPer9: stats?.bbPer9 ?? 3.0,
          fbPct: stats?.fbPct ?? 42.0,
          avgFastballVelo: stats?.avgFastballVelo ?? 93.5,
          season: {
            gamesStarted: stats?.gamesStarted ?? 0,
            innings: stats?.innings ?? 0,
            era: stats?.era ?? 4.50,
            hr9: stats?.hr9 ?? 1.2,
          },
          last7: { era: stats?.era ?? 4.50, hr9: stats?.hr9 ?? 1.2 },
        };
      })()
    );
  }

  // Enrich pitcher handedness
  pitcherFetchPromises.push(
    (async () => {
      if (pitcherIdSet.size === 0) return;
      try {
        const ids = Array.from(pitcherIdSet).join(',');
        const res = await fetchWithTimeout(`${MLB_API_BASE}/people?personIds=${ids}&hydrate=pitchHand`, {
          cache: 'no-store',
          timeoutMs: 8000,
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const p of data?.people ?? []) {
          const key = String(p?.id);
          if (pitchers[key] && p?.pitchHand?.code) {
            const code = p.pitchHand.code as 'L' | 'R';
            if (code === 'L' || code === 'R') {
              pitchers[key].throws = code;
            }
          }
        }
      } catch {
        // silently fail — handedness is supplemental
      }
    })()
  );

  await Promise.allSettled(pitcherFetchPromises);

  // 4. Fetch lineups for all games in parallel
  const lineupResults = await Promise.allSettled(
    schedule.map(g => fetchGameLineup(g.gamePk))
  );

  // 5. Build Game objects + collect all batter IDs
  const allBatterIds: Array<{ id: number; teamId: string; lineupSpot: number; batSide: 'L' | 'R' | 'S'; position: string; fullName: string; gamePk: number; lineupConfirmed: boolean }> = [];

  for (let i = 0; i < schedule.length; i++) {
    const g = schedule[i];
    const lineupResult = lineupResults[i];
    const lineup = lineupResult.status === 'fulfilled' ? lineupResult.value : null;

    const awayPitcherId = g.awayProbablePitcher?.id ? String(g.awayProbablePitcher.id) : '';
    const homePitcherId = g.homeProbablePitcher?.id ? String(g.homeProbablePitcher.id) : '';
    const parkId = String(g.venueId);

        const awayLineupConfirmed = lineup?.away?.status === 'confirmed';
    const homeLineupConfirmed = lineup?.home?.status === 'confirmed';
    const liveWeather = allowLiveWeather
      ? await fetchWeatherForTeamHomePark(String(g.homeTeamId))
      : null;

    const game: Game = {
      id: String(g.gamePk),
      date: g.gameDate.split('T')[0] ?? g.gameDate,
      time: g.gameTimeET,
      timeET: `${g.gameTimeET} ET`,
      status: g.status === 'scheduled' ? 'scheduled' : g.status,
      awayTeamId: String(g.awayTeamId),
      homeTeamId: String(g.homeTeamId),
      ballparkId: parkId,
      awayPitcherId,
      homePitcherId,
      tvNetwork: g.broadcasts.join(' / ') || 'TBD',
      weather: toGameWeather(liveWeather ?? getNeutralWeather()),
      lineupStatus: {
        away: awayLineupConfirmed
          ? 'confirmed'
          : lineup?.away?.status === 'projected'
            ? 'projected'
            : 'unknown',
        home: homeLineupConfirmed
          ? 'confirmed'
          : lineup?.home?.status === 'projected'
            ? 'projected'
            : 'unknown',
      },
      awayScore: g.awayScore,
      homeScore: g.homeScore,
      inning: g.inning,
    };
    games.push(game);

    // Collect batters from confirmed/projected lineup
    const awayPlayers = lineup?.away?.players ?? [];
    const homePlayers = lineup?.home?.players ?? [];

    for (const p of awayPlayers) {
      if (p.id > 0) {
        allBatterIds.push({
          id: p.id,
          teamId: String(g.awayTeamId),
          lineupSpot: p.battingOrder,
          batSide: p.batSide,
          position: p.position,
          fullName: p.fullName,
          gamePk: g.gamePk,
          lineupConfirmed: awayLineupConfirmed,
        });
      }
    }
    for (const p of homePlayers) {
      if (p.id > 0) {
        allBatterIds.push({
          id: p.id,
          teamId: String(g.homeTeamId),
          lineupSpot: p.battingOrder,
          batSide: p.batSide,
          position: p.position,
          fullName: p.fullName,
          gamePk: g.gamePk,
          lineupConfirmed: homeLineupConfirmed,
        });
      }
    }

    // If away lineup is not available, fall back to roster
    if (allowRosterFallback && awayPlayers.length === 0) {
      try {
        const roster = await fetchTeamRoster(g.awayTeamId);
        for (const p of roster) {
          allBatterIds.push({
            id: p.id,
            teamId: String(g.awayTeamId),
            lineupSpot: 0,
            batSide: p.batSide,
            position: p.position,
            fullName: p.fullName,
            gamePk: g.gamePk,
            lineupConfirmed: false,
          });
        }
      } catch {
        // silently fail — roster is supplemental
      }
    }

    // If home lineup is not available, fall back to roster
    if (allowRosterFallback && homePlayers.length === 0) {
      try {
        const roster = await fetchTeamRoster(g.homeTeamId);
        for (const p of roster) {
          allBatterIds.push({
            id: p.id,
            teamId: String(g.homeTeamId),
            lineupSpot: 0,
            batSide: p.batSide,
            position: p.position,
            fullName: p.fullName,
            gamePk: g.gamePk,
            lineupConfirmed: false,
          });
        }
      } catch {
        // silently fail — roster is supplemental
      }
    }
  }

  // 6. Fetch batter stats in parallel (batch to avoid rate limits)
  const BATCH_SIZE = 10;
  for (let i = 0; i < allBatterIds.length; i += BATCH_SIZE) {
    const batch = allBatterIds.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (b) => {
        const [stats, recentForm] = await Promise.all([
          fetchBatterStats(b.id, season),
          fetchBatterRecentForm(b.id, normalizedTargetDate, season),
        ]);
        const batterId = String(b.id);
        const sc = statcastMap[batterId];

        batters[batterId] = {
          id: batterId,
          name: b.fullName,
          teamId: b.teamId,
          position: b.position,
          bats: b.batSide,
          lineupSpot: b.lineupSpot > 0 ? b.lineupSpot : null,
          jerseyNumber: 0,
          age: 0,
          lineupConfirmed: b.lineupConfirmed,
          season: {
            avg: stats?.avg ?? 0,
            obp: stats?.obp ?? 0,
            slg: stats?.slg ?? 0,
            ops: stats?.ops ?? 0,
            hr: stats?.hr ?? 0,
            rbi: stats?.rbi ?? 0,
            games: stats?.games ?? 0,
            iso: stats?.iso ?? 0,
          },
          statcast: {
            barrelRate: sc?.barrelRate ?? 0,
            exitVelocityAvg: sc?.exitVelocityAvg ?? 0,
            launchAngleAvg: sc?.launchAngleAvg ?? 0,
            hardHitRate: sc?.hardHitRate ?? 0,
            xSlugging: sc?.xSlugging ?? 0,
            xwOBA: sc?.xwOBA ?? 0,
            sweetSpotPct: 0,
            pullRate: 0,
            flyBallRate: 0,
            hrFbRate: 0,
          },
          splits: {
            vsLeft: {
              avg: 0,
              obp: 0,
              slg: stats?.slgVsLeft ?? 0,
              hr: stats?.hrVsLeft ?? 0,
              pa: stats?.paVsLeft ?? 0,
            },
            vsRight: {
              avg: 0,
              obp: 0,
              slg: stats?.slgVsRight ?? 0,
              hr: stats?.hrVsRight ?? 0,
              pa: stats?.paVsRight ?? 0,
            },
          },
          last7: { avg: 0, hr: recentForm.last7HR, ops: recentForm.last7OPS },
          last14: { avg: 0, hr: recentForm.last14HR, ops: recentForm.last14OPS },
          last30: { avg: 0, hr: recentForm.last30HR, ops: recentForm.last30OPS },
          recentGameLog: [],
        };
      })
    );
  }

  return { batters, pitchers, games, ballparks, teams };
}
