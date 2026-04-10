export interface MlbTeamMeta {
  id: string;
  abbr: string;
  fullName: string;
}

export const MLB_TEAM_METADATA: Record<string, MlbTeamMeta> = {
  '108': { id: '108', abbr: 'LAA', fullName: 'Los Angeles Angels' },
  '109': { id: '109', abbr: 'AZ', fullName: 'Arizona Diamondbacks' },
  '110': { id: '110', abbr: 'BAL', fullName: 'Baltimore Orioles' },
  '111': { id: '111', abbr: 'BOS', fullName: 'Boston Red Sox' },
  '112': { id: '112', abbr: 'CHC', fullName: 'Chicago Cubs' },
  '113': { id: '113', abbr: 'CIN', fullName: 'Cincinnati Reds' },
  '114': { id: '114', abbr: 'CLE', fullName: 'Cleveland Guardians' },
  '115': { id: '115', abbr: 'COL', fullName: 'Colorado Rockies' },
  '116': { id: '116', abbr: 'DET', fullName: 'Detroit Tigers' },
  '117': { id: '117', abbr: 'HOU', fullName: 'Houston Astros' },
  '118': { id: '118', abbr: 'KC', fullName: 'Kansas City Royals' },
  '119': { id: '119', abbr: 'LAD', fullName: 'Los Angeles Dodgers' },
  '120': { id: '120', abbr: 'WSH', fullName: 'Washington Nationals' },
  '121': { id: '121', abbr: 'NYM', fullName: 'New York Mets' },
  '133': { id: '133', abbr: 'ATH', fullName: 'Athletics' },
  '134': { id: '134', abbr: 'PIT', fullName: 'Pittsburgh Pirates' },
  '135': { id: '135', abbr: 'SD', fullName: 'San Diego Padres' },
  '136': { id: '136', abbr: 'SEA', fullName: 'Seattle Mariners' },
  '137': { id: '137', abbr: 'SF', fullName: 'San Francisco Giants' },
  '138': { id: '138', abbr: 'STL', fullName: 'St. Louis Cardinals' },
  '139': { id: '139', abbr: 'TB', fullName: 'Tampa Bay Rays' },
  '140': { id: '140', abbr: 'TEX', fullName: 'Texas Rangers' },
  '141': { id: '141', abbr: 'TOR', fullName: 'Toronto Blue Jays' },
  '142': { id: '142', abbr: 'MIN', fullName: 'Minnesota Twins' },
  '143': { id: '143', abbr: 'PHI', fullName: 'Philadelphia Phillies' },
  '144': { id: '144', abbr: 'ATL', fullName: 'Atlanta Braves' },
  '145': { id: '145', abbr: 'CWS', fullName: 'Chicago White Sox' },
  '146': { id: '146', abbr: 'MIA', fullName: 'Miami Marlins' },
  '147': { id: '147', abbr: 'NYY', fullName: 'New York Yankees' },
  '158': { id: '158', abbr: 'MIL', fullName: 'Milwaukee Brewers' },
};

export function getTeamAbbreviation(teamId: string): string {
  return MLB_TEAM_METADATA[teamId]?.abbr ?? teamId;
}

export function getTeamFullName(teamId: string): string {
  return MLB_TEAM_METADATA[teamId]?.fullName ?? teamId;
}