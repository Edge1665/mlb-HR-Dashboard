import {
  MLB_STADIUM_COORDINATES_BY_TEAM_ID,
  MLB_STADIUM_COORDINATES_BY_VENUE_ID,
  type StadiumCoordinates,
} from '@/services/mlbStadiumCoordinates';

export interface LiveWeatherData {
  temp: number;
  feelsLike: number;
  condition: string;
  windSpeed: number;
  windDirection: string;
  windToward: 'out' | 'in' | 'neutral';
  windOutToCenter: number;
  windInFromCenter: number;
  crosswind: number;
  precipitation: number;
  humidity: number;
  visibility: number;
  densityAltitude: number;
  airDensityProxy: number;
  hrImpact: 'poor' | 'neutral' | 'good' | 'great';
  hrImpactScore: number;
}

export interface GameWeather {
  tempF: number;
  feelsLikeF: number;
  condition: string;
  windSpeedMph: number;
  windDirection: string;
  windToward: 'out' | 'in' | 'neutral';
  windOutToCenter: number;
  windInFromCenter: number;
  crosswind: number;
  precipitationInches: number;
  humidityPct: number;
  visibilityMiles: number;
  densityAltitude: number;
  airDensityProxy: number;
  hrImpact: 'poor' | 'neutral' | 'good' | 'great';
  hrImpactScore: number;
}

export interface WeatherUnavailable {
  unavailable: true;
  reason?: string;
}

export type WeatherResult = GameWeather | WeatherUnavailable;

export type HistoricalWeatherFailureReason =
  | 'missing_api_key'
  | 'missing_stadium_coordinates'
  | 'invalid_timestamp'
  | 'http_401'
  | 'http_error'
  | 'missing_sample';

export interface HistoricalWeatherFetchResult {
  weather: LiveWeatherData | null;
  source: 'current' | 'forecast' | 'historical' | 'fallback';
  failureReason?: HistoricalWeatherFailureReason;
  resolvedLocation?: {
    lookupType: 'venueId' | 'venueName' | 'homeTeamId' | 'unknown';
    locationKey: string | null;
    locationName: string | null;
    lat: number | null;
    lon: number | null;
  };
  warnings?: string[];
}

export interface GameWeatherInput {
  gamePk: number;
  homeTeamId: number | string;
  venueId?: number | string | null;
  venueName?: string | null;
}

type OpenWeatherCurrentResponse = {
  weather?: Array<{ main?: string; description?: string }>;
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
  };
  wind?: {
    speed?: number;
    deg?: number;
  };
  visibility?: number;
  rain?: {
    ['1h']?: number;
  };
  snow?: {
    ['1h']?: number;
  };
};

type OpenWeatherHistoricalResponse = {
  list?: Array<{
    dt?: number;
    weather?: Array<{ main?: string; description?: string }>;
    main?: {
      temp?: number;
      feels_like?: number;
      humidity?: number;
    };
    wind?: {
      speed?: number;
      deg?: number;
    };
    rain?: {
      ['1h']?: number;
    };
    snow?: {
      ['1h']?: number;
    };
    visibility?: number;
  }>;
};

type WeatherApiHistoryHour = {
  time?: string;
  time_epoch?: number;
  temp_f?: number;
  feelslike_f?: number;
  humidity?: number;
  wind_mph?: number;
  wind_degree?: number;
  precip_in?: number;
  vis_miles?: number;
  condition?: {
    text?: string;
  };
};

type WeatherApiHistoryResponse = {
  forecast?: {
    forecastday?: Array<{
      date?: string;
      hour?: WeatherApiHistoryHour[];
    }>;
  };
};

type WeatherApiForecastResponse = WeatherApiHistoryResponse;

