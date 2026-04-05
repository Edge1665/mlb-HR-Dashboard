// MLB Stats API response types

export interface MLBScheduleResponse {
  copyright?: string;
  totalItems?: number;
  totalEvents?: number;
  totalGames?: number;
  totalGamesInProgress?: number;
  dates?: MLBDateEntry[];
}

export interface MLBDateEntry {
  date?: string;
  totalItems?: number;
  totalEvents?: number;
  totalGames?: number;
  totalGamesInProgress?: number;
  games?: MLBGameData[];
}

export interface MLBGameData {
  gamePk: number;
  gameGuid?: string;
  link?: string;
  gameType?: string;
  season?: string;
  gameDate: string;
  officialDate?: string;
  status?: {
    abstractGameState?: string;
    codedGameState?: string;
    detailedState?: string;
    statusCode?: string;
    startTimeTBD?: boolean;
    abstractGameCode?: string;
  };
  teams?: {
    away?: MLBTeamEntry;
    home?: MLBTeamEntry;
  };
  venue?: {
    id?: number;
    name?: string;
    link?: string;
  };
  broadcasts?: MLBBroadcast[];
  linescore?: {
    currentInning?: number;
    currentInningOrdinal?: string;
    inningState?: string;
    inningHalf?: string;
    isTopInning?: boolean;
    scheduledInnings?: number;
    innings?: MLBInning[];
    teams?: {
      home?: { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
      away?: { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
    };
  };
  decisions?: {
    winner?: { id?: number; fullName?: string };
    loser?: { id?: number; fullName?: string };
    save?: { id?: number; fullName?: string };
  };
  content?: { link?: string };
  isTie?: boolean;
  gameNumber?: number;
  publicFacing?: boolean;
  doubleHeader?: string;
  gamedayType?: string;
  tiebreaker?: string;
  calendarEventID?: string;
  seasonDisplay?: string;
  dayNight?: string;
  scheduledInnings?: number;
  reverseHomeAwayStatus?: boolean;
  inningBreakLength?: number;
  gamesInSeries?: number;
  seriesGameNumber?: number;
  seriesDescription?: string;
  recordSource?: string;
  ifNecessary?: string;
  ifNecessaryDescription?: string;
}

export interface MLBTeamEntry {
  leagueRecord?: {
    wins?: number;
    losses?: number;
    pct?: string;
  };
  score?: number;
  team?: {
    id?: number;
    name?: string;
    link?: string;
    abbreviation?: string;
    teamName?: string;
    locationName?: string;
    shortName?: string;
    franchiseName?: string;
    clubName?: string;
    league?: { id?: number; name?: string };
    division?: { id?: number; name?: string };
    sport?: { id?: number; name?: string };
    venue?: { id?: number; name?: string };
  };
  isWinner?: boolean;
  splitSquad?: boolean;
  seriesNumber?: number;
  probablePitcher?: {
    id: number;
    fullName: string;
    link?: string;
  };
}

export interface MLBBroadcast {
  id?: number;
  name?: string;
  type?: string;
  shortName?: string;
  homeAway?: string;
  language?: string;
  isNational?: boolean;
}

export interface MLBInning {
  num?: number;
  ordinalNum?: string;
  home?: { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
  away?: { runs?: number; hits?: number; errors?: number; leftOnBase?: number };
}
