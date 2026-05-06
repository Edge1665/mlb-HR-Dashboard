export type GameStatus = 'scheduled' | 'lineup_confirmed' | 'in_progress' | 'final' | 'delayed';

import type { PitchGroup } from '@/services/pitchMixTaxonomy';

export type ConfidenceTier = 'elite' | 'high' | 'medium' | 'low';

export type PlatoonAdvantage = 'strong' | 'moderate' | 'neutral' | 'disadvantage';

export type WindDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  city: string;
  league: 'AL' | 'NL';
  division: 'East' | 'Central' | 'West';
  record: { wins: number; losses: number };
  logoColor: string;
}

export interface Ballpark {
  id: string;
  name: string;
  city: string;
  teamId: string;
  hrFactor: number;
  hrFactorVsLeft?: number;
  hrFactorVsRight?: number;
  hrFactorTier: 'hitter' | 'neutral' | 'pitcher';
  elevation: number;
  dimensions: { leftField: number; centerField: number; rightField: number };
  dimensionContext?: {
    leftFieldLine?: number;
    leftCenterGap?: number;
    centerField?: number;
    rightCenterGap?: number;
    rightFieldLine?: number;
    averageFenceDistance?: number;
    fenceDistanceIndex?: number;
    estimatedHrFriendlyCarry?: number;
  };
  parkComps?: {
    estimatedHrParksForTypical400FtFly?: number;
    source?: string;
    isPlaceholder?: boolean;
  };
}

export interface Pitcher {
  id: string;
  name: string;
  teamId: string;
  throws: 'L' | 'R';
  era: number;
  whip: number;
  hr9: number;
  hrFbRate: number;
  kPer9: number;
  bbPer9: number;
  fbPct: number;
  avgFastballVelo: number;
  season: {
    gamesStarted: number;
    innings: number;
    era: number;
    hr9: number;
  };
  last7: {
    era: number;
    hr9: number;
  };
  pitchMix?: Partial<Record<PitchGroup, number>>;
  handednessHrAllowed?: {
    vsLeftHr9?: number;
    vsRightHr9?: number;
    source?: string;
    isPlaceholder?: boolean;
  };
}

export interface BatterStatcast {
  barrelRate: number;
  exitVelocityAvg: number;
  launchAngleAvg: number;
  hardHitRate: number;
  xSlugging: number;
  xwOBA: number;
  sweetSpotPct: number;
  pullRate: number;
  flyBallRate: number;
  hrFbRate: number;
}

export interface BatterSplits {
  vsLeft: { avg: number; obp: number; slg: number; hr: number; pa: number };
  vsRight: { avg: number; obp: number; slg: number; hr: number; pa: number };
}

export interface Batter {
  id: string;
  name: string;
  teamId: string;
  gameId?: string | null;
  position: string;
  bats: 'L' | 'R' | 'S';
  lineupSpot: number | null;
  jerseyNumber: number;
  age: number;
  lineupConfirmed?: boolean;
  season: {
    avg: number;
    obp: number;
    slg: number;
    ops: number;
    hr: number;
    rbi: number;
    games: number;
    iso: number;
  };
  statcast: BatterStatcast;
  splits: BatterSplits;
  last7: { avg: number; hr: number; ops: number };
  last14: { avg: number; hr: number; ops: number };
  last30: { avg: number; hr: number; ops: number };
  recentGameLog: GameLogEntry[];
  pitchTypeSkill?: Partial<Record<PitchGroup, number>>;
}

export interface GameLogEntry {
  date: string;
  opponent: string;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  ops: number;
}

export interface Weather {
  temp: number;
  feelsLike: number;
  condition: string;
  windSpeed: number;
  windDirection: WindDirection;
  windToward: 'in' | 'out' | 'crosswind' | 'neutral';
  windOutToCenter?: number;
  windInFromCenter?: number;
  crosswind?: number;
  precipitation: number;
  humidity: number;
  visibility: number;
  densityAltitude?: number;
  airDensityProxy?: number;
  hrImpact: 'positive' | 'neutral' | 'negative';
  hrImpactScore: number;
}

export interface Game {
  id: string;
  date: string;
  time: string;
  timeET: string;
  status: GameStatus;
  awayTeamId: string;
  homeTeamId: string;
  ballparkId: string;
  awayPitcherId: string;
  homePitcherId: string;
  tvNetwork: string;
  weather: Weather;
  lineupStatus: {
    away: 'confirmed' | 'projected' | 'unknown';
    home: 'confirmed' | 'projected' | 'unknown';
  };
  awayScore?: number;
  homeScore?: number;
  inning?: number;
  teamOffense?: {
    away?: {
      teamSeasonHR?: number;
      teamGames?: number;
      teamOPS?: number;
    };
    home?: {
      teamSeasonHR?: number;
      teamGames?: number;
      teamOPS?: number;
    };
  };
}

export interface HRProjection {
  id: string;
  batterId: string;
  gameId: string;
  opposingPitcherId: string;
  ballparkId: string;
  hrProbability: number;
  confidenceTier: ConfidenceTier;
  platoonAdvantage: PlatoonAdvantage;
  parkFactorBoost: number;
  weatherImpact: number;
  formMultiplier: number;
  matchupScore: number;
  projectedAtBats: number;
  keyFactors: string[];
  rank: number;
  lineupConfirmed?: boolean;
  explanation?: string;
  geminiProbability?: number;

  /**
   * Advisory-only probability after bounded Gemini adjustment.
   * Never replace hrProbability with this.
   */
  adjustedProbability?: number;

  /**
   * Backwards-compatible alias for existing UI.
   */
  blendedProbability?: number;

  geminiAdjustmentApplied?: number;
  geminiReasoning?: string;
  geminiKeyInsight?: string;
  geminiConfidence?: 'high' | 'medium' | 'low';
  geminiDisagreementTier?: 'aligned' | 'mixed' | 'high';
}

export interface PitchTypeVulnerability {
  pitchType: string;
  avgExitVelo: number;
  hrRate: number;
  whiffRate: number;
  baValue: number;
}