function degreesToCompass(deg: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeVenueName(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVenueNameCoordinateMap(): Record<string, StadiumCoordinates> {
  const entries = [
    ...Object.values(MLB_STADIUM_COORDINATES_BY_VENUE_ID),
    ...Object.values(MLB_STADIUM_COORDINATES_BY_TEAM_ID),
  ];
  const map: Record<string, StadiumCoordinates> = {};

  for (const entry of entries) {
    const normalized = normalizeVenueName(entry.name);
    if (normalized) {
      map[normalized] = entry;
    }
  }

  return map;
}

const MLB_STADIUM_COORDINATES_BY_VENUE_NAME = buildVenueNameCoordinateMap();

type StadiumLookupInput = {
  homeTeamId?: string | number | null;
  venueId?: string | number | null;
  venueName?: string | null;
};

type ResolvedStadium = {
  stadium: StadiumCoordinates | null;
  lookupType: 'venueId' | 'venueName' | 'homeTeamId' | 'unknown';
  locationKey: string | null;
  warnings: string[];
};

function resolveStadiumCoordinates(input: StadiumLookupInput): ResolvedStadium {
  const warnings: string[] = [];

  const normalizedVenueName = normalizeVenueName(input.venueName);
  const venueIdKey = input.venueId != null ? String(input.venueId) : null;
  const byVenueName = normalizedVenueName
    ? MLB_STADIUM_COORDINATES_BY_VENUE_NAME[normalizedVenueName] ?? null
    : null;
  const byVenueId = venueIdKey
    ? MLB_STADIUM_COORDINATES_BY_VENUE_ID[venueIdKey] ?? null
    : null;

  if (
    byVenueName &&
    byVenueId &&
    normalizeVenueName(byVenueName.name) !== normalizeVenueName(byVenueId.name)
  ) {
    warnings.push(
      `venueId/venueName mismatch: venueId ${venueIdKey} -> ${byVenueId.name}, venueName -> ${byVenueName.name}`
    );
  }

  if (byVenueName) {
    if (byVenueId && normalizeVenueName(byVenueName.name) !== normalizeVenueName(byVenueId.name)) {
      warnings.push(`preferring venueName mapping over venueId ${venueIdKey}`);
    }

    return {
      stadium: byVenueName,
      lookupType: 'venueName',
      locationKey: normalizedVenueName,
      warnings,
    };
  }

  if (normalizedVenueName) {
    warnings.push(`missing venueName mapping: ${input.venueName}`);
  }

  if (venueIdKey != null) {
    if (byVenueId) {
      return {
        stadium: byVenueId,
        lookupType: 'venueId',
        locationKey: venueIdKey,
        warnings,
      };
    }

    warnings.push(`missing venueId mapping: ${venueIdKey}`);
  }

  if (input.homeTeamId != null) {
    const homeTeamKey = String(input.homeTeamId);
    const byHomeTeam = MLB_STADIUM_COORDINATES_BY_TEAM_ID[homeTeamKey];
    if (byHomeTeam) {
      warnings.push(`fell back to homeTeamId mapping: ${homeTeamKey}`);
      return {
        stadium: byHomeTeam,
        lookupType: 'homeTeamId',
        locationKey: homeTeamKey,
        warnings,
      };
    }

    warnings.push(`missing homeTeamId mapping: ${homeTeamKey}`);
  }

  return {
    stadium: null,
    lookupType: 'unknown',
    locationKey: null,
    warnings,
  };
}

function normalizeDateString(value?: string): string {
  if (!value) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  }

  return value.slice(0, 10);
}

function isTodayETDate(value?: string): boolean {
  return normalizeDateString(value) === normalizeDateString();
}

function getOpenWeatherApiKey(): string | undefined {
  return (
    process.env.OPENWEATHER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY ||
    process.env.VITE_WEATHER_API_KEY
  );
}

function getWeatherApiKey(): string | undefined {
  return process.env.WEATHERAPI_API_KEY || process.env.NEXT_PUBLIC_WEATHERAPI_API_KEY;
}

function formatEtDateString(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return normalizeDateString(value);
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

function toGameWeather(weather: LiveWeatherData): GameWeather {
  return {
    tempF: weather.temp,
    feelsLikeF: weather.feelsLike,
    condition: weather.condition,
    windSpeedMph: weather.windSpeed,
    windDirection: weather.windDirection,
    windToward: weather.windToward,
    windOutToCenter: weather.windOutToCenter,
    windInFromCenter: weather.windInFromCenter,
    crosswind: weather.crosswind,
    precipitationInches: weather.precipitation,
    humidityPct: weather.humidity,
    visibilityMiles: weather.visibility,
    densityAltitude: weather.densityAltitude,
    airDensityProxy: weather.airDensityProxy,
    hrImpact: weather.hrImpact,
    hrImpactScore: weather.hrImpactScore,
  };
}

function normalizeBearingDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function getWindVectorComponents(
  windDeg?: number,
  windSpeed = 0,
  centerFieldBearingDeg = 25,
) {
  if (typeof windDeg !== 'number' || !Number.isFinite(windDeg) || !Number.isFinite(windSpeed)) {
    return {
      windOutToCenter: 0,
      windInFromCenter: 0,
      crosswind: 0,
    };
  }

  // Weather providers report the direction the wind is coming from.
  // Convert that to the direction the wind is traveling toward so we can
  // compare it against the field orientation.
  const windTravelBearingDeg = normalizeBearingDegrees(windDeg + 180);
  const relativeRad =
    ((windTravelBearingDeg - centerFieldBearingDeg) * Math.PI) / 180;
  const rawOutComponent = Math.cos(relativeRad) * windSpeed;
  const rawCrosswind = Math.sin(relativeRad) * windSpeed;

  return {
    windOutToCenter: Math.max(0, rawOutComponent),
    windInFromCenter: Math.max(0, -rawOutComponent),
    crosswind: rawCrosswind,
  };
}

function estimateWindTowardFromComponents(input: {
  windOutToCenter: number;
  windInFromCenter: number;
  crosswind: number;
}): 'out' | 'in' | 'neutral' {
  const outComponent = input.windOutToCenter;
  const inComponent = input.windInFromCenter;
  const crosswindMagnitude = Math.abs(input.crosswind);

  if (outComponent >= 3 && outComponent >= inComponent && outComponent >= crosswindMagnitude * 0.75) {
    return 'out';
  }

  if (inComponent >= 3 && inComponent >= outComponent && inComponent >= crosswindMagnitude * 0.75) {
    return 'in';
  }

  return 'neutral';
}

function estimateDensityAltitude(temp: number, humidity: number): number {
  // Rough proxy: warmer/more humid air behaves like higher altitude.
  return Math.round((temp - 59) * 120 + (humidity - 50) * 12);
}

function estimateAirDensityProxy(temp: number, humidity: number, densityAltitude: number): number {
  const tempPenalty = (temp - 70) * -0.003;
  const humidityPenalty = (humidity - 50) * -0.0012;
  const altitudePenalty = densityAltitude * -0.00003;
  return clamp(Number((1 + tempPenalty + humidityPenalty + altitudePenalty).toFixed(3)), 0.82, 1.12);
}

function calculateHRImpactScore(input: {
  temp: number;
  windSpeed: number;
  windToward: 'out' | 'in' | 'neutral';
  precipitation: number;
  condition: string;
}): {
  hrImpact: 'poor' | 'neutral' | 'good' | 'great';
  hrImpactScore: number;
} {
  let score = 0;

  // Temperature: warmer helps carry, cold suppresses
  if (input.temp >= 85) score += 1.0;
  else if (input.temp >= 75) score += 0.6;
  else if (input.temp <= 50) score -= 0.8;
  else if (input.temp <= 60) score -= 0.3;

  // Wind: out helps, in hurts
  if (input.windToward === 'out') {
    if (input.windSpeed >= 15) score += 1.0;
    else if (input.windSpeed >= 8) score += 0.5;
    else score += 0.2;
  } else if (input.windToward === 'in') {
    if (input.windSpeed >= 15) score -= 1.0;
    else if (input.windSpeed >= 8) score -= 0.5;
    else score -= 0.2;
  }

  // Rain / snow generally hurts hitting environment
  if (input.precipitation > 0.2) score -= 0.7;
  else if (input.precipitation > 0) score -= 0.3;

  // Very rough condition adjustment
  const condition = input.condition.toLowerCase();
  if (condition.includes('rain') || condition.includes('storm')) score -= 0.5;
  if (condition.includes('snow')) score -= 0.8;
  if (condition.includes('clear')) score += 0.1;

  const hrImpactScore = clamp(Number(score.toFixed(2)), -2, 2);

  let hrImpact: 'poor' | 'neutral' | 'good' | 'great' = 'neutral';
  if (hrImpactScore >= 1.2) hrImpact = 'great';
  else if (hrImpactScore >= 0.4) hrImpact = 'good';
  else if (hrImpactScore <= -0.8) hrImpact = 'poor';

  return { hrImpact, hrImpactScore };
}

function buildLiveWeatherData(input: {
  stadium?: StadiumCoordinates | null;
  temp?: number;
  feelsLike?: number;
  humidity?: number;
  visibility?: number;
  windSpeed?: number;
  windDeg?: number;
  precipitation?: number;
  condition?: string;
}): LiveWeatherData {
  const temp = input.temp ?? 70;
  const feelsLike = input.feelsLike ?? temp;
  const humidity = input.humidity ?? 50;
  const visibility = typeof input.visibility === 'number' ? input.visibility : 10;
  const windSpeed = input.windSpeed ?? 0;
  const windDeg = input.windDeg;
  const windDirection = typeof windDeg === 'number' ? degreesToCompass(windDeg) : 'N/A';
  const centerFieldBearingDeg = input.stadium?.centerFieldBearingDeg ?? 25;
  const windComponents = getWindVectorComponents(
    windDeg,
    windSpeed,
    centerFieldBearingDeg,
  );
  const windToward = estimateWindTowardFromComponents(windComponents);
  const precipitation = input.precipitation ?? 0;
  const condition = input.condition ?? 'Unknown';
  const densityAltitude = estimateDensityAltitude(temp, humidity);
  const airDensityProxy = estimateAirDensityProxy(temp, humidity, densityAltitude);

  const { hrImpact, hrImpactScore } = calculateHRImpactScore({
    temp,
    windSpeed,
    windToward,
    precipitation,
    condition,
  });

  return {
    temp,
    feelsLike,
    condition,
    windSpeed,
    windDirection,
    windToward,
    windOutToCenter: windComponents.windOutToCenter,
    windInFromCenter: windComponents.windInFromCenter,
    crosswind: windComponents.crosswind,
    precipitation,
    humidity,
    visibility,
    densityAltitude,
    airDensityProxy,
    hrImpact,
    hrImpactScore,
  };
}

function getHistoricalWeatherTimestamp(targetDateTime?: string): number | null {
  if (!targetDateTime) return null;

  const parsed = new Date(targetDateTime);
  if (!Number.isFinite(parsed.getTime())) return null;

  return Math.floor(parsed.getTime() / 1000);
}

function getTargetDateTime(targetDateTime?: string): Date | null {
  if (!targetDateTime) return null;

  const parsed = new Date(targetDateTime);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getForecastDaysRequired(targetDateTime: string): number {
  const targetDate = formatEtDateString(targetDateTime);
  const todayDate = normalizeDateString();

  const target = new Date(`${targetDate}T00:00:00Z`);
  const today = new Date(`${todayDate}T00:00:00Z`);
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  return clamp(dayDiff + 1, 1, 14);
}

function pickClosestWeatherHour(
  hours: WeatherApiHistoryHour[],
  timestamp: number,
): WeatherApiHistoryHour | null {
  return hours.reduce<WeatherApiHistoryHour | null>((closest, hour) => {
    if (hour?.time_epoch == null) return closest;
    if (!closest?.time_epoch) return hour;

    const currentDiff = Math.abs(hour.time_epoch - timestamp);
    const closestDiff = Math.abs(closest.time_epoch - timestamp);
    return currentDiff < closestDiff ? hour : closest;
  }, null);
}

async function fetchWeatherForecastForVenueAtDateDetailed(
  location: StadiumLookupInput,
  targetDateTime: string,
): Promise<HistoricalWeatherFetchResult> {
  const apiKey = getWeatherApiKey();
  const resolved = resolveStadiumCoordinates(location);
  const stadium = resolved.stadium;

  if (!apiKey) {
    console.warn('[weather:forecast] Missing WeatherAPI key', {
      location,
      targetDateTime,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'missing_api_key',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium?.name ?? location.venueName ?? null,
        lat: stadium?.lat ?? null,
        lon: stadium?.lon ?? null,
      },
      warnings: resolved.warnings,
    };
  }
  if (!stadium) {
    console.warn('[weather:forecast] Missing stadium coordinates', {
      location,
      targetDateTime,
      warnings: resolved.warnings,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'missing_stadium_coordinates',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: location.venueName ?? null,
        lat: null,
        lon: null,
      },
      warnings: resolved.warnings,
    };
  }

  const timestamp = getHistoricalWeatherTimestamp(targetDateTime);
  if (!timestamp) {
    console.warn('[weather:forecast] Invalid target timestamp', {
      location,
      targetDateTime,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'invalid_timestamp',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium.name,
        lat: stadium.lat,
        lon: stadium.lon,
      },
      warnings: resolved.warnings,
    };
  }

  const queryDate = formatEtDateString(targetDateTime);
  const days = getForecastDaysRequired(targetDateTime);
  const url =
    `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}` +
    `&q=${stadium.lat},${stadium.lon}&days=${days}&alerts=no&aqi=no`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    console.warn('[weather:forecast] WeatherAPI forecast request failed', {
      location,
      targetDateTime,
      stadium: stadium.name,
      status: response.status,
      statusText: response.statusText,
      timestamp,
      queryDate,
      url,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: response.status === 401 ? 'http_401' : 'http_error',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium.name,
        lat: stadium.lat,
        lon: stadium.lon,
      },
      warnings: resolved.warnings,
    };
  }

  const json = (await response.json()) as WeatherApiForecastResponse;
  const forecastDays = json.forecast?.forecastday ?? [];
  const matchingDay =
    forecastDays.find((forecastDay) => forecastDay.date === queryDate) ??
    forecastDays[0] ??
    null;
  const sample = matchingDay ? pickClosestWeatherHour(matchingDay.hour ?? [], timestamp) : null;

  if (!sample) {
    console.warn('[weather:forecast] WeatherAPI forecast response missing sample', {
      location,
      targetDateTime,
      stadium: stadium.name,
      timestamp,
      queryDate,
      resultCount: forecastDays.length,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'missing_sample',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium.name,
        lat: stadium.lat,
        lon: stadium.lon,
      },
      warnings: resolved.warnings,
    };
  }

  const weather = buildLiveWeatherData({
    stadium,
    temp: sample.temp_f,
    feelsLike: sample.feelslike_f,
    humidity: sample.humidity,
    visibility: sample.vis_miles,
    windSpeed: sample.wind_mph,
    windDeg: sample.wind_degree,
    precipitation: sample.precip_in ?? 0,
    condition: sample.condition?.text ?? 'Unknown',
  });

  console.info('[weather:forecast] WeatherAPI forecast fetch succeeded', {
    location,
    lookupType: resolved.lookupType,
    targetDateTime,
    stadium: stadium.name,
    timestamp,
    queryDate,
    matchedHourEpoch: sample.time_epoch,
    temp: weather.temp,
    humidity: weather.humidity,
    windSpeed: weather.windSpeed,
    windOutToCenter: weather.windOutToCenter,
    windInFromCenter: weather.windInFromCenter,
    crosswind: weather.crosswind,
  });

  return {
    weather,
    source: 'forecast',
    resolvedLocation: {
      lookupType: resolved.lookupType,
      locationKey: resolved.locationKey,
      locationName: stadium.name,
      lat: stadium.lat,
      lon: stadium.lon,
    },
    warnings: resolved.warnings,
  };
}

export async function fetchWeatherForVenue(
  location: StadiumLookupInput,
): Promise<LiveWeatherData | null> {
  const apiKey = getOpenWeatherApiKey();
  const resolved = resolveStadiumCoordinates(location);
  const stadium = resolved.stadium;

  if (!apiKey) {
    return null;
  }
  if (!stadium) {
    console.warn('[weather:current] Missing stadium coordinates', {
      location,
      warnings: resolved.warnings,
    });
    return null;
  }

  const url =
    `https://api.openweathermap.org/data/2.5/weather?lat=${stadium.lat}&lon=${stadium.lon}` +
    `&appid=${apiKey}&units=imperial`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as OpenWeatherCurrentResponse;

  return buildLiveWeatherData({
    stadium,
    temp: json.main?.temp,
    feelsLike: json.main?.feels_like,
    humidity: json.main?.humidity,
    visibility: typeof json.visibility === 'number' ? json.visibility / 1609.34 : undefined,
    windSpeed: json.wind?.speed,
    windDeg: json.wind?.deg,
    precipitation: json.rain?.['1h'] ?? json.snow?.['1h'] ?? 0,
    condition: json.weather?.[0]?.main ?? 'Unknown',
  });
}

export async function fetchWeatherForVenueAtDateDetailed(
  location: StadiumLookupInput,
  targetDateTime?: string
): Promise<HistoricalWeatherFetchResult> {
  if (!targetDateTime) {
    const weather = await fetchWeatherForVenue(location);
    const resolved = resolveStadiumCoordinates(location);
    return {
      weather,
      source: 'current',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName:
          resolved.stadium?.name ?? location.venueName ?? null,
        lat: resolved.stadium?.lat ?? null,
        lon: resolved.stadium?.lon ?? null,
      },
      warnings: resolved.warnings,
    };
  }

  const targetDate = getTargetDateTime(targetDateTime);
  if (!targetDate) {
    console.warn('[weather] Invalid target timestamp', {
      location,
      targetDateTime,
    });
    return { weather: null, source: 'fallback', failureReason: 'invalid_timestamp' };
  }

  if (targetDate.getTime() > Date.now()) {
    const forecastResult = await fetchWeatherForecastForVenueAtDateDetailed(
      location,
      targetDateTime,
    );

    if (forecastResult.weather) {
      return forecastResult;
    }

    if (isTodayETDate(targetDateTime)) {
      return {
        weather: await fetchWeatherForVenue(location),
        source: 'current',
        resolvedLocation: forecastResult.resolvedLocation,
        warnings: forecastResult.warnings,
      };
    }

    return forecastResult;
  }

  const apiKey = getWeatherApiKey();
  const resolved = resolveStadiumCoordinates(location);
  const stadium = resolved.stadium;

  if (!apiKey) {
    console.warn('[weather:historical] Missing WeatherAPI key', {
      location,
      targetDateTime,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'missing_api_key',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium?.name ?? location.venueName ?? null,
        lat: stadium?.lat ?? null,
        lon: stadium?.lon ?? null,
      },
      warnings: resolved.warnings,
    };
  }
  if (!stadium) {
    console.warn('[weather:historical] Missing stadium coordinates', {
      location,
      targetDateTime,
      warnings: resolved.warnings,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'missing_stadium_coordinates',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: location.venueName ?? null,
        lat: null,
        lon: null,
      },
      warnings: resolved.warnings,
    };
  }

  const timestamp = getHistoricalWeatherTimestamp(targetDateTime);
  if (!timestamp) {
    console.warn('[weather:historical] Invalid target timestamp', {
      location,
      targetDateTime,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'invalid_timestamp',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium.name,
        lat: stadium.lat,
        lon: stadium.lon,
      },
      warnings: resolved.warnings,
    };
  }

  const queryDate = formatEtDateString(targetDateTime);
  const url =
    `https://api.weatherapi.com/v1/history.json?key=${apiKey}` +
    `&q=${stadium.lat},${stadium.lon}&dt=${queryDate}`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    console.warn('[weather:historical] WeatherAPI historical request failed', {
      location,
      targetDateTime,
      stadium: stadium.name,
      status: response.status,
      statusText: response.statusText,
      timestamp,
      queryDate,
      url,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: response.status === 401 ? 'http_401' : 'http_error',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium.name,
        lat: stadium.lat,
        lon: stadium.lon,
      },
      warnings: resolved.warnings,
    };
  }

  const json = (await response.json()) as WeatherApiHistoryResponse;
  const hours = json.forecast?.forecastday?.[0]?.hour ?? [];
  const sample = pickClosestWeatherHour(hours, timestamp);

  if (!sample) {
    console.warn('[weather:historical] WeatherAPI historical response missing sample', {
      location,
      targetDateTime,
      stadium: stadium.name,
      timestamp,
      queryDate,
      resultCount: hours.length,
    });
    return {
      weather: null,
      source: 'fallback',
      failureReason: 'missing_sample',
      resolvedLocation: {
        lookupType: resolved.lookupType,
        locationKey: resolved.locationKey,
        locationName: stadium.name,
        lat: stadium.lat,
        lon: stadium.lon,
      },
      warnings: resolved.warnings,
    };
  }

  const weather = buildLiveWeatherData({
    stadium,
    temp: sample.temp_f,
    feelsLike: sample.feelslike_f,
    humidity: sample.humidity,
    visibility: sample.vis_miles,
    windSpeed: sample.wind_mph,
    windDeg: sample.wind_degree,
    precipitation: sample.precip_in ?? 0,
    condition: sample.condition?.text ?? 'Unknown',
  });

  console.info('[weather:historical] WeatherAPI historical fetch succeeded', {
    location,
    lookupType: resolved.lookupType,
    targetDateTime,
    stadium: stadium.name,
    timestamp,
    queryDate,
    matchedHourEpoch: sample.time_epoch,
    temp: weather.temp,
    humidity: weather.humidity,
    windSpeed: weather.windSpeed,
    windOutToCenter: weather.windOutToCenter,
    windInFromCenter: weather.windInFromCenter,
    crosswind: weather.crosswind,
    airDensityProxy: weather.airDensityProxy,
    densityAltitude: weather.densityAltitude,
  });

  return {
    weather,
    source: 'historical',
    resolvedLocation: {
      lookupType: resolved.lookupType,
      locationKey: resolved.locationKey,
      locationName: stadium.name,
      lat: stadium.lat,
      lon: stadium.lon,
    },
    warnings: resolved.warnings,
  };
}

