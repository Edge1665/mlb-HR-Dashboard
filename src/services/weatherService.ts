// National Weather Service (NWS) API — no API key required
// Docs: https://www.weather.gov/documentation/services-web-api

export interface GameWeather {
  tempF: number;
  condition: string;
  windSpeedMph: number;
  windDirection: string;
  unavailable?: false;
}

export interface GameWeatherUnavailable {
  unavailable: true;
}

export type WeatherResult = GameWeather | GameWeatherUnavailable;

// ─── Stadium coordinates (lat, lon) ──────────────────────────────────────────
// Keyed by MLB venue ID (from MLB Stats API) with fallback by team abbreviation
const STADIUM_COORDS: Record<number, { lat: number; lon: number; name: string }> = {
  // AL East
  3313: { lat: 40.8296, lon: -73.9262, name: 'Yankee Stadium' },
  3: { lat: 42.3467, lon: -71.0972, name: 'Fenway Park' },
  2394: { lat: 43.6414, lon: -79.3894, name: 'Rogers Centre' },
  2: { lat: 39.2838, lon: -76.6218, name: 'Oriole Park at Camden Yards' },
  12: { lat: 27.7682, lon: -82.6534, name: 'Tropicana Field' },
  // AL Central
  5: { lat: 41.4962, lon: -81.6852, name: 'Progressive Field' },
  4: { lat: 42.3390, lon: -83.0485, name: 'Comerica Park' },
  7: { lat: 37.9261, lon: -91.9500, name: 'Kauffman Stadium' },
  680: { lat: 44.9817, lon: -93.2778, name: 'Target Field' },
  4321: { lat: 41.8299, lon: -87.6338, name: 'Guaranteed Rate Field' },
  // AL West
  1: { lat: 47.5914, lon: -122.3325, name: 'T-Mobile Park' },
  10: { lat: 37.7516, lon: -122.2005, name: 'Oakland Coliseum' },
  14: { lat: 33.8003, lon: -117.8827, name: 'Angel Stadium' },
  13: { lat: 32.7073, lon: -117.1566, name: 'Petco Park' },
  28: { lat: 29.7573, lon: -95.3555, name: 'Minute Maid Park' },
  // NL East
  3289: { lat: 33.8907, lon: -84.4677, name: 'Truist Park' },
  3722: { lat: 25.7781, lon: -80.2197, name: 'loanDepot park' },
  3168: { lat: 40.7571, lon: -73.8458, name: 'Citi Field' },
  2681: { lat: 40.0023, lon: -75.1659, name: 'Citizens Bank Park' },
  3309: { lat: 38.8730, lon: -77.0074, name: 'Nationals Park' },
  // NL Central
  17: { lat: 41.9484, lon: -87.6553, name: 'Wrigley Field' },
  2602: { lat: 39.0979, lon: -84.5082, name: 'Great American Ball Park' },
  32: { lat: 45.0169, lon: -93.2778, name: 'American Family Field' },
  31: { lat: 40.4469, lon: -80.0057, name: 'PNC Park' },
  2889: { lat: 38.6226, lon: -90.1928, name: 'Busch Stadium' },
  // NL West
  22: { lat: 34.0739, lon: -118.2400, name: 'Dodger Stadium' },
  2395: { lat: 33.4453, lon: -112.0667, name: 'Chase Field' },
  16: { lat: 39.7559, lon: -104.9942, name: 'Coors Field' },
  24: { lat: 37.7786, lon: -122.3893, name: 'Oracle Park' },
  2680: { lat: 32.7073, lon: -117.1566, name: 'Petco Park' },
};

// Fallback by team abbreviation for venues not in the map
const TEAM_ABBR_COORDS: Record<string, { lat: number; lon: number }> = {
  NYY: { lat: 40.8296, lon: -73.9262 },
  BOS: { lat: 42.3467, lon: -71.0972 },
  TOR: { lat: 43.6414, lon: -79.3894 },
  BAL: { lat: 39.2838, lon: -76.6218 },
  TB: { lat: 27.7682, lon: -82.6534 },
  CLE: { lat: 41.4962, lon: -81.6852 },
  DET: { lat: 42.3390, lon: -83.0485 },
  KC: { lat: 37.9261, lon: -94.7501 },
  MIN: { lat: 44.9817, lon: -93.2778 },
  CWS: { lat: 41.8299, lon: -87.6338 },
  SEA: { lat: 47.5914, lon: -122.3325 },
  OAK: { lat: 37.7516, lon: -122.2005 },
  LAA: { lat: 33.8003, lon: -117.8827 },
  SD: { lat: 32.7073, lon: -117.1566 },
  HOU: { lat: 29.7573, lon: -95.3555 },
  ATL: { lat: 33.8907, lon: -84.4677 },
  MIA: { lat: 25.7781, lon: -80.2197 },
  NYM: { lat: 40.7571, lon: -73.8458 },
  PHI: { lat: 40.0023, lon: -75.1659 },
  WSH: { lat: 38.8730, lon: -77.0074 },
  CHC: { lat: 41.9484, lon: -87.6553 },
  CIN: { lat: 39.0979, lon: -84.5082 },
  MIL: { lat: 45.0169, lon: -93.2778 },
  PIT: { lat: 40.4469, lon: -80.0057 },
  STL: { lat: 38.6226, lon: -90.1928 },
  LAD: { lat: 34.0739, lon: -118.2400 },
  ARI: { lat: 33.4453, lon: -112.0667 },
  COL: { lat: 39.7559, lon: -104.9942 },
  SF: { lat: 37.7786, lon: -122.3893 },
};

