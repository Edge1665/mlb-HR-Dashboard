import { MLB_STADIUM_COORDINATES } from '@/services/mlbStadiumCoordinates';

export interface LiveWeatherData {
  temp: number;
  feelsLike: number;
  condition: string;
  windSpeed: number;
  windDirection: string;
  windToward: 'out' | 'in' | 'neutral';
  precipitation: number;
  humidity: number;
  visibility: number;
  hrImpact: 'poor' | 'neutral' | 'good' | 'great';
  hrImpactScore: number;
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

function degreesToCompass(deg: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

function estimateWindToward(windDeg?: number): 'out' | 'in' | 'neutral' {
  if (typeof windDeg !== 'number' || !Number.isFinite(windDeg)) return 'neutral';

  // Simplified assumption:
  // Southerly to southwesterly winds often help carry at many parks;
  // northerly/easterly often suppress somewhat.
  if (windDeg >= 180 && windDeg <= 260) return 'out';
  if ((windDeg >= 300 && windDeg <= 360) || (windDeg >= 0 && windDeg <= 45)) return 'in';
  return 'neutral';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

export async function fetchWeatherForTeamHomePark(teamId: string): Promise<LiveWeatherData | null> {
  const apiKey =
    process.env.OPENWEATHER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY ||
    process.env.VITE_WEATHER_API_KEY;

  if (!apiKey) {
    return null;
  }

  const stadium = MLB_STADIUM_COORDINATES[teamId];
  if (!stadium) {
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

  const temp = json.main?.temp ?? 70;
  const feelsLike = json.main?.feels_like ?? temp;
  const humidity = json.main?.humidity ?? 50;
  const visibility = typeof json.visibility === 'number' ? json.visibility / 1609.34 : 10;
  const windSpeed = json.wind?.speed ?? 0;
  const windDeg = json.wind?.deg;
  const windDirection = typeof windDeg === 'number' ? degreesToCompass(windDeg) : 'N/A';
  const windToward = estimateWindToward(windDeg);
  const precipitation = json.rain?.['1h'] ?? json.snow?.['1h'] ?? 0;
  const condition = json.weather?.[0]?.main ?? 'Unknown';

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
    precipitation,
    humidity,
    visibility,
    hrImpact,
    hrImpactScore,
  };
}

export function getNeutralWeather(): LiveWeatherData {
  return {
    temp: 70,
    feelsLike: 70,
    condition: 'Unknown',
    windSpeed: 0,
    windDirection: 'N/A',
    windToward: 'neutral',
    precipitation: 0,
    humidity: 50,
    visibility: 10,
    hrImpact: 'neutral',
    hrImpactScore: 0,
  };
}