export async function fetchWeatherForTeamHomePark(teamId: string): Promise<LiveWeatherData | null> {
  return fetchWeatherForVenue({ homeTeamId: teamId });
}

export async function fetchWeatherForTeamHomeParkAtDateDetailed(
  teamId: string,
  targetDateTime?: string
): Promise<HistoricalWeatherFetchResult> {
  return fetchWeatherForVenueAtDateDetailed({ homeTeamId: teamId }, targetDateTime);
}

export async function fetchWeatherForTeamHomeParkAtDate(
  teamId: string,
  targetDateTime?: string
): Promise<LiveWeatherData | null> {
  const result = await fetchWeatherForTeamHomeParkAtDateDetailed(teamId, targetDateTime);
  return result.weather;
}

export function getNeutralWeather(): LiveWeatherData {
  return {
    temp: 70,
    feelsLike: 70,
    condition: 'Unknown',
    windSpeed: 0,
    windDirection: 'N/A',
    windToward: 'neutral',
    windOutToCenter: 0,
    windInFromCenter: 0,
    crosswind: 0,
    precipitation: 0,
    humidity: 50,
    visibility: 10,
    densityAltitude: 0,
    airDensityProxy: 1,
    hrImpact: 'neutral',
    hrImpactScore: 0,
  };
}

export async function fetchWeatherForAllGames(
  inputs: GameWeatherInput[]
): Promise<Map<number, WeatherResult>> {
  const weatherMap = new Map<number, WeatherResult>();

  if (!Array.isArray(inputs) || inputs.length === 0) {
    return weatherMap;
  }

  const results = await Promise.allSettled(
    inputs.map(async (input) => {
      const weather = await fetchWeatherForVenue({
        homeTeamId: input.homeTeamId,
        venueId: input.venueId,
        venueName: input.venueName,
      });

      return {
        gamePk: input.gamePk,
        weather: weather
          ? toGameWeather(weather)
          : ({
              unavailable: true,
              reason: 'Weather data unavailable',
            } satisfies WeatherUnavailable),
      };
    })
  );

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const result = results[i];

    if (result.status === 'fulfilled') {
      weatherMap.set(input.gamePk, result.value.weather);
      continue;
    }

    weatherMap.set(input.gamePk, {
      unavailable: true,
      reason: 'Weather lookup failed',
    });
  }

  return weatherMap;
}
