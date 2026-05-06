"use client";

import Link from "next/link";
import { ArrowUpRight, CloudRain, Info, Thermometer, Wind } from "lucide-react";
import {
  formatProbabilityPercent,
  HR_CHANCE_LABEL,
} from "@/services/hrChanceDisplay";
import { getTeamAbbreviation } from "@/services/mlbTeamMetadata";

type FeaturedRow = {
  rank: number;
  batterId: string;
  batterName: string;
  batterPosition: string | null;
  batterBats: "L" | "R" | "S" | null;
  lineupSpot: number | null;
  teamId: string;
  opponentTeamId: string;
  awayTeamId: string;
  homeTeamId: string;
  gameId: string;
  gamePk: string;
  gameTime: string | null;
  matchupLabel: string;
  venueName: string | null;
  ballparkName: string | null;
  opposingPitcherName: string | null;
  opposingPitcherThrows: "L" | "R" | null;
  calibratedHrProbability: number;
  predictedProbability: number;
  tier: string;
  hrTier:
    | "Tier 1 - Core"
    | "Tier 2 - Strong"
    | "Tier 3 - Value/Longshot"
    | "Tier 4 - Fringe";
  hrTierReason: string;
  modelEdge: number | null;
  valueScore: number | null;
  valueTier: "Positive Value" | "Fair" | "Overpriced" | "No Odds";
  lineupConfirmed: boolean;
  environment: {
    temp: number | null;
    condition: string | null;
    windSpeed: number | null;
    windDirection: string | null;
    windToward: "in" | "out" | "crosswind" | "neutral" | null;
    windOutToCenter: number | null;
    windInFromCenter: number | null;
    crosswind: number | null;
    precipitation: number | null;
    hrImpact: "positive" | "neutral" | "negative" | null;
    hrImpactScore: number | null;
    parkHrFactor: number;
  };
  features: {
    barrelRate: number;
    iso: number;
    pitcherHr9: number;
    projectedAtBats: number;
    platoonEdge: number;
  };
};

interface FeaturedHRTargetCardProps {
  row: FeaturedRow;
  researchHref: string;
}

type ExplanationType =
  | "elite_power_play"
  | "solid_power_play"
  | "matchup_play"
  | "environment_play"
  | "balanced_play"
  | "thin_play";

type ExplanationContent = {
  type: ExplanationType;
  summary: string;
  bullets: string[];
};

type EnvironmentLabel =
  | "Favorable"
  | "Playable"
  | "Neutral"
  | "Suppressed"
  | "Rain Risk";

