/**
 * HR Prediction Service
 * Transparent, feature-based home run probability model.
 * All inputs are optional — null checks and graceful fallbacks throughout.
 */

import type { ConfidenceTier, PlatoonAdvantage, Batter, Pitcher, Game, Ballpark } from '@/types';

// ─── Input Interfaces ────────────────────────────────────────────────────────

export interface BatterPowerProfile {
  seasonHR?: number;
  seasonGames?: number;
  iso?: number;
  barrelRate?: number;
  exitVelocityAvg?: number;
  hardHitRate?: number;
  flyBallRate?: number;
  hrFbRate?: number;
  xSlugging?: number;
}

export interface BatterRecentForm {
  last7HR?: number;
  last7OPS?: number;
  last14HR?: number;
  last14OPS?: number;
  last30HR?: number;
}

export interface PlatoonSplits {
  bats?: 'L' | 'R' | 'S';
  pitcherThrows?: 'L' | 'R';
  hrVsLeft?: number;
  paVsLeft?: number;
  hrVsRight?: number;
  paVsRight?: number;
  slgVsLeft?: number;
  slgVsRight?: number;
}

export interface PitcherProfile {
  throws?: 'L' | 'R';
  hr9?: number;
  hrFbRate?: number;
  fbPct?: number;
  era?: number;
  recentHr9?: number;
}

export interface BallparkContext {
  hrFactor?: number;
  elevation?: number;
  name?: string;
}

export interface WeatherContext {
  temp?: number;
  windSpeed?: number;
  windToward?: 'out' | 'in' | 'crosswind' | 'neutral';
  hrImpact?: 'positive' | 'neutral' | 'negative';
  hrImpactScore?: number;
}

export interface TeamOffensiveContext {
  teamSeasonHR?: number;
  teamGames?: number;
  teamOPS?: number;
}

export interface HRPredictionInput {
  batterId: string;
  batterName: string;
  lineupPosition?: number | null;
  power?: BatterPowerProfile;
  recentForm?: BatterRecentForm;
  platoon?: PlatoonSplits;
  pitcher?: PitcherProfile;
  ballpark?: BallparkContext;
  weather?: WeatherContext;
  teamOffense?: TeamOffensiveContext;
}

// ─── Output Interface ─────────────────────────────────────────────────────────

export interface HRPredictionOutput {
  batterId: string;
  batterName: string;
  hrProbability: number;
  confidenceTier: ConfidenceTier;
  platoonAdvantage: PlatoonAdvantage;
  keyFactors: string[];
  featureBreakdown: FeatureContribution[];
  dataCompleteness: number;
  projectedAtBats: number;
  matchupScore: number;
  parkFactorUsed: number;
  weatherImpactUsed: number;
}

