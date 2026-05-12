export interface StadiumCoordinates {
  lat: number;
  lon: number;
  city: string;
  state?: string;
  name: string;
  centerFieldBearingDeg?: number;
}

const ANGEL_STADIUM: StadiumCoordinates = {
  name: 'Angel Stadium',
  city: 'Anaheim',
  state: 'CA',
  lat: 33.8003,
  lon: -117.8827,
  centerFieldBearingDeg: 20,
};
const CHASE_FIELD: StadiumCoordinates = {
  name: 'Chase Field',
  city: 'Phoenix',
  state: 'AZ',
  lat: 33.4453,
  lon: -112.0667,
  centerFieldBearingDeg: 22,
};
const CAMDEN_YARDS: StadiumCoordinates = {
  name: 'Oriole Park at Camden Yards',
  city: 'Baltimore',
  state: 'MD',
  lat: 39.2839,
  lon: -76.6217,
  centerFieldBearingDeg: 32,
};
const FENWAY_PARK: StadiumCoordinates = {
  name: 'Fenway Park',
  city: 'Boston',
  state: 'MA',
  lat: 42.3467,
  lon: -71.0972,
  centerFieldBearingDeg: 40,
};
const WRIGLEY_FIELD: StadiumCoordinates = {
  name: 'Wrigley Field',
  city: 'Chicago',
  state: 'IL',
  lat: 41.9484,
  lon: -87.6553,
  centerFieldBearingDeg: 25,
};
const GREAT_AMERICAN_BALL_PARK: StadiumCoordinates = {
  name: 'Great American Ball Park',
  city: 'Cincinnati',
  state: 'OH',
  lat: 39.0979,
  lon: -84.5073,
  centerFieldBearingDeg: 28,
};
const PROGRESSIVE_FIELD: StadiumCoordinates = {
  name: 'Progressive Field',
  city: 'Cleveland',
  state: 'OH',
  lat: 41.4962,
  lon: -81.6852,
  centerFieldBearingDeg: 30,
};
const COORS_FIELD: StadiumCoordinates = {
  name: 'Coors Field',
  city: 'Denver',
  state: 'CO',
  lat: 39.7561,
  lon: -104.9942,
  centerFieldBearingDeg: 24,
};
const COMERICA_PARK: StadiumCoordinates = {
  name: 'Comerica Park',
  city: 'Detroit',
  state: 'MI',
  lat: 42.339,
  lon: -83.0485,
  centerFieldBearingDeg: 22,
};
const MINUTE_MAID_PARK: StadiumCoordinates = {
  name: 'Minute Maid Park',
  city: 'Houston',
  state: 'TX',
  lat: 29.7573,
  lon: -95.3555,
  centerFieldBearingDeg: 24,
};
const KAUFFMAN_STADIUM: StadiumCoordinates = {
  name: 'Kauffman Stadium',
  city: 'Kansas City',
  state: 'MO',
  lat: 39.0517,
  lon: -94.4803,
  centerFieldBearingDeg: 20,
};
const DODGER_STADIUM: StadiumCoordinates = {
  name: 'Dodger Stadium',
  city: 'Los Angeles',
  state: 'CA',
  lat: 34.0739,
  lon: -118.24,
  centerFieldBearingDeg: 30,
};
const NATIONALS_PARK: StadiumCoordinates = {
  name: 'Nationals Park',
  city: 'Washington',
  state: 'DC',
  lat: 38.873,
  lon: -77.0074,
  centerFieldBearingDeg: 24,
};
const CITI_FIELD: StadiumCoordinates = {
  name: 'Citi Field',
  city: 'Queens',
  state: 'NY',
  lat: 40.7571,
  lon: -73.8458,
  centerFieldBearingDeg: 30,
};
const OAKLAND_COLISEUM: StadiumCoordinates = {
  name: 'Oakland Coliseum',
  city: 'Oakland',
  state: 'CA',
  lat: 37.7516,
  lon: -122.2005,
  centerFieldBearingDeg: 30,
};
const SUTTER_HEALTH_PARK: StadiumCoordinates = {
  name: 'Sutter Health Park',
  city: 'West Sacramento',
  state: 'CA',
  lat: 38.5806,
  lon: -121.5131,
  centerFieldBearingDeg: 20,
};
const PNC_PARK: StadiumCoordinates = {
  name: 'PNC Park',
  city: 'Pittsburgh',
  state: 'PA',
  lat: 40.4469,
  lon: -80.0057,
  centerFieldBearingDeg: 32,
};
const PETCO_PARK: StadiumCoordinates = {
  name: 'Petco Park',
  city: 'San Diego',
  state: 'CA',
  lat: 32.7073,
  lon: -117.1566,
  centerFieldBearingDeg: 32,
};
const T_MOBILE_PARK: StadiumCoordinates = {
  name: 'T-Mobile Park',
  city: 'Seattle',
  state: 'WA',
  lat: 47.5914,
  lon: -122.3325,
  centerFieldBearingDeg: 20,
};
const ORACLE_PARK: StadiumCoordinates = {
  name: 'Oracle Park',
  city: 'San Francisco',
  state: 'CA',
  lat: 37.7786,
  lon: -122.3893,
  centerFieldBearingDeg: 40,
};
const BUSCH_STADIUM: StadiumCoordinates = {
  name: 'Busch Stadium',
  city: 'St. Louis',
  state: 'MO',
  lat: 38.6226,
  lon: -90.1928,
  centerFieldBearingDeg: 24,
};
const TROPICANA_FIELD: StadiumCoordinates = {
  name: 'Tropicana Field',
  city: 'St. Petersburg',
  state: 'FL',
  lat: 27.7683,
  lon: -82.6534,
  centerFieldBearingDeg: 24,
};
const GLOBE_LIFE_FIELD: StadiumCoordinates = {
  name: 'Globe Life Field',
  city: 'Arlington',
  state: 'TX',
  lat: 32.7473,
  lon: -97.0847,
  centerFieldBearingDeg: 22,
};
const ROGERS_CENTRE: StadiumCoordinates = {
  name: 'Rogers Centre',
  city: 'Toronto',
  state: 'ON',
  lat: 43.6414,
  lon: -79.3894,
  centerFieldBearingDeg: 30,
};
const TARGET_FIELD: StadiumCoordinates = {
  name: 'Target Field',
  city: 'Minneapolis',
  state: 'MN',
  lat: 44.9817,
  lon: -93.2778,
  centerFieldBearingDeg: 20,
};
const GUARANTEED_RATE_FIELD: StadiumCoordinates = {
  name: 'Guaranteed Rate Field',
  city: 'Chicago',
  state: 'IL',
  lat: 41.83,
  lon: -87.6338,
  centerFieldBearingDeg: 26,
};
const CITIZENS_BANK_PARK: StadiumCoordinates = {
  name: 'Citizens Bank Park',
  city: 'Philadelphia',
  state: 'PA',
  lat: 39.9061,
  lon: -75.1665,
  centerFieldBearingDeg: 28,
};
const TRUIST_PARK: StadiumCoordinates = {
  name: 'Truist Park',
  city: 'Atlanta',
  state: 'GA',
  lat: 33.8908,
  lon: -84.4677,
  centerFieldBearingDeg: 28,
};
const LOANDEPOT_PARK: StadiumCoordinates = {
  name: 'loanDepot park',
  city: 'Miami',
  state: 'FL',
  lat: 25.7781,
  lon: -80.2207,
  centerFieldBearingDeg: 24,
};
const YANKEE_STADIUM: StadiumCoordinates = {
  name: 'Yankee Stadium',
  city: 'Bronx',
  state: 'NY',
  lat: 40.8296,
  lon: -73.9262,
  centerFieldBearingDeg: 28,
};
const AMERICAN_FAMILY_FIELD: StadiumCoordinates = {
  name: 'American Family Field',
  city: 'Milwaukee',
  state: 'WI',
  lat: 43.028,
  lon: -87.9712,
  centerFieldBearingDeg: 26,
};

