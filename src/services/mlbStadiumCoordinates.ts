export interface StadiumCoordinates {
  lat: number;
  lon: number;
  city: string;
  state?: string;
  name: string;
}

// Keys are MLB team IDs as strings.
// We use team ID because your game objects already have awayTeamId/homeTeamId.
// These coordinates are approximate ballpark locations.
export const MLB_STADIUM_COORDINATES: Record<string, StadiumCoordinates> = {
  '108': { name: 'Angel Stadium', city: 'Anaheim', state: 'CA', lat: 33.8003, lon: -117.8827 },
  '109': { name: 'Chase Field', city: 'Phoenix', state: 'AZ', lat: 33.4453, lon: -112.0667 },
  '110': { name: 'Oriole Park at Camden Yards', city: 'Baltimore', state: 'MD', lat: 39.2839, lon: -76.6217 },
  '111': { name: 'Fenway Park', city: 'Boston', state: 'MA', lat: 42.3467, lon: -71.0972 },
  '112': { name: 'Wrigley Field', city: 'Chicago', state: 'IL', lat: 41.9484, lon: -87.6553 },
  '113': { name: 'Great American Ball Park', city: 'Cincinnati', state: 'OH', lat: 39.0979, lon: -84.5073 },
  '114': { name: 'Progressive Field', city: 'Cleveland', state: 'OH', lat: 41.4962, lon: -81.6852 },
  '115': { name: 'Coors Field', city: 'Denver', state: 'CO', lat: 39.7561, lon: -104.9942 },
  '116': { name: 'Comerica Park', city: 'Detroit', state: 'MI', lat: 42.3390, lon: -83.0485 },
  '117': { name: 'Minute Maid Park', city: 'Houston', state: 'TX', lat: 29.7573, lon: -95.3555 },
  '118': { name: 'Kauffman Stadium', city: 'Kansas City', state: 'MO', lat: 39.0517, lon: -94.4803 },
  '119': { name: 'Dodger Stadium', city: 'Los Angeles', state: 'CA', lat: 34.0739, lon: -118.2400 },
  '120': { name: 'Nationals Park', city: 'Washington', state: 'DC', lat: 38.8730, lon: -77.0074 },
  '121': { name: 'Citi Field', city: 'Queens', state: 'NY', lat: 40.7571, lon: -73.8458 },
  '133': { name: 'Oakland Coliseum', city: 'Oakland', state: 'CA', lat: 37.7516, lon: -122.2005 },
  '134': { name: 'Truist Park', city: 'Atlanta', state: 'GA', lat: 33.8908, lon: -84.4677 },
  '135': { name: 'T-Mobile Park', city: 'Seattle', state: 'WA', lat: 47.5914, lon: -122.3325 },
  '136': { name: 'Oracle Park', city: 'San Francisco', state: 'CA', lat: 37.7786, lon: -122.3893 },
  '137': { name: 'Busch Stadium', city: 'St. Louis', state: 'MO', lat: 38.6226, lon: -90.1928 },
  '138': { name: 'Tropicana Field', city: 'St. Petersburg', state: 'FL', lat: 27.7683, lon: -82.6534 },
  '139': { name: 'Globe Life Field', city: 'Arlington', state: 'TX', lat: 32.7473, lon: -97.0847 },
  '140': { name: 'Rogers Centre', city: 'Toronto', state: 'ON', lat: 43.6414, lon: -79.3894 },
  '141': { name: 'Target Field', city: 'Minneapolis', state: 'MN', lat: 44.9817, lon: -93.2778 },
  '142': { name: 'Guaranteed Rate Field', city: 'Chicago', state: 'IL', lat: 41.8300, lon: -87.6338 },
  '143': { name: 'Citizens Bank Park', city: 'Philadelphia', state: 'PA', lat: 39.9061, lon: -75.1665 },
  '144': { name: 'PNC Park', city: 'Pittsburgh', state: 'PA', lat: 40.4469, lon: -80.0057 },
  '145': { name: 'Petco Park', city: 'San Diego', state: 'CA', lat: 32.7073, lon: -117.1566 },
  '146': { name: 'loanDepot park', city: 'Miami', state: 'FL', lat: 25.7781, lon: -80.2207 },
  '147': { name: 'Yankee Stadium', city: 'Bronx', state: 'NY', lat: 40.8296, lon: -73.9262 },
  '158': { name: 'American Family Field', city: 'Milwaukee', state: 'WI', lat: 43.0280, lon: -87.9712 },
};