export interface FeatureContribution {
  feature: string;
  rawValue: string;
  adjustment: number;
  direction: 'positive' | 'neutral' | 'negative';
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Baseline single-game HR probability for a typical MLB hitter.
 * This is a game-level baseline, not a per-PA rate.
 */
const LEAGUE_AVG_HR_PROB = 4.2;

const LINEUP_PA_MAP: Record<number, number> = {
  1: 4.4,
  2: 4.3,
  3: 4.2,
  4: 4.1,
  5: 3.9,
  6: 3.8,
  7: 3.7,
  8: 3.6,
  9: 3.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// ─── Core Model ───────────────────────────────────────────────────────────────

export function computeHRProbability(input: HRPredictionInput): HRPredictionOutput {
  const contributions: FeatureContribution[] = [];
  let dataPoints = 0;
  const totalPossiblePoints = 9;

  // ── 1. Season HR Rate / Power Baseline ──────────────────────────────────────
  let powerMultiplier = 1.0;

  if (
    input.power?.seasonHR != null &&
    input.power?.seasonGames != null &&
    input.power.seasonGames > 0
  ) {
    const hrPerGame = input.power.seasonHR / input.power.seasonGames;

    // Calibrated more conservatively than the original
    // Around 0.15 HR/G is solid power, with bounded influence
    if (hrPerGame >= 0.28) powerMultiplier = 1.22;
    else if (hrPerGame >= 0.22) powerMultiplier = 1.14;
    else if (hrPerGame >= 0.16) powerMultiplier = 1.06;
    else if (hrPerGame >= 0.10) powerMultiplier = 1.0;
    else if (hrPerGame >= 0.06) powerMultiplier = 0.93;
    else powerMultiplier = 0.86;

    dataPoints++;
    contributions.push({
      feature: 'Season HR Rate',
      rawValue: `${input.power.seasonHR} HR in ${input.power.seasonGames} G (${(hrPerGame * 162).toFixed(0)}-HR pace)`,
      adjustment: powerMultiplier - 1.0,
      direction:
        powerMultiplier >= 1.05 ? 'positive' : powerMultiplier <= 0.95 ? 'negative' : 'neutral',
    });
  }

  // ── 2. Power Indicators ─────────────────────────────────────────────────────
  let statcastMultiplier = 1.0;
  const barrelRate = input.power?.barrelRate;
  const exitVelo = input.power?.exitVelocityAvg;
  const iso = input.power?.iso;
  const hardHitRate = input.power?.hardHitRate;
  const flyBallRate = input.power?.flyBallRate;
  const xSlugging = input.power?.xSlugging;

  if (
    barrelRate != null ||
    exitVelo != null ||
    iso != null ||
    hardHitRate != null ||
    flyBallRate != null ||
    xSlugging != null
  ) {
    let score = 0;
    let count = 0;

    if (barrelRate != null) {
      score += barrelRate >= 18 ? 1.20 : barrelRate >= 14 ? 1.12 : barrelRate >= 10 ? 1.04 : barrelRate >= 7 ? 1.0 : 0.90;
      count++;
    }

    if (exitVelo != null) {
      score += exitVelo >= 94 ? 1.16 : exitVelo >= 92 ? 1.10 : exitVelo >= 90 ? 1.03 : exitVelo >= 88 ? 1.0 : 0.91;
      count++;
    }

    if (iso != null) {
      score += iso >= 0.260 ? 1.16 : iso >= 0.220 ? 1.10 : iso >= 0.180 ? 1.04 : iso >= 0.140 ? 1.0 : 0.92;
      count++;
    }

    if (hardHitRate != null) {
      score += hardHitRate >= 50 ? 1.10 : hardHitRate >= 43 ? 1.05 : hardHitRate >= 36 ? 1.0 : 0.94;
      count++;
    }

    if (flyBallRate != null) {
      score += flyBallRate >= 46 ? 1.07 : flyBallRate >= 38 ? 1.03 : flyBallRate >= 30 ? 1.0 : 0.96;
      count++;
    }

    if (xSlugging != null) {
      score += xSlugging >= 0.550 ? 1.12 : xSlugging >= 0.500 ? 1.06 : xSlugging >= 0.430 ? 1.0 : 0.94;
      count++;
    }

    if (count > 0) {
      statcastMultiplier = clamp(score / count, 0.88, 1.18);
      dataPoints++;

      const parts: string[] = [];
      if (barrelRate != null) parts.push(`Barrel ${barrelRate.toFixed(1)}%`);
      if (exitVelo != null) parts.push(`EV ${exitVelo.toFixed(1)} mph`);
      if (iso != null) parts.push(`ISO .${Math.round(iso * 1000).toString().padStart(3, '0')}`);
      if (hardHitRate != null) parts.push(`Hard-hit ${hardHitRate.toFixed(1)}%`);
      if (flyBallRate != null) parts.push(`FB ${flyBallRate.toFixed(1)}%`);
      if (xSlugging != null) parts.push(`xSLG .${Math.round(xSlugging * 1000).toString().padStart(3, '0')}`);

      contributions.push({
        feature: 'Power Indicators',
        rawValue: parts.join(', '),
        adjustment: statcastMultiplier - 1.0,
        direction:
          statcastMultiplier >= 1.05 ? 'positive' : statcastMultiplier <= 0.95 ? 'negative' : 'neutral',
      });
    }
  }

  // ── 3. Recent Form ───────────────────────────────────────────────────────────
  let formMultiplier = 1.0;
  const last7HR = input.recentForm?.last7HR;
  const last7OPS = input.recentForm?.last7OPS;
  const last14HR = input.recentForm?.last14HR;
  const last14OPS = input.recentForm?.last14OPS;
  const last30HR = input.recentForm?.last30HR;

  if (
    last7HR != null ||
    last7OPS != null ||
    last14HR != null ||
    last14OPS != null ||
    last30HR != null
  ) {
    let formScore = 1.0;

    if (last7HR != null) {
      formScore *= last7HR >= 3 ? 1.14 : last7HR >= 2 ? 1.08 : last7HR >= 1 ? 1.03 : 0.96;
    }

    if (last7OPS != null) {
      formScore *= last7OPS >= 1.000 ? 1.08 : last7OPS >= 0.850 ? 1.04 : last7OPS >= 0.700 ? 1.0 : 0.95;
    }

    if (last14HR != null && last7HR == null) {
      formScore *= last14HR >= 4 ? 1.10 : last14HR >= 2 ? 1.05 : last14HR >= 1 ? 1.02 : 0.97;
    }

    if (last14OPS != null && last7OPS == null) {
      formScore *= last14OPS >= 0.900 ? 1.04 : last14OPS >= 0.750 ? 1.0 : 0.96;
    }

    if (last30HR != null && last7HR == null && last14HR == null) {
      formScore *= last30HR >= 8 ? 1.06 : last30HR >= 5 ? 1.03 : last30HR >= 2 ? 1.0 : 0.98;
    }

    formMultiplier = clamp(formScore, 0.90, 1.16);
    dataPoints++;

    const formParts: string[] = [];
    if (last7HR != null) formParts.push(`${last7HR} HR last 7d`);
    if (last7OPS != null) formParts.push(`${last7OPS.toFixed(3)} OPS last 7d`);
    if (last14HR != null) formParts.push(`${last14HR} HR last 14d`);
    if (last14OPS != null) formParts.push(`${last14OPS.toFixed(3)} OPS last 14d`);
    if (last30HR != null) formParts.push(`${last30HR} HR last 30d`);

    const isHot = (last7HR ?? 0) >= 2 || (last7OPS ?? 0) >= 0.950;
    const isCold = (last7HR ?? 1) === 0 && (last7OPS ?? 1) < 0.650;

    contributions.push({
      feature: 'Recent Form',
      rawValue: formParts.join(', ') + (isHot ? ' 🔥 Hot' : isCold ? ' ❄️ Cold' : ''),
      adjustment: formMultiplier - 1.0,
      direction: isHot ? 'positive' : isCold ? 'negative' : 'neutral',
    });
  }

  // ── 4. Platoon Matchup ───────────────────────────────────────────────────────
  let platoonMultiplier = 1.0;
  let platoonAdvantage: PlatoonAdvantage = 'neutral';

  const bats = input.platoon?.bats;
  const pitcherThrows = input.platoon?.pitcherThrows ?? input.pitcher?.throws;

  if (bats && pitcherThrows) {
    dataPoints++;

    const isOpposite =
      (bats === 'L' && pitcherThrows === 'R') ||
      (bats === 'R' && pitcherThrows === 'L');

    const isSame =
      (bats === 'L' && pitcherThrows === 'L') ||
      (bats === 'R' && pitcherThrows === 'R');

    const relevantHR = pitcherThrows === 'L' ? input.platoon?.hrVsLeft : input.platoon?.hrVsRight;
    const relevantPA = pitcherThrows === 'L' ? input.platoon?.paVsLeft : input.platoon?.paVsRight;
    const relevantSLG = pitcherThrows === 'L' ? input.platoon?.slgVsLeft : input.platoon?.slgVsRight;
    const oppHR = pitcherThrows === 'L' ? input.platoon?.hrVsRight : input.platoon?.hrVsLeft;
    const oppPA = pitcherThrows === 'L' ? input.platoon?.paVsRight : input.platoon?.paVsLeft;

    let splitHRRate: number | null = null;
    let oppHRRate: number | null = null;

    if (relevantHR != null && relevantPA != null && relevantPA > 0) {
      splitHRRate = relevantHR / relevantPA;
    }

    if (oppHR != null && oppPA != null && oppPA > 0) {
      oppHRRate = oppHR / oppPA;
    }

    if (splitHRRate != null && oppHRRate != null && oppHRRate > 0) {
      const ratio = splitHRRate / oppHRRate;

      if (ratio >= 1.30) {
        platoonAdvantage = 'strong';
        platoonMultiplier = 1.12;
      } else if (ratio >= 1.12) {
        platoonAdvantage = 'moderate';
        platoonMultiplier = 1.06;
      } else if (ratio >= 0.90) {
        platoonAdvantage = 'neutral';
        platoonMultiplier = 1.0;
      } else {
        platoonAdvantage = 'disadvantage';
        platoonMultiplier = 0.92;
      }
    } else if (bats === 'S') {
      platoonAdvantage = 'moderate';
      platoonMultiplier = 1.05;
    } else if (isOpposite) {
      platoonAdvantage = 'moderate';
      platoonMultiplier = 1.05;
    } else if (isSame) {
      platoonAdvantage = 'disadvantage';
      platoonMultiplier = 0.94;
    }

    const slgDisplay =
      relevantSLG != null
        ? `, SLG .${Math.round(relevantSLG * 1000).toString().padStart(3, '0')} vs ${pitcherThrows}HP`
        : '';

    contributions.push({
      feature: 'Platoon Matchup',
      rawValue: `Bats ${bats} vs ${pitcherThrows}HP${slgDisplay}`,
      adjustment: platoonMultiplier - 1.0,
      direction:
        platoonAdvantage === 'strong' || platoonAdvantage === 'moderate'
          ? 'positive'
          : platoonAdvantage === 'disadvantage'
          ? 'negative'
          : 'neutral',
    });
  }

  // ── 5. Pitcher HR Tendency ───────────────────────────────────────────────────
  let pitcherMultiplier = 1.0;
  const hr9 = input.pitcher?.hr9 ?? input.pitcher?.recentHr9;
  const pitcherHrFbRate = input.pitcher?.hrFbRate;
  const fbPct = input.pitcher?.fbPct;

  if (hr9 != null || pitcherHrFbRate != null || fbPct != null) {
    dataPoints++;
    let pitcherScore = 1.0;

    if (hr9 != null) {
      pitcherScore *= hr9 >= 1.8 ? 1.16 : hr9 >= 1.4 ? 1.10 : hr9 >= 1.1 ? 1.04 : hr9 >= 0.8 ? 0.98 : 0.90;
    }

    if (pitcherHrFbRate != null) {
      pitcherScore *= pitcherHrFbRate >= 0.15 ? 1.10 : pitcherHrFbRate >= 0.12 ? 1.05 : pitcherHrFbRate >= 0.09 ? 1.0 : 0.94;
    }

    if (fbPct != null) {
      pitcherScore *= fbPct >= 48 ? 1.08 : fbPct >= 42 ? 1.03 : fbPct >= 35 ? 1.0 : 0.95;
    }

    pitcherMultiplier = clamp(pitcherScore, 0.88, 1.18);

    const pitcherParts: string[] = [];
    if (hr9 != null) pitcherParts.push(`${hr9.toFixed(2)} HR/9`);
    if (pitcherHrFbRate != null) pitcherParts.push(`${(pitcherHrFbRate * 100).toFixed(1)}% HR/FB`);
    if (fbPct != null) pitcherParts.push(`${fbPct.toFixed(1)}% FB rate`);

    contributions.push({
      feature: 'Pitcher HR Tendency',
      rawValue: pitcherParts.join(', '),
      adjustment: pitcherMultiplier - 1.0,
      direction:
        pitcherMultiplier >= 1.05 ? 'positive' : pitcherMultiplier <= 0.95 ? 'negative' : 'neutral',
    });
  }

  // ── 6. Ballpark Context ──────────────────────────────────────────────────────
  let parkMultiplier = 1.0;

  if (input.ballpark?.hrFactor != null) {
    dataPoints++;
    parkMultiplier = input.ballpark.hrFactor;

    if (input.ballpark.elevation != null && input.ballpark.elevation > 3000) {
      parkMultiplier *= 1.03;
    }

    parkMultiplier = clamp(parkMultiplier, 0.88, 1.18);

    const parkName = input.ballpark.name ?? 'This park';

    contributions.push({
      feature: 'Ballpark Factor',
      rawValue: `${parkName} HR factor ${input.ballpark.hrFactor.toFixed(2)}x${
        input.ballpark.elevation != null && input.ballpark.elevation > 3000
          ? ` (${input.ballpark.elevation.toLocaleString()} ft elevation)`
          : ''
      }`,
      adjustment: parkMultiplier - 1.0,
      direction: parkMultiplier >= 1.05 ? 'positive' : parkMultiplier <= 0.95 ? 'negative' : 'neutral',
    });
  }

  // ── 7. Weather / Wind Context ────────────────────────────────────────────────
  let weatherMultiplier = 1.0;
  const weather = input.weather;

  if (weather) {
    dataPoints++;
    let wScore = 1.0;

    if (weather.windToward === 'out' && (weather.windSpeed ?? 0) >= 8) {
      wScore *= weather.windSpeed! >= 15 ? 1.08 : 1.04;
    } else if (weather.windToward === 'in' && (weather.windSpeed ?? 0) >= 8) {
      wScore *= weather.windSpeed! >= 15 ? 0.90 : 0.95;
    }

    if (weather.temp != null) {
      wScore *= weather.temp >= 85 ? 1.05 : weather.temp >= 70 ? 1.02 : weather.temp <= 45 ? 0.95 : 1.0;
    }

    if (weather.hrImpact === 'positive') wScore = Math.max(wScore, 1.03);
    if (weather.hrImpact === 'negative') wScore = Math.min(wScore, 0.97);

    weatherMultiplier = clamp(wScore, 0.90, 1.10);

    const weatherParts: string[] = [];
    if (weather.temp != null) weatherParts.push(`${weather.temp}°F`);
    if (weather.windSpeed != null && weather.windToward) {
      const dir =
        weather.windToward === 'out'
          ? '↑ blowing out'
          : weather.windToward === 'in'
          ? '↓ blowing in'
          : weather.windToward === 'crosswind'
          ? '→ crosswind'
          : 'neutral';
      weatherParts.push(`${weather.windSpeed} mph ${dir}`);
    }

    contributions.push({
      feature: 'Weather / Wind',
      rawValue: weatherParts.join(', ') || 'Indoor/dome',
      adjustment: weatherMultiplier - 1.0,
      direction:
        weatherMultiplier >= 1.03 ? 'positive' : weatherMultiplier <= 0.97 ? 'negative' : 'neutral',
    });
  }

  // ── 8. Lineup Position ───────────────────────────────────────────────────────
  let lineupMultiplier = 1.0;
  const lineupPos = input.lineupPosition;
  const projectedAtBats = lineupPos != null ? (LINEUP_PA_MAP[lineupPos] ?? 3.8) : 3.8;

  if (lineupPos != null) {
    dataPoints++;

    if (lineupPos <= 2) lineupMultiplier = 1.04;
    else if (lineupPos <= 5) lineupMultiplier = 1.01;
    else lineupMultiplier = 0.97;

    contributions.push({
      feature: 'Lineup Position',
      rawValue: `Batting ${ordinal(lineupPos)} (${projectedAtBats.toFixed(1)} proj. PA)`,
      adjustment: lineupMultiplier - 1.0,
      direction: lineupPos <= 2 ? 'positive' : lineupPos >= 7 ? 'negative' : 'neutral',
    });
  }

  // ── 9. Team Offensive Context ────────────────────────────────────────────────
  let teamMultiplier = 1.0;

  if (
    input.teamOffense?.teamSeasonHR != null &&
    input.teamOffense?.teamGames != null &&
    input.teamOffense.teamGames > 0
  ) {
    dataPoints++;
    const teamHRPerGame = input.teamOffense.teamSeasonHR / input.teamOffense.teamGames;

    let offenseScore = 1.0;
    offenseScore *= teamHRPerGame >= 1.6 ? 1.06 : teamHRPerGame >= 1.35 ? 1.03 : teamHRPerGame >= 1.1 ? 1.0 : 0.97;

    if (input.teamOffense.teamOPS != null) {
      offenseScore *= input.teamOffense.teamOPS >= 0.780 ? 1.03 : input.teamOffense.teamOPS >= 0.720 ? 1.0 : 0.97;
    }

    teamMultiplier = clamp(offenseScore, 0.94, 1.08);

    contributions.push({
      feature: 'Team Offensive Context',
      rawValue: `Team ${input.teamOffense.teamSeasonHR} HR in ${input.teamOffense.teamGames} G (${teamHRPerGame.toFixed(2)}/G)${
        input.teamOffense.teamOPS != null ? `, OPS ${input.teamOffense.teamOPS.toFixed(3)}` : ''
      }`,
      adjustment: teamMultiplier - 1.0,
      direction:
        teamMultiplier >= 1.03 ? 'positive' : teamMultiplier <= 0.97 ? 'negative' : 'neutral',
    });
  }

  // ── Combine All Multipliers ──────────────────────────────────────────────────
  const rawMultiplier =
    powerMultiplier *
    statcastMultiplier *
    formMultiplier *
    platoonMultiplier *
    pitcherMultiplier *
    parkMultiplier *
    weatherMultiplier *
    lineupMultiplier *
    teamMultiplier;

  // Soft compression to prevent runaway stacking
  const multiplier = 1 + (rawMultiplier - 1) * 0.82;

  let hrProbability = LEAGUE_AVG_HR_PROB * multiplier;
  hrProbability = clamp(hrProbability, 1.0, 30.0);

  // ── Data Completeness & Confidence ──────────────────────────────────────────
  const dataCompleteness = dataPoints / totalPossiblePoints;

  let confidenceTier: ConfidenceTier;
  if (dataCompleteness >= 0.78 && hrProbability >= 18) confidenceTier = 'elite';
  else if (dataCompleteness >= 0.62 && hrProbability >= 13) confidenceTier = 'high';
  else if (dataCompleteness >= 0.38 && hrProbability >= 8) confidenceTier = 'medium';
  else confidenceTier = 'low';

  // ── Matchup Score (0–100) ────────────────────────────────────────────────────
  const pitcherScore = Math.min(100, Math.max(0, ((pitcherMultiplier - 0.88) / 0.30) * 100));
  const powerScore = Math.min(100, Math.max(0, ((statcastMultiplier - 0.88) / 0.30) * 100));
  const parkScore = Math.min(100, Math.max(0, ((parkMultiplier - 0.88) / 0.30) * 100));
  const formScore = Math.min(100, Math.max(0, ((formMultiplier - 0.90) / 0.26) * 100));

  const matchupScore = Math.round(
    pitcherScore * 0.28 + powerScore * 0.34 + parkScore * 0.18 + formScore * 0.20
  );

  // ── Select Top 3–5 Key Factors ───────────────────────────────────────────────
  const sortedContributions = [...contributions].sort(
    (a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment)
  );

  const keyFactors = sortedContributions.slice(0, 5).map((c) => {
    const sign = c.adjustment > 0.01 ? '+' : c.adjustment < -0.01 ? '−' : '~';
    const pct = Math.abs(c.adjustment * 100).toFixed(0);
    return `${c.feature}: ${c.rawValue} (${sign}${pct}%)`;
  });

  if (keyFactors.length < 3) {
    keyFactors.push('Limited data — prediction based on available inputs');
    if (keyFactors.length < 3) {
      keyFactors.push(`Base league-average HR probability: ${LEAGUE_AVG_HR_PROB}%`);
    }
  }

  return {
    batterId: input.batterId,
    batterName: input.batterName,
    hrProbability: round1(hrProbability),
    confidenceTier,
    platoonAdvantage,
    keyFactors,
    featureBreakdown: contributions,
    dataCompleteness,
    projectedAtBats,
    matchupScore,
    parkFactorUsed: round1(parkMultiplier),
    weatherImpactUsed: round1(weatherMultiplier),
  };
}

// ─── Batch Prediction ─────────────────────────────────────────────────────────

export function computeBatchPredictions(inputs: HRPredictionInput[]): HRPredictionOutput[] {
  return inputs
    .map((input) => computeHRProbability(input))
    .sort((a, b) => b.hrProbability - a.hrProbability);
}

// ─── Adapter: Convert app types to prediction inputs ──────────────────────────

export function buildPredictionInput(
  batter: Batter,
  pitcher: Pitcher | undefined,
  game: Game | undefined,
  ballpark: Ballpark | undefined
): HRPredictionInput {
  const pitcherThrows = pitcher?.throws;

  const platoonSplits: PlatoonSplits = {
    bats: batter?.bats,
    pitcherThrows,
    hrVsLeft: batter?.splits?.vsLeft?.hr,
    paVsLeft: batter?.splits?.vsLeft?.pa,
    hrVsRight: batter?.splits?.vsRight?.hr,
    paVsRight: batter?.splits?.vsRight?.pa,
    slgVsLeft: batter?.splits?.vsLeft?.slg,
    slgVsRight: batter?.splits?.vsRight?.slg,
  };

  // IMPORTANT:
  // We do NOT estimate team offense from the batter's own HR total anymore.
  // Only use real team data if your app already has it.
  const teamOffense: TeamOffensiveContext | undefined =
    game && (game as any)?.teamOffense
      ? {
          teamSeasonHR: (game as any).teamOffense.teamSeasonHR,
          teamGames: (game as any).teamOffense.teamGames,
          teamOPS: (game as any).teamOffense.teamOPS,
        }
      : undefined;

  return {
    batterId: batter?.id ?? '',
    batterName: batter?.name ?? 'Unknown',
    lineupPosition: batter?.lineupSpot ?? undefined,
    power: {
      seasonHR: batter?.season?.hr,
      seasonGames: batter?.season?.games,
      iso: batter?.season?.iso,
      barrelRate: batter?.statcast?.barrelRate,
      exitVelocityAvg: batter?.statcast?.exitVelocityAvg,
      hardHitRate: batter?.statcast?.hardHitRate,
      flyBallRate: batter?.statcast?.flyBallRate,
      hrFbRate: batter?.statcast?.hrFbRate,
      xSlugging: batter?.statcast?.xSlugging,
    },
    recentForm: {
      last7HR: batter?.last7?.hr,
      last7OPS: batter?.last7?.ops,
      last14HR: batter?.last14?.hr,
      last14OPS: batter?.last14?.ops,
      last30HR: batter?.last30?.hr,
    },
    platoon: platoonSplits,
    pitcher: pitcher
      ? {
          throws: pitcher.throws,
          hr9: pitcher.hr9,
          hrFbRate: pitcher.hrFbRate,
          fbPct: pitcher.fbPct,
          era: pitcher.era,
          recentHr9: pitcher.last7?.hr9,
        }
      : undefined,
    ballpark: ballpark
      ? {
          hrFactor: ballpark.hrFactor,
          elevation: ballpark.elevation,
          name: ballpark.name,
        }
      : undefined,
    weather: game?.weather
      ? {
          temp: game.weather.temp,
          windSpeed: game.weather.windSpeed,
          windToward: game.weather.windToward,
          hrImpact: game.weather.hrImpact,
          hrImpactScore: game.weather.hrImpactScore,
        }
      : undefined,
    teamOffense,
  };
}

// ─── Plain-English Explanation Generator ─────────────────────────────────────

export function generateExplanation(
  input: HRPredictionInput,
  output: HRPredictionOutput
): string {
  const sentences: string[] = [];
  const missing: string[] = [];

  const last7HR = input.recentForm?.last7HR;
  const last7OPS = input.recentForm?.last7OPS;
  const last14HR = input.recentForm?.last14HR;

  if (last7HR != null) {
    if (last7HR >= 3) {
      sentences.push(`${input.batterName} is in elite recent form with ${last7HR} HR over the last 7 days.`);
    } else if (last7HR >= 2) {
      sentences.push(`${input.batterName} has been hot lately, hitting ${last7HR} HR over the last 7 days.`);
    } else if (last7HR === 1) {
      sentences.push(`${input.batterName} has 1 HR over the last 7 days, showing moderate recent power.`);
    } else {
      const opsNote = last7OPS != null ? ` (${last7OPS.toFixed(3)} OPS)` : '';
      sentences.push(`${input.batterName} has gone homerless over the last 7 days${opsNote}, which tempers the projection.`);
    }
  } else if (last14HR != null) {
    sentences.push(`${input.batterName} has ${last14HR} HR over the last 14 days.`);
  } else {
    missing.push('recent form');
  }

  const barrelRate = input.power?.barrelRate;
  const exitVelo = input.power?.exitVelocityAvg;
  const iso = input.power?.iso;
  const seasonHR = input.power?.seasonHR;
  const seasonGames = input.power?.seasonGames;

  const powerParts: string[] = [];
  if (barrelRate != null) {
    if (barrelRate >= 14) powerParts.push(`elite Barrel% (${barrelRate.toFixed(1)}%)`);
    else if (barrelRate >= 8) powerParts.push(`solid Barrel% (${barrelRate.toFixed(1)}%)`);
    else powerParts.push(`below-average Barrel% (${barrelRate.toFixed(1)}%)`);
  }

  if (exitVelo != null) {
    if (exitVelo >= 92) powerParts.push(`strong exit velocity (${exitVelo.toFixed(1)} mph avg)`);
    else powerParts.push(`exit velocity of ${exitVelo.toFixed(1)} mph`);
  }

  if (iso != null) {
    const isoStr = `.${Math.round(iso * 1000).toString().padStart(3, '0')}`;
    if (iso >= 0.200) powerParts.push(`high ISO (${isoStr})`);
    else if (iso >= 0.140) powerParts.push(`average ISO (${isoStr})`);
    else powerParts.push(`low ISO (${isoStr})`);
  }

  if (powerParts.length > 0) {
    sentences.push(`His power profile shows ${powerParts.join(', ')}.`);
  } else if (seasonHR != null && seasonGames != null && seasonGames > 0) {
    const pace = Math.round((seasonHR / seasonGames) * 162);
    sentences.push(`He is on a ${pace}-HR pace this season (${seasonHR} HR in ${seasonGames} G).`);
  } else {
    missing.push('power indicators');
  }

  const bats = input.platoon?.bats;
  const pitcherThrows = input.platoon?.pitcherThrows ?? input.pitcher?.throws;

  if (bats && pitcherThrows) {
    const adv = output.platoonAdvantage;
    const matchupDesc =
      adv === 'strong'
        ? 'a strong platoon advantage'
        : adv === 'moderate'
        ? 'a moderate platoon advantage'
        : adv === 'disadvantage'
        ? 'a platoon disadvantage'
        : 'a neutral platoon matchup';

    const relevantHR = pitcherThrows === 'L' ? input.platoon?.hrVsLeft : input.platoon?.hrVsRight;
    const relevantPA = pitcherThrows === 'L' ? input.platoon?.paVsLeft : input.platoon?.paVsRight;
    const relevantSLG = pitcherThrows === 'L' ? input.platoon?.slgVsLeft : input.platoon?.slgVsRight;

    let splitNote = '';
    if (relevantHR != null && relevantPA != null && relevantPA > 0) {
      const rate = ((relevantHR / relevantPA) * 100).toFixed(1);
      splitNote = ` (${relevantHR} HR in ${relevantPA} PA vs ${pitcherThrows}HP, ${rate}% HR rate)`;
    } else if (relevantSLG != null) {
      splitNote = ` (.${Math.round(relevantSLG * 1000).toString().padStart(3, '0')} SLG vs ${pitcherThrows}HP)`;
    }

    sentences.push(`Facing a ${pitcherThrows}HP as a ${bats === 'S' ? 'switch hitter' : `${bats}HB`} gives him ${matchupDesc}${splitNote}.`);
  } else {
    missing.push('handedness matchup');
  }

  const hr9 = input.pitcher?.hr9 ?? input.pitcher?.recentHr9;
  const pitcherHrFb = input.pitcher?.hrFbRate;
  const pitcherFbPct = input.pitcher?.fbPct;
  const pitcherEra = input.pitcher?.era;

  if (hr9 != null || pitcherHrFb != null || pitcherFbPct != null) {
    const pitcherParts: string[] = [];
    if (hr9 != null) {
      if (hr9 >= 1.5) pitcherParts.push(`HR-prone (${hr9.toFixed(2)} HR/9)`);
      else if (hr9 >= 1.0) pitcherParts.push(`average HR rate (${hr9.toFixed(2)} HR/9)`);
      else pitcherParts.push(`stingy on HRs (${hr9.toFixed(2)} HR/9)`);
    }
    if (pitcherHrFb != null) {
      pitcherParts.push(`${(pitcherHrFb * 100).toFixed(1)}% HR/FB rate`);
    }
    if (pitcherFbPct != null) {
      if (pitcherFbPct >= 45) pitcherParts.push(`high fly-ball rate (${pitcherFbPct.toFixed(0)}%)`);
      else if (pitcherFbPct <= 35) pitcherParts.push(`low fly-ball rate (${pitcherFbPct.toFixed(0)}%)`);
    }
    const eraNote = pitcherEra != null ? ` with a ${pitcherEra.toFixed(2)} ERA` : '';
    sentences.push(`The opposing pitcher is ${pitcherParts.join(', ')}${eraNote}.`);
  } else {
    missing.push('pitcher profile');
  }

  const lineupPos = input.lineupPosition;
  if (lineupPos != null) {
    const pa = output.projectedAtBats.toFixed(1);
    const slotDesc =
      lineupPos <= 2
        ? 'at the top of the order, projecting more plate appearances'
        : lineupPos <= 5
        ? 'in the heart of the order'
        : 'lower in the lineup, limiting projected PA';
    sentences.push(`He bats ${ordinal(lineupPos)} ${slotDesc} (~${pa} PA today).`);
  } else {
    missing.push('lineup slot');
  }

  const weather = input.weather;
  if (weather) {
    const weatherParts: string[] = [];
    if (weather.temp != null) {
      if (weather.temp >= 80) weatherParts.push(`warm conditions (${weather.temp}°F)`);
      else if (weather.temp <= 50) weatherParts.push(`cold conditions (${weather.temp}°F)`);
      else weatherParts.push(`${weather.temp}°F`);
    }
    if (weather.windSpeed != null && weather.windToward && weather.windToward !== 'neutral') {
      const dir =
        weather.windToward === 'out'
          ? `${weather.windSpeed} mph blowing out (HR-friendly)`
          : weather.windToward === 'in'
          ? `${weather.windSpeed} mph blowing in (HR-suppressing)`
          : `${weather.windSpeed} mph crosswind`;
      weatherParts.push(dir);
    }
    if (weatherParts.length > 0) {
      const impact =
        output.weatherImpactUsed >= 1.05
          ? ' — a meaningful boost for power hitters.'
          : output.weatherImpactUsed <= 0.95
          ? ' — conditions work against long balls today.'
          : ' — weather is roughly neutral.';
      sentences.push(`Weather: ${weatherParts.join(', ')}${impact}`);
    }
  } else {
    missing.push('weather');
  }

  const ballpark = input.ballpark;
  if (ballpark?.hrFactor != null) {
    const parkName = ballpark.name ?? 'This park';
    const factor = ballpark.hrFactor;
    const elevNote =
      ballpark.elevation != null && ballpark.elevation > 3000
        ? ` at ${ballpark.elevation.toLocaleString()} ft elevation`
        : '';

    if (factor >= 1.15) {
      sentences.push(`${parkName}${elevNote} is one of the most HR-friendly venues in baseball (${factor.toFixed(2)}x factor).`);
    } else if (factor >= 1.05) {
      sentences.push(`${parkName}${elevNote} plays slightly above average for home runs (${factor.toFixed(2)}x factor).`);
    } else if (factor <= 0.88) {
      sentences.push(`${parkName}${elevNote} is a pitcher-friendly park that suppresses home runs (${factor.toFixed(2)}x factor).`);
    } else {
      sentences.push(`${parkName}${elevNote} is a neutral park for home runs (${factor.toFixed(2)}x factor).`);
    }
  } else {
    missing.push('park context');
  }

  if (missing.length > 0) {
    sentences.push(
      `Note: ${missing.join(', ')} ${missing.length === 1 ? 'was' : 'were'} not available and ${
        missing.length === 1 ? 'defaults' : 'default'
      } to league-average assumptions.`
    );
  }

  return sentences.join(' ');
}
