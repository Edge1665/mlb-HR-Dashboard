import { MLB_STADIUM_COORDINATES } from '@/services/mlbStadiumCoordinates';

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

export interface GameWeatherInput {
  gamePk: number;
  homeTeamId: number | string;
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

function getWindVectorComponents(windDeg?: number, windSpeed = 0) {
  if (typeof windDeg !== 'number' || !Number.isFinite(windDeg) || !Number.isFinite(windSpeed)) {
    return {
      windOutToCenter: 0,
      windInFromCenter: 0,
      crosswind: 0,
    };
  }

  // Approximate center-field orientation as 200 degrees.
  const centerFieldBearingDeg = 200;
  const relativeRad = ((windDeg - centerFieldBearingDeg) * Math.PI) / 180;
  const rawOutComponent = Math.cos(relativeRad) * windSpeed;
  const rawCrosswind = Math.sin(relativeRad) * windSpeed;

  return {
    windOutToCenter: Math.max(0, rawOutComponent),
    windInFromCenter: Math.max(0, -rawOutComponent),
    crosswind: rawCrosswind,
  };
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
  const windComponents = getWindVectorComponents(windDeg, windSpeed);
  const precipitation = json.rain?.['1h'] ?? json.snow?.['1h'] ?? 0;
  const condition = json.weather?.[0]?.main ?? 'Unknown';
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
      const weather = await fetchWeatherForTeamHomePark(String(input.homeTeamId));

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