const DEFAULT_ENVIRONMENT: FeaturedRow["environment"] = {
  temp: null,
  condition: null,
  windSpeed: null,
  windDirection: null,
  windToward: "neutral",
  windOutToCenter: null,
  windInFromCenter: null,
  crosswind: null,
  precipitation: null,
  hrImpact: "neutral",
  hrImpactScore: null,
  parkHrFactor: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
  return value.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getTierClass(tier: string): string {
  if (tier.startsWith("Elite"))
    return "border-amber-400/30 bg-amber-400/15 text-amber-300";
  if (tier.startsWith("Strong"))
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  if (tier.startsWith("Solid"))
    return "border-blue-500/30 bg-blue-500/15 text-blue-300";
  return "border-slate-500/30 bg-slate-500/15 text-slate-300";
}

function getHrTierClass(tier: FeaturedRow["hrTier"]): string {
  if (tier === "Tier 1 - Core")
    return "border-amber-400/30 bg-amber-400/15 text-amber-300";
  if (tier === "Tier 2 - Strong")
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  if (tier === "Tier 3 - Value/Longshot")
    return "border-blue-500/30 bg-blue-500/15 text-blue-300";
  return "border-slate-500/30 bg-slate-500/15 text-slate-300";
}

function getValueTierClass(tier: FeaturedRow["valueTier"]): string {
  if (tier === "Positive Value")
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  if (tier === "Fair")
    return "border-blue-500/30 bg-blue-500/15 text-blue-300";
  if (tier === "Overpriced")
    return "border-rose-500/30 bg-rose-500/15 text-rose-300";
  return "border-surface-300 bg-surface-700 text-slate-300";
}

function getProbabilityClass(value: number): string {
  if (value >= 0.25) return "text-amber-300";
  if (value >= 0.18) return "text-emerald-300";
  if (value >= 0.12) return "text-blue-300";
  return "text-slate-300";
}

function getThrowsBadgeClass(value: "L" | "R" | null): string {
  if (value === "L") return "border-blue-500/30 bg-blue-500/15 text-blue-300";
  if (value === "R")
    return "border-orange-500/30 bg-orange-500/15 text-orange-300";
  return "border-surface-300 bg-surface-700 text-slate-300";
}

function getLineupStatusClass(lineupConfirmed: boolean): string {
  if (lineupConfirmed) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  return "border-slate-500/30 bg-slate-500/10 text-slate-200";
}

function getLineupStatusLabel(lineupConfirmed: boolean): string {
  return lineupConfirmed ? "Confirmed" : "Projected";
}

function getEnvironment(row: FeaturedRow): FeaturedRow["environment"] {
  return row.environment ?? DEFAULT_ENVIRONMENT;
}

function hasRainRisk(row: FeaturedRow): boolean {
  const environment = getEnvironment(row);
  const condition = (environment.condition ?? "").toLowerCase();
  return (
    (environment.precipitation ?? 0) >= 0.12 ||
    condition.includes("rain") ||
    condition.includes("storm")
  );
}

function getWindScoreAdjustment(row: FeaturedRow): number {
  const environment = getEnvironment(row);
  const outComponent = environment.windOutToCenter ?? 0;
  const inComponent = environment.windInFromCenter ?? 0;
  const crossComponent = Math.abs(environment.crosswind ?? 0);

  const outBoost = Math.min(outComponent * 1.35, 15);
  const inPenalty = Math.min(inComponent * 1.75, 15);
  const crossEffect = Math.min(crossComponent * 0.2, 2);

  return outBoost - inPenalty + crossEffect;
}

function getEnvironmentScore(row: FeaturedRow): number {
  const environment = getEnvironment(row);
  const weatherBase =
    environment.hrImpactScore != null ? 50 + environment.hrImpactScore * 5 : 50;
  const parkBase = 50 + (environment.parkHrFactor - 1) * 120;
  const rainPenalty = Math.min((environment.precipitation ?? 0) * 35, 24);
  const windAdjustment = getWindScoreAdjustment(row);
  const blendedBase = weatherBase * 0.56 + parkBase * 0.24 + 10;

  return Math.round(clamp(blendedBase + windAdjustment - rainPenalty, 0, 100));
}

function getEnvironmentLabel(row: FeaturedRow): EnvironmentLabel {
  const score = getEnvironmentScore(row);

  if (hasRainRisk(row) && score < 72) return "Rain Risk";
  if (score >= 78) return "Favorable";
  if (score >= 62) return "Playable";
  if (score >= 45) return "Neutral";
  return "Suppressed";
}

function getEnvironmentClass(label: EnvironmentLabel): string {
  if (label === "Favorable")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (label === "Playable")
    return "border-blue-500/30 bg-blue-500/10 text-blue-200";
  if (label === "Neutral")
    return "border-slate-500/30 bg-slate-500/10 text-slate-200";
  if (label === "Rain Risk")
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-rose-500/30 bg-rose-500/10 text-rose-200";
}

function getEnvironmentScoreClass(label: EnvironmentLabel): string {
  if (label === "Favorable" || label === "Playable") return "text-emerald-300";
  if (label === "Neutral") return "text-slate-300";
  if (label === "Rain Risk") return "text-amber-300";
  return "text-rose-300";
}

function getWindDescriptor(row: FeaturedRow): string {
  const environment = getEnvironment(row);
  const outComponent = environment.windOutToCenter ?? 0;
  const inComponent = environment.windInFromCenter ?? 0;
  const crossComponent = environment.crosswind ?? 0;
  const crossStrength = Math.abs(crossComponent);

  if (outComponent < 1 && inComponent < 1 && crossStrength < 1) {
    return "Calm";
  }

  if (outComponent >= 2) {
    if (crossComponent >= 2) return "out to LF";
    if (crossComponent <= -2) return "out to RF";
    return "out to CF";
  }

  if (inComponent >= 2) {
    if (crossComponent >= 2) return "in from RF";
    if (crossComponent <= -2) return "in from LF";
    return "in from CF";
  }

  if (crossComponent >= 2) return "cross to LF";
  if (crossComponent <= -2) return "cross to RF";
  return "Neutral";
}

function getWindText(row: FeaturedRow): string {
  const windSpeed = getEnvironment(row).windSpeed ?? 0;
  const descriptor = getWindDescriptor(row);
  if (windSpeed <= 0 || descriptor === "Calm") return "Calm air";
  if (descriptor === "Neutral") return `${windSpeed.toFixed(0)} mph neutral`;
  return `${windSpeed.toFixed(0)} mph ${descriptor}`;
}

function getWindHeadline(row: FeaturedRow): string {
  const environment = getEnvironment(row);
  const descriptor = getWindDescriptor(row);

  if (descriptor === "Calm" || (environment.windSpeed ?? 0) <= 0) {
    return "CALM";
  }

  if (descriptor === "Neutral") {
    return `NEUTRAL (${(environment.windSpeed ?? 0).toFixed(0)} mph)`;
  }

  return `${descriptor.toUpperCase()} (${(environment.windSpeed ?? 0).toFixed(0)} mph)`;
}

function getWindImpactLabel(row: FeaturedRow): string {
  const environment = getEnvironment(row);
  if ((environment.windOutToCenter ?? 0) >= 4) return "Helping wind";
  if ((environment.windInFromCenter ?? 0) >= 4) return "Suppressing wind";
  if (Math.abs(environment.crosswind ?? 0) >= 4) return "Neutral wind";
  return "Neutral wind";
}

function getWindLanguageType(
  row: FeaturedRow,
): "out" | "in" | "cross" | "neutral" {
  const environment = getEnvironment(row);
  if ((environment.windOutToCenter ?? 0) >= 4) return "out";
  if ((environment.windInFromCenter ?? 0) >= 4) return "in";
  if (Math.abs(environment.crosswind ?? 0) >= 4) return "cross";
  return "neutral";
}

function getRainRiskPercent(row: FeaturedRow): number {
  const environment = getEnvironment(row);
  const precipitation = environment.precipitation ?? 0;
  const condition = (environment.condition ?? "").toLowerCase();
  let estimate = clamp(precipitation * 100, 0, 100);

  if (condition.includes("storm")) estimate = Math.max(estimate, 65);
  else if (condition.includes("rain")) estimate = Math.max(estimate, 35);

  return Math.round(estimate);
}

function getRainText(row: FeaturedRow): string {
  const rainRisk = getRainRiskPercent(row);
  if (rainRisk >= 45) return `${rainRisk}% rain risk`;
  if (rainRisk > 0) return `${rainRisk}% light rain risk`;
  return "0% rain risk";
}

function getPlayType(row: FeaturedRow): ExplanationType {
  const environment = getEnvironment(row);
  const lowPower = row.features.iso < 0.17 && row.features.barrelRate < 9.5;
  const helpingWind =
    (environment.windOutToCenter ?? 0) >= 4 || environment.windToward === "out";
  const windSpeed = environment.windSpeed ?? 0;

  if (lowPower) {
    return "thin_play";
  }

  if (row.features.iso >= 0.26 || row.features.barrelRate >= 18) {
    return "elite_power_play";
  }

  if (row.features.iso >= 0.18 || row.features.barrelRate >= 12) {
    return "solid_power_play";
  }

  if (row.features.pitcherHr9 >= 1.5) {
    return "matchup_play";
  }

  if (helpingWind && windSpeed >= 8) {
    return "environment_play";
  }

  return "balanced_play";
}

function buildExplanation(row: FeaturedRow): ExplanationContent {
  const environment = getEnvironment(row);
  const bullets: string[] = [];
  const contactIsStrong = row.features.barrelRate >= 13.5;
  const isoIsStrong = row.features.iso >= 0.22;
  const powerIsStrong = contactIsStrong || isoIsStrong;
  const pitcherRisky = row.features.pitcherHr9 >= 1.35;
  const pitcherPlayable = row.features.pitcherHr9 >= 1.1;
  const volumeStrong = row.features.projectedAtBats >= 4.1;
  const volumeFine = row.features.projectedAtBats >= 3.8;
  const envLabel = getEnvironmentLabel(row);
  const platoonLean = row.features.platoonEdge >= 1;
  const helpingEnvironment =
    envLabel === "Favorable" ||
    (environment.windOutToCenter ?? 0) >= 5 ||
    environment.parkHrFactor >= 1.08;
  const suppressingEnvironment =
    envLabel === "Suppressed" ||
    envLabel === "Rain Risk" ||
    (environment.windInFromCenter ?? 0) >= 5;
  const thinPower = row.features.barrelRate < 9.5 && row.features.iso < 0.17;
  const type = getPlayType(row);
  const lowPowerLanguage =
    row.features.barrelRate < 8 && row.features.iso < 0.2;
  const windLanguageType = getWindLanguageType(row);

  const neutralWeatherLine = "Weather is mostly neutral.";
  const helpfulWeatherLine =
    windLanguageType === "out"
      ? `${getWindHeadline(row)} adds a small boost to the HR outlook.`
      : windLanguageType === "cross"
        ? `${getWindHeadline(row)} looks mostly neutral.`
        : `${getWindHeadline(row)} does not meaningfully change the spot.`;
  const suppressingWeatherLine =
    envLabel === "Rain Risk"
      ? "Rain risk is part of the story, so confidence is lower than the raw rank suggests."
      : windLanguageType === "in"
        ? `${getWindHeadline(row)} is a mild suppressing factor.`
        : windLanguageType === "cross"
          ? `${getWindHeadline(row)} looks mostly neutral.`
          : `${getWindHeadline(row)} takes a bit away from the HR environment.`;

  if (type === "elite_power_play") {
    const summaries = [
      "This is top-shelf power.",
      "The bat can carry the ticket on its own.",
    ];
    bullets.push(
      contactIsStrong && isoIsStrong
        ? `${row.features.barrelRate.toFixed(1)}% barrels plus a ${row.features.iso.toFixed(3)} ISO is elite HR juice.`
        : contactIsStrong
          ? `${row.features.barrelRate.toFixed(1)}% barrels put him in the true damage-bat tier.`
          : `${row.features.iso.toFixed(3)} ISO is the kind of raw power that does not need much help.`,
    );
    bullets.push(
      volumeStrong || volumeFine
        ? `${row.features.projectedAtBats.toFixed(1)} projected ABs only raise the ceiling.`
        : "Even with lighter volume, the power alone keeps him live.",
    );
    return {
      type,
      summary: summaries[hashString(row.batterId) % summaries.length],
      bullets: bullets.slice(0, 2),
    };
  }

  if (type === "solid_power_play") {
    const summaries = [
      lowPowerLanguage
        ? "There is enough power here to keep the HR path viable."
        : "This is a solid power spot with some support behind it.",
      lowPowerLanguage
        ? "The bat can still get there, but it needs the setup to help."
        : "The power is real, but it still wants some help around it.",
    ];
    bullets.push(
      lowPowerLanguage
        ? `The bat has just enough pop to make the rest of the setup matter at ${row.features.barrelRate.toFixed(1)}% barrels and ${row.features.iso.toFixed(3)} ISO.`
        : row.features.iso >= 0.18 && row.features.barrelRate >= 12
          ? `${row.features.barrelRate.toFixed(1)}% barrels and a ${row.features.iso.toFixed(3)} ISO make the power case legit, even if it is not elite.`
          : row.features.barrelRate >= 12
            ? `${row.features.barrelRate.toFixed(1)}% barrels are enough to keep the HR path real.`
            : `${row.features.iso.toFixed(3)} ISO gives him enough pop to stay live, but this spot still wants support.`,
    );
    bullets.push(
      helpingEnvironment
        ? helpfulWeatherLine
        : pitcherRisky
          ? lowPowerLanguage
            ? `This spot leans more on matchup than pure thump with ${row.features.pitcherHr9.toFixed(2)} HR/9 on the other side.`
            : `The matchup adds support with ${row.features.pitcherHr9.toFixed(2)} HR/9 on the other side.`
          : volumeStrong || volumeFine
            ? `${row.features.projectedAtBats.toFixed(1)} projected ABs add needed volume to the HR outlook.`
            : neutralWeatherLine,
    );
    return {
      type,
      summary: summaries[hashString(row.batterId) % summaries.length],
      bullets: bullets.slice(0, 2),
    };
  }

  if (type === "matchup_play") {
    const summaries = [
      "Pitcher vulnerability is doing the selling here.",
      "The matchup is carrying this play.",
    ];
    bullets.push(
      `The opposing pitcher is allowing ${row.features.pitcherHr9.toFixed(2)} HR/9, so the opening is obvious.`,
    );
    bullets.push(
      volumeStrong || platoonLean
        ? volumeStrong
          ? `${row.features.projectedAtBats.toFixed(1)} projected ABs give the hitter enough chances to cash in on that weakness.`
          : "The handedness angle gives the matchup a little more bite."
        : lowPowerLanguage
          ? `The bat has just enough pop to make the matchup matter at ${row.features.barrelRate.toFixed(1)}% barrels and ${row.features.iso.toFixed(3)} ISO.`
          : `The hitter only needs average damage traits to capitalize, and ${row.features.barrelRate.toFixed(1)}% barrels with ${row.features.iso.toFixed(3)} ISO clear that bar.`,
    );
    bullets.push(
      helpingEnvironment
        ? helpfulWeatherLine
        : suppressingEnvironment
          ? suppressingWeatherLine
          : neutralWeatherLine,
    );
    return {
      type,
      summary: summaries[hashString(row.batterId) % summaries.length],
      bullets: bullets.slice(0, 2),
    };
  }

  if (type === "environment_play") {
    const summaries = [
      "Conditions are doing real work here.",
      "Weather and park are pushing this card up the board.",
    ];
    bullets.push(
      `${getWindHeadline(row)} is the main reason the spot gets a bump.`,
    );
    bullets.push(
      environment.parkHrFactor >= 1.08
        ? `The park leans favorable too at ${environment.parkHrFactor.toFixed(2)}x.`
        : powerIsStrong
          ? `There is still enough bat behind it with ${row.features.barrelRate.toFixed(1)}% barrels and ${row.features.iso.toFixed(3)} ISO.`
          : `The matchup is live enough with ${row.features.pitcherHr9.toFixed(2)} HR/9 allowed by the pitcher.`,
    );
    return {
      type,
      summary: summaries[hashString(row.batterId) % summaries.length],
      bullets: bullets.slice(0, 2),
    };
  }

  if (type === "thin_play") {
    const summaries = [
      "Risk is part of the price of entry here.",
      "This is a thinner card than the top tier names.",
    ];
    bullets.push(
      thinPower
        ? `The raw power is lighter at ${row.features.barrelRate.toFixed(1)}% barrels and ${row.features.iso.toFixed(3)} ISO.`
        : "No single edge is big enough to make this feel comfortable.",
    );
    bullets.push(
      suppressingEnvironment
        ? suppressingWeatherLine
        : pitcherPlayable
          ? "The matchup is fine, but not strong enough to erase the downside."
          : "The setup does not leave much room for a bad swing path.",
    );
    bullets.push(
      volumeStrong
        ? `${row.features.projectedAtBats.toFixed(1)} projected ABs are the main reason it still stays on the radar.`
        : "This is the kind of play that needs a very efficient swing outcome.",
    );
    return {
      type,
      summary: summaries[hashString(row.batterId) % summaries.length],
      bullets: bullets.slice(0, 2),
    };
  }

  const summaries = [
    "Nothing dominates the case, but a few things add up.",
    "This lands in the balanced bucket.",
  ];
  bullets.push(
    powerIsStrong
      ? `The bat brings enough thump with ${row.features.barrelRate.toFixed(1)}% barrels and ${row.features.iso.toFixed(3)} ISO.`
      : "The hitter has enough playable pop to stay involved.",
  );
  bullets.push(
    pitcherRisky
      ? `The pitcher adds support at ${row.features.pitcherHr9.toFixed(2)} HR/9.`
      : volumeStrong || volumeFine
        ? `${row.features.projectedAtBats.toFixed(1)} projected ABs keep the opportunity side solid.`
        : "Matchup and opportunity both stay serviceable.",
  );
  if (helpingEnvironment || suppressingEnvironment) {
    bullets.push(
      helpingEnvironment ? helpfulWeatherLine : suppressingWeatherLine,
    );
  }
  return {
    type,
    summary: summaries[hashString(row.batterId) % summaries.length],
    bullets: bullets.slice(0, 2),
  };
}

function getPlayTypeTag(type: ExplanationType): {
  label: string;
  className: string;
} {
  if (type === "elite_power_play") {
    return {
      label: "Power Play",
      className: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    };
  }
  if (type === "solid_power_play") {
    return {
      label: "Support Play",
      className: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    };
  }
  if (type === "matchup_play") {
    return {
      label: "Matchup Play",
      className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (type === "environment_play") {
    return {
      label: "Environment Play",
      className: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
    };
  }
  return {
    label: "Thin Play",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  };
}

const USE_COMPACT_FIELD_WIND_LAYOUT = true;

function EnvironmentHeader({
  score,
  label,
  ballparkName,
}: {
  score: number;
  label: EnvironmentLabel;
  ballparkName: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Environment
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-slate-100">
            <span>Environment Score</span>
            <span className="px-2 text-slate-500">-</span>
            <span className={getEnvironmentScoreClass(label)}>{score}</span>
          </p>
          <span
            className={`rounded-full border px-2 py-1 text-xs font-medium ${getEnvironmentClass(label)}`}
          >
            {label}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          {ballparkName ?? "Ballpark context"}
        </p>
      </div>
    </div>
  );
}

function FieldWindBox({
  row,
  vector,
  arrowHead,
  windHeadline,
  windImpactLabel,
  windAccentClass,
}: {
  row: FeaturedRow;
  vector: ReturnType<typeof getWindVector>;
  arrowHead: string;
  windHeadline: string;
  windImpactLabel: string;
  windAccentClass: string;
}) {
  return (
    <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 96 96" className="h-28 w-28">
          <path
            d="M48 12 L80 36 L68 74 L28 74 L16 36 Z"
            fill="rgba(34,197,94,0.08)"
            stroke="rgba(148,163,184,0.35)"
            strokeWidth="1.6"
          />
          <path
            d="M48 58 L56 66 L48 74 L40 66 Z"
            fill="rgba(148,163,184,0.28)"
            stroke="rgba(148,163,184,0.45)"
            strokeWidth="1.2"
          />
          <path
            d="M48 58 L48 18"
            stroke="rgba(59,130,246,0.22)"
            strokeDasharray="3 3"
          />
          <circle cx="48" cy="48" r="22" fill={vector.glow} />
          <path
            d={`M${vector.x1} ${vector.y1} L${vector.x2} ${vector.y2}`}
            stroke={vector.color}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <polygon points={arrowHead} fill={vector.color} />
        </svg>
      </div>
      <div className="mt-2 text-center">
        <p
          className={`text-sm font-semibold uppercase tracking-[0.08em] ${windAccentClass}`}
        >
          {windHeadline}
        </p>
        <p className="mt-1 text-xs text-slate-500">{windImpactLabel}</p>
      </div>
    </div>
  );
}

function getWindVector(row: FeaturedRow) {
  const environment = getEnvironment(row);
  const dx = clamp((environment.crosswind ?? 0) * 2.4, -26, 26);
  const dy = clamp(
    ((environment.windInFromCenter ?? 0) - (environment.windOutToCenter ?? 0)) *
      2.4,
    -30,
    30,
  );
  const magnitude = Math.abs(dx) + Math.abs(dy);

  if (magnitude < 4) {
    return {
      x1: 40,
      y1: 40,
      x2: 40,
      y2: 40,
      color: "rgb(148,163,184)",
      glow: "rgba(148,163,184,0.18)",
    };
  }

  const x1 = 40 - dx * 0.45;
  const y1 = 40 - dy * 0.45;
  const x2 = 40 + dx * 0.55;
  const y2 = 40 + dy * 0.55;
  const color =
    dy <= -5
      ? "rgb(74,222,128)"
      : dy >= 5
        ? "rgb(251,146,60)"
        : "rgb(125,211,252)";
  const glow =
    dy <= -5
      ? "rgba(74,222,128,0.22)"
      : dy >= 5
        ? "rgba(251,146,60,0.22)"
        : "rgba(125,211,252,0.18)";

  return { x1, y1, x2, y2, color, glow };
}

function getWindArrowHead(vector: ReturnType<typeof getWindVector>) {
  const angle = Math.atan2(vector.y2 - vector.y1, vector.x2 - vector.x1);
  const size = 8;
  const leftX = vector.x2 - size * Math.cos(angle - Math.PI / 6);
  const leftY = vector.y2 - size * Math.sin(angle - Math.PI / 6);
  const rightX = vector.x2 - size * Math.cos(angle + Math.PI / 6);
  const rightY = vector.y2 - size * Math.sin(angle + Math.PI / 6);

  return `${leftX},${leftY} ${vector.x2},${vector.y2} ${rightX},${rightY}`;
}

function getWindAccentClass(row: FeaturedRow): string {
  const environment = getEnvironment(row);
  if ((environment.windOutToCenter ?? 0) >= 4) return "text-emerald-300";
  if ((environment.windInFromCenter ?? 0) >= 4) return "text-orange-300";
  return "text-sky-300";
}

function InfoTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        aria-label={`${label} info`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-200 focus-visible:text-slate-100"
      >
        <Info size={12} />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-surface-300 bg-surface-900 px-3 py-2 text-[11px] normal-case leading-relaxed text-slate-200 shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function StatTile({
  label,
  tooltip,
  value,
}: {
  label: string;
  tooltip: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-surface-400 bg-surface-700/80 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <InfoTooltip label={label} text={tooltip} />
      </div>
      <p className="mt-2 text-base font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function EnvironmentField({ row }: { row: FeaturedRow }) {
  const environment = getEnvironment(row);
  const score = getEnvironmentScore(row);
  const label = getEnvironmentLabel(row);
  const venueLabel = row.venueName ?? row.ballparkName ?? "Venue TBD";
  const vector = getWindVector(row);
  const arrowHead = getWindArrowHead(vector);
  const windAccentClass = getWindAccentClass(row);
  const windHeadline = getWindHeadline(row);
  const windImpactLabel = getWindImpactLabel(row);

  return (
    <div className="rounded-2xl border border-surface-400 bg-surface-700/70 p-4">
      <EnvironmentHeader
        score={score}
        label={label}
        ballparkName={venueLabel}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
        {USE_COMPACT_FIELD_WIND_LAYOUT ? (
          <FieldWindBox
            row={row}
            vector={vector}
            arrowHead={arrowHead}
            windHeadline={windHeadline}
            windImpactLabel={windImpactLabel}
            windAccentClass={windAccentClass}
          />
        ) : (
          <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-3">
            <div className="flex items-center justify-center">
              <svg viewBox="0 0 96 96" className="h-28 w-28">
                <path
                  d="M48 12 L80 36 L68 74 L28 74 L16 36 Z"
                  fill="rgba(34,197,94,0.08)"
                  stroke="rgba(148,163,184,0.35)"
                  strokeWidth="1.6"
                />
                <path
                  d="M48 58 L56 66 L48 74 L40 66 Z"
                  fill="rgba(148,163,184,0.28)"
                  stroke="rgba(148,163,184,0.45)"
                  strokeWidth="1.2"
                />
                <path
                  d="M48 58 L48 18"
                  stroke="rgba(59,130,246,0.22)"
                  strokeDasharray="3 3"
                />
                <circle cx="48" cy="48" r="22" fill={vector.glow} />
                <path
                  d={`M${vector.x1} ${vector.y1} L${vector.x2} ${vector.y2}`}
                  stroke={vector.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <polygon points={arrowHead} fill={vector.color} />
              </svg>
            </div>
          </div>
        )}

        <div
          className={`grid gap-3 ${USE_COMPACT_FIELD_WIND_LAYOUT ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
        >
          <div className="rounded-xl border border-surface-400 bg-surface-800/60 px-3 py-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Thermometer size={14} />
              <span className="text-xs uppercase tracking-wide">Temp</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {environment.temp != null
                ? `${environment.temp.toFixed(0)} F`
                : "--"}
            </p>
          </div>
          {!USE_COMPACT_FIELD_WIND_LAYOUT && (
            <div className="rounded-xl border border-surface-400 bg-surface-800/60 px-3 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Wind size={14} />
                <span className="text-xs uppercase tracking-wide">Wind</span>
              </div>
              <p
                className={`mt-2 text-sm font-semibold uppercase tracking-[0.08em] ${windAccentClass}`}
              >
                {windHeadline}
              </p>
              <p className="mt-1 text-xs text-slate-500">{windImpactLabel}</p>
            </div>
          )}
          <div className="rounded-xl border border-surface-400 bg-surface-800/60 px-3 py-3">
            <div className="flex items-center gap-2 text-slate-400">
              <CloudRain size={14} />
              <span className="text-xs uppercase tracking-wide">Rain</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {getRainText(row)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeaturedHRTargetCardV2({
  row,
  researchHref,
}: FeaturedHRTargetCardProps) {
  const explanation = buildExplanation(row);
  const playTypeTag = getPlayTypeTag(explanation.type);
  const venueLabel = row.venueName ?? row.ballparkName ?? "Venue TBD";
  const metaItems = [
    getTeamAbbreviation(row.teamId),
    row.batterPosition,
    row.batterBats ? `Bats ${row.batterBats}` : null,
    row.lineupSpot != null && row.lineupSpot > 0
      ? `No. ${row.lineupSpot}`
      : null,
  ].filter(Boolean);

  return (
    <article className="overflow-hidden rounded-2xl border border-surface-400 bg-surface-800 shadow-[0_18px_45px_rgba(2,6,23,0.28)]">
      <div
        className={`h-1 w-full ${
          row.rank <= 3
            ? "bg-gradient-to-r from-amber-400/90 to-amber-400/15"
            : row.rank <= 8
              ? "bg-gradient-to-r from-emerald-400/75 to-emerald-400/10"
              : "bg-gradient-to-r from-blue-400/60 to-blue-400/10"
        }`}
      />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface-700 px-2.5 py-1 text-xs font-bold text-slate-200">
                #{row.rank}
              </span>
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${getTierClass(row.tier)}`}
              >
                {row.tier}
              </span>
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${getHrTierClass(
                  row.hrTier,
                )}`}
                title={row.hrTierReason}
              >
                {row.hrTier}
              </span>
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${getValueTierClass(
                  row.valueTier,
                )}`}
              >
                {row.valueTier}
              </span>
              <span
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${getLineupStatusClass(
                  row.lineupConfirmed,
                )}`}
              >
                {getLineupStatusLabel(row.lineupConfirmed)} lineup
              </span>
            </div>

            <Link
              href={researchHref}
              className="inline-flex max-w-full items-center gap-1 truncate text-xl font-semibold text-slate-100 transition-colors hover:text-brand-300"
            >
              <span className="truncate">{row.batterName}</span>
              <ArrowUpRight size={15} className="shrink-0" />
            </Link>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              {metaItems.map((item) => (
                <span key={`${row.batterId}-${item}`}>{item}</span>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-surface-400 bg-surface-700/70 px-3 py-2 text-sm">
              <span className="text-slate-500">Matchup</span>
              <span className="font-medium text-slate-100">
                {row.opposingPitcherName ?? "TBD pitcher"}
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${getThrowsBadgeClass(row.opposingPitcherThrows)}`}
              >
                {row.opposingPitcherThrows
                  ? `${row.opposingPitcherThrows}HP`
                  : "TBD"}
              </span>
              <span className="text-slate-500">{row.matchupLabel}</span>
              {row.gameTime && (
                <span className="text-slate-500">{row.gameTime}</span>
              )}
              <span className="text-slate-500">{venueLabel}</span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p
              className={`text-3xl font-bold ${getProbabilityClass(row.predictedProbability)}`}
            >
              {formatProbabilityPercent(row.predictedProbability)}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
              {HR_CHANCE_LABEL}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Cal {formatProbabilityPercent(row.calibratedHrProbability)} | Edge{" "}
              {row.modelEdge != null ? `${(row.modelEdge * 100).toFixed(1)}%` : "--"}
            </p>
            <p className="text-xs text-slate-500">
              Value {row.valueScore != null ? row.valueScore.toFixed(2) : "--"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Barrel %"
            tooltip="Barrel rate shows how often a hitter makes ideal power contact. Higher barrel rates usually mean better home run potential."
            value={`${row.features.barrelRate.toFixed(1)}%`}
          />
          <StatTile
            label="ISO"
            tooltip="ISO measures raw power by showing how often a hitter produces extra bases. Higher ISO usually means more HR upside."
            value={row.features.iso.toFixed(3)}
          />
          <StatTile
            label="Pitcher HR/9"
            tooltip="This shows how many home runs the pitcher allows per 9 innings. Higher numbers usually mean a better HR matchup."
            value={row.features.pitcherHr9.toFixed(2)}
          />
          <StatTile
            label="Projected ABs"
            tooltip="This is the expected number of at-bats for today. More at-bats means more chances to hit a home run."
            value={row.features.projectedAtBats.toFixed(1)}
          />
        </div>

        <EnvironmentField row={row} />

        <div className="rounded-2xl border border-surface-400 bg-surface-700/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-brand-300">
              <Info size={12} />
            </span>
            Why this HR target
            <span
              className={`ml-auto rounded-full border px-2 py-1 text-[10px] font-medium tracking-[0.12em] normal-case ${playTypeTag.className}`}
            >
              {playTypeTag.label}
            </span>
          </div>
          <p className="text-sm leading-7 text-slate-200">
            {explanation.summary}
          </p>
          <ul className="mt-4 space-y-2.5">
            {explanation.bullets.map((bullet, index) => (
              <li
                key={`${row.batterId}-explain-${index}`}
                className="flex items-start gap-2 text-sm leading-6 text-slate-300"
              >
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-brand-300" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