// ─── NWS API helpers ──────────────────────────────────────────────────────────

interface NWSPointsResponse {
  properties: {
    forecast: string;
    forecastHourly: string;
  };
}

interface NWSForecastPeriod {
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  isDaytime: boolean;
}

interface NWSForecastResponse {
  properties: {
    periods: NWSForecastPeriod[];
  };
}

function normalizeCondition(shortForecast: string): string {
  const f = shortForecast.toLowerCase();
  if (f.includes('thunder')) return 'Thunderstorms';
  if (f.includes('rain') || f.includes('shower')) return 'Rain';
  if (f.includes('snow')) return 'Snow';
  if (f.includes('fog') || f.includes('mist')) return 'Foggy';
  if (f.includes('cloud') || f.includes('overcast')) return 'Cloudy';
  if (f.includes('partly')) return 'Partly Cloudy';
  if (f.includes('mostly clear') || f.includes('mostly sunny')) return 'Mostly Clear';
  if (f.includes('clear') || f.includes('sunny')) return 'Clear';
  return shortForecast.split(' ').slice(0, 2).join(' ');
}

function parseWindSpeed(windSpeed: string): number {
  // NWS returns values like "10 mph" or "5 to 15 mph"
  const match = windSpeed.match(/(\d+)\s*(?:to\s*(\d+))?\s*mph/i);
  if (!match) return 0;
  if (match[2]) {
    // range — use midpoint
    return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
  }
  return parseInt(match[1]);
}

// Cache to avoid duplicate NWS calls for same venue
const weatherCache = new Map<string, { result: WeatherResult; fetchedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchNWSWeather(lat: number, lon: number): Promise<WeatherResult> {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    // Step 1: Get grid point
    const pointsRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      {
        headers: { 'User-Agent': 'MLBAnalyticsDashboard/1.0 (contact@example.com)', Accept: 'application/json' },
        next: { revalidate: 600 },
      }
    );

    if (!pointsRes.ok) {
      const result: GameWeatherUnavailable = { unavailable: true };
      weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
      return result;
    }

    const pointsData: NWSPointsResponse = await pointsRes.json();
    const hourlyUrl = pointsData?.properties?.forecastHourly;
    if (!hourlyUrl) {
      const result: GameWeatherUnavailable = { unavailable: true };
      weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
      return result;
    }

    // Step 2: Get hourly forecast
    const forecastRes = await fetch(hourlyUrl, {
      headers: { 'User-Agent': 'MLBAnalyticsDashboard/1.0 (contact@example.com)', Accept: 'application/json' },
      next: { revalidate: 600 },
    });

    if (!forecastRes.ok) {
      const result: GameWeatherUnavailable = { unavailable: true };
      weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
      return result;
    }

    const forecastData: NWSForecastResponse = await forecastRes.json();
    const periods = forecastData?.properties?.periods;
    if (!periods || periods.length === 0) {
      const result: GameWeatherUnavailable = { unavailable: true };
      weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
      return result;
    }

    // Use the first (current/next) period
    const period = periods[0];

    // Guard against missing temperature data
    if (period.temperature == null) {
      const result: GameWeatherUnavailable = { unavailable: true };
      weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
      return result;
    }

    const tempF = period.temperatureUnit === 'F'
      ? period.temperature
      : Math.round(period.temperature * 9 / 5 + 32);

    const result: GameWeather = {
      tempF,
      condition: normalizeCondition(period.shortForecast ?? ''),
      windSpeedMph: parseWindSpeed(period.windSpeed ?? ''),
      windDirection: period.windDirection ?? 'N/A',
    };

    weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  } catch {
    const result: GameWeatherUnavailable = { unavailable: true };
    weatherCache.set(cacheKey, { result, fetchedAt: Date.now() });
    return result;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchWeatherForVenue(
  venueId: number,
  homeTeamAbbr: string
): Promise<WeatherResult> {
  const coords =
    STADIUM_COORDS[venueId] ??
    (TEAM_ABBR_COORDS[homeTeamAbbr]
      ? { lat: TEAM_ABBR_COORDS[homeTeamAbbr].lat, lon: TEAM_ABBR_COORDS[homeTeamAbbr].lon }
      : null);

  if (!coords) {
    return { unavailable: true };
  }

  return fetchNWSWeather(coords.lat, coords.lon);
}

export async function fetchWeatherForAllGames(
  games: Array<{ venueId: number; homeTeamAbbr: string; gamePk: number }>
): Promise<Map<number, WeatherResult>> {
  const results = await Promise.allSettled(
    games.map(g => fetchWeatherForVenue(g.venueId, g.homeTeamAbbr).then(w => ({ gamePk: g.gamePk, weather: w })))
  );

  const map = new Map<number, WeatherResult>();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      map.set(r.value.gamePk, r.value.weather);
    }
  }
  return map;
}