export const MLB_STADIUM_COORDINATES_BY_TEAM_ID: Record<string, StadiumCoordinates> = {
  '108': ANGEL_STADIUM,
  '109': CHASE_FIELD,
  '110': CAMDEN_YARDS,
  '111': FENWAY_PARK,
  '112': WRIGLEY_FIELD,
  '113': GREAT_AMERICAN_BALL_PARK,
  '114': PROGRESSIVE_FIELD,
  '115': COORS_FIELD,
  '116': COMERICA_PARK,
  '117': MINUTE_MAID_PARK,
  '118': KAUFFMAN_STADIUM,
  '119': DODGER_STADIUM,
  '120': NATIONALS_PARK,
  '121': CITI_FIELD,
  '133': SUTTER_HEALTH_PARK,
  '134': PNC_PARK,
  '135': PETCO_PARK,
  '136': T_MOBILE_PARK,
  '137': ORACLE_PARK,
  '138': BUSCH_STADIUM,
  '139': TROPICANA_FIELD,
  '140': GLOBE_LIFE_FIELD,
  '141': ROGERS_CENTRE,
  '142': TARGET_FIELD,
  '143': CITIZENS_BANK_PARK,
  '144': TRUIST_PARK,
  '145': GUARANTEED_RATE_FIELD,
  '146': LOANDEPOT_PARK,
  '147': YANKEE_STADIUM,
  '158': AMERICAN_FAMILY_FIELD,
};

export const MLB_STADIUM_COORDINATES_BY_VENUE_ID: Record<string, StadiumCoordinates> = {
  '1': TARGET_FIELD,
  '2': TROPICANA_FIELD,
  '3': WRIGLEY_FIELD,
  '4': GUARANTEED_RATE_FIELD,
  '15': GREAT_AMERICAN_BALL_PARK,
  '17': WRIGLEY_FIELD,
  '19': COORS_FIELD,
  '22': TARGET_FIELD,
  '26': GLOBE_LIFE_FIELD,
  '27': ORACLE_PARK,
  '28': DODGER_STADIUM,
  '29': T_MOBILE_PARK,
  '30': MINUTE_MAID_PARK,
  '31': CITIZENS_BANK_PARK,
  '32': TRUIST_PARK,
  '34': FENWAY_PARK,
  '36': YANKEE_STADIUM,
  '680': OAKLAND_COLISEUM,
  '2392': LOANDEPOT_PARK,
  '2395': CHASE_FIELD,
  '2500': SUTTER_HEALTH_PARK,
  '2681': WRIGLEY_FIELD,
  '2889': CITI_FIELD,
  '3289': NATIONALS_PARK,
  '3309': CAMDEN_YARDS,
  '3312': PNC_PARK,
  '4169': PETCO_PARK,
  '4705': AMERICAN_FAMILY_FIELD,
  '5000': SUTTER_HEALTH_PARK,
  '5325': BUSCH_STADIUM,
  '5380': PROGRESSIVE_FIELD,
};

export const MLB_STADIUM_COORDINATES = MLB_STADIUM_COORDINATES_BY_TEAM_ID;
