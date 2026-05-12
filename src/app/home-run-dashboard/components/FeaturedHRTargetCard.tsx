'use client';

import Link from 'next/link';
import { ArrowUpRight, CloudRain, Info, Thermometer, Wind } from 'lucide-react';
import {
  formatProbabilityPercent,
  getDisplayedHrProbability,
  HR_CHANCE_LABEL,
} from '@/services/hrChanceDisplay';
import { getTeamAbbreviation } from '@/services/mlbTeamMetadata';

type FeaturedRow = {
  rank: number;
  batterId: string;
  batterName: string;
  batterPosition: string | null;
  batterBats: 'L' | 'R' | 'S' | null;
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
  opposingPitcherThrows: 'L' | 'R' | null;
  displayedHrProbability?: number | null;
  predictedProbability: number;
  tier: string;
  lineupConfirmed: boolean;
  environment: {
    temp: number | null;
    condition: string | null;
    windSpeed: number | null;
    windDirection: string | null;
    windToward: 'in' | 'out' | 'crosswind' | 'neutral' | null;
    windOutToCenter: number | null;
    windInFromCenter: number | null;
    crosswind: number | null;
    precipitation: number | null;
    hrImpact: 'positive' | 'neutral' | 'negative' | null;
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

type ExplanationContent = {
  summary: string;
  bullets: string[];
};

function getTierClass(tier: string): string {
  if (tier.startsWith('Elite')) return 'bg-amber-400/15 text-amber-300 border-amber-400/30';
  if (tier.startsWith('Strong')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (tier.startsWith('Solid')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

function getProbabilityClass(value: number): string {
  if (value >= 0.15) return 'text-amber-300';
  if (value >= 0.1) return 'text-emerald-300';
  if (value >= 0.06) return 'text-blue-300';
  return 'text-slate-300';
}

function getThrowsBadgeClass(value: 'L' | 'R' | null): string {
  if (value === 'L') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (value === 'R') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  return 'bg-surface-700 text-slate-300 border-surface-300';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
  return value.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getEnvironmentScore(row: FeaturedRow): number {
  const weatherBase =
    row.environment.hrImpactScore != null
      ? 50 + row.environment.hrImpactScore * 18
      : 50;
  const parkBase = 50 + (row.environment.parkHrFactor - 1) * 120;
  const rainPenalty = row.environment.precipitation != null
    ? Math.min(row.environment.precipitation * 120, 20)
    : 0;

  return Math.round(clamp(weatherBase * 0.65 + parkBase * 0.35 - rainPenalty, 0, 100));
}

function getEnvironmentLabel(row: FeaturedRow): 'Ideal' | 'Playable' | 'Neutral' | 'Risk' {
  const score = getEnvironmentScore(row);
  const rainyCondition = (row.environment.condition ?? '').toLowerCase();
  const hasRainRisk =
    (row.environment.precipitation ?? 0) >= 0.08 ||
    rainyCondition.includes('rain') ||
    rainyCondition.includes('storm');

  if (hasRainRisk && score < 72) return 'Risk';
  if (score >= 78) return 'Ideal';
  if (score >= 62) return 'Playable';
  if (score >= 45) return 'Neutral';
  return 'Risk';
}

function getEnvironmentClass(label: 'Ideal' | 'Playable' | 'Neutral' | 'Risk'): string {
  if (label === 'Ideal') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  if (label === 'Playable') return 'border-blue-500/30 bg-blue-500/10 text-blue-200';
  if (label === 'Neutral') return 'border-slate-500/30 bg-slate-500/10 text-slate-200';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-200';
}

function getWindText(row: FeaturedRow): string {
  const windSpeed = row.environment.windSpeed ?? 0;
  const toward = row.environment.windToward;

  if (!windSpeed) return 'Calm air';
  if (toward === 'out') return `${windSpeed.toFixed(0)} mph blowing out`;
  if (toward === 'in') return `${windSpeed.toFixed(0)} mph blowing in`;
  if (toward === 'crosswind') return `${windSpeed.toFixed(0)} mph crosswind`;
  return `${windSpeed.toFixed(0)} mph breeze`;
}

function getRainText(row: FeaturedRow): string {
  const precipitation = row.environment.precipitation ?? 0;
  const condition = (row.environment.condition ?? '').toLowerCase();

  if (condition.includes('storm')) return 'Storm risk';
  if (condition.includes('rain') && precipitation > 0) return `${precipitation.toFixed(2)} in rain signal`;
  if (precipitation >= 0.15) return `${precipitation.toFixed(2)} in rain signal`;
  if (precipitation > 0) return `${precipitation.toFixed(2)} in light rain signal`;
  return 'Dry';
}

function buildExplanation(row: FeaturedRow): ExplanationContent {
  const bullets: string[] = [];
  const powerIsStrong = row.features.barrelRate >= 12 || row.features.iso >= 0.22;
  const contactIsStrong = row.features.barrelRate >= 14;
  const isoIsStrong = row.features.iso >= 0.22;
  const pitcherRisky = row.features.pitcherHr9 >= 1.35;
  const pitcherPlayable = row.features.pitcherHr9 >= 1.1;
  const volumeStrong = row.features.projectedAtBats >= 4.1;
  const volumeFine = row.features.projectedAtBats >= 3.8;
  const weatherScore = row.environment.hrImpactScore ?? 0;
  const envLabel = getEnvironmentLabel(row);
  const rainyCondition = (row.environment.condition ?? '').toLowerCase();
  const rainRisk =
    (row.environment.precipitation ?? 0) >= 0.08 ||
    rainyCondition.includes('rain') ||
    rainyCondition.includes('storm');
  const parkHelps = row.environment.parkHrFactor >= 1.08;
  const parkSuppresses = row.environment.parkHrFactor <= 0.94;
  const hasPlatoonLean = row.features.platoonEdge >= 1;

  if (contactIsStrong && isoIsStrong) {
    bullets.push(
      `Strong contact quality and real raw power: ${row.features.barrelRate.toFixed(1)}% barrel rate with a ${row.features.iso.toFixed(3)} ISO.`
    );
  } else if (contactIsStrong) {
    bullets.push(
      `The barrel rate is strong at ${row.features.barrelRate.toFixed(1)}%, which keeps the power case believable today.`
    );
  } else if (isoIsStrong) {
    bullets.push(
      `The ISO sits at ${row.features.iso.toFixed(3)}, so this is still a real power bat even without a perfect environment.`
    );
  } else {
    bullets.push(
      `The power profile is still playable here, led by a ${row.features.barrelRate.toFixed(1)}% barrel rate and ${row.features.iso.toFixed(3)} ISO.`
    );
  }

  if (pitcherRisky) {
    bullets.push(
      `The matchup helps because the pitcher is allowing ${row.features.pitcherHr9.toFixed(2)} HR/9, which is a friendly mark for HR hunting.`
    );
  } else if (pitcherPlayable) {
    bullets.push(
      `The pitcher is not a hard fade for power, so this spot does not need a perfect matchup to stay live.`
    );
  } else {
    bullets.push(
      `This matchup leans more on hitter skill than pitcher weakness, since the pitcher has kept HR damage fairly controlled.`
    );
  }

  if (hasPlatoonLean) {
    bullets.push('The handedness setup gives him a small matchup edge on top of the raw power profile.');
  }

  if (volumeStrong) {
    bullets.push(
      `The projected volume is strong at ${row.features.projectedAtBats.toFixed(1)} AB, which gives the pick more room to get there.`
    );
  } else if (volumeFine) {
    bullets.push(
      `Projected volume is still usable at ${row.features.projectedAtBats.toFixed(1)} AB, so the opportunity side is fine.`
    );
  }

  if (rainRisk) {
    bullets.push(
      `There is some weather risk in the mix, so the power case is better than the environment.`
    );
  } else if (envLabel === 'Ideal' || envLabel === 'Playable') {
    bullets.push(
      `The environment is helping enough to keep this from being a skill-only play.`
    );
  } else if (parkSuppresses || weatherScore <= -0.6) {
    bullets.push(
      `The environment is more neutral-to-tough, so the wager depends mostly on the hitter and matchup holding up.`
    );
  } else {
    bullets.push('Weather looks mostly neutral, so the play stands on the bat and the matchup.');
  }

  const summaryOptions: string[] = [];
  if (powerIsStrong && pitcherRisky && !rainRisk) {
    summaryOptions.push(
      'This spot stands out because the power profile is real, the pitcher can give up home-run damage, and the environment is not getting in the way.'
    );
    summaryOptions.push(
      'There is a clean case here: the hitter has real lift-and-damage traits, the matchup is friendly enough, and today’s conditions are at least workable.'
    );
  }
  if (powerIsStrong && rainRisk) {
    summaryOptions.push(
      'The bat is good enough to like here, but the environment introduces some risk, so this is more about trusting the hitter than chasing weather.'
    );
  }
  if (powerIsStrong && !pitcherRisky) {
    summaryOptions.push(
      'This is more of a hitter-driven target than a matchup gift, which is fine when the contact quality and power are both there.'
    );
  }
  if (!powerIsStrong && pitcherRisky) {
    summaryOptions.push(
      'The appeal here is more about a hittable HR matchup and enough volume than a monster pure power profile.'
    );
  }
  if (summaryOptions.length === 0) {
    summaryOptions.push(
      'This card works because the spot is balanced: enough power, enough opportunity, and no major environment red flags.'
    );
  }

  const summary = summaryOptions[hashString(row.batterId) % summaryOptions.length];

  return {
    summary,
    bullets: bullets.slice(0, 4),
  };
}

function getWindArrowPoints(row: FeaturedRow) {
  if (row.environment.windToward === 'out') {
    return { x1: 40, y1: 58, x2: 40, y2: 18 };
  }

  if (row.environment.windToward === 'in') {
    return { x1: 40, y1: 18, x2: 40, y2: 58 };
  }

  if (row.environment.windToward === 'crosswind') {
    const crosswind = row.environment.crosswind ?? 0;
    if (crosswind >= 0) {
      return { x1: 18, y1: 34, x2: 62, y2: 28 };
    }
    return { x1: 62, y1: 34, x2: 18, y2: 28 };
  }

  return { x1: 26, y1: 46, x2: 54, y2: 30 };
}

function InfoTooltip({ label, text }: { label: string; text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <button
        type="button"
        aria-label={`${label} info`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-200"
      >
        <Info size={12} />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-surface-300 bg-surface-900 px-3 py-2 text-[11px] normal-case leading-relaxed text-slate-200 shadow-lg group-hover:block">
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
  const score = getEnvironmentScore(row);
  const label = getEnvironmentLabel(row);
  const arrow = getWindArrowPoints(row);

  return (
    <div className="rounded-2xl border border-surface-400 bg-surface-700/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Environment</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-100">HR Environment: {score}</span>
            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${getEnvironmentClass(label)}`}>
              {label}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {row.ballparkName ?? 'Ballpark context'} • {row.environment.parkHrFactor.toFixed(2)}x park
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div className="rounded-xl border border-surface-400 bg-surface-800/80 p-2">
          <svg viewBox="0 0 80 80" className="h-20 w-20">
            <path d="M40 10 L68 34 L58 62 L22 62 L12 34 Z" fill="rgba(34,197,94,0.08)" stroke="rgba(148,163,184,0.35)" strokeWidth="1.5" />
            <path d="M40 49 L47 56 L40 63 L33 56 Z" fill="rgba(148,163,184,0.28)" stroke="rgba(148,163,184,0.45)" strokeWidth="1.2" />
            <path d="M40 49 L40 17" stroke="rgba(59,130,246,0.25)" strokeDasharray="2 2" />
            <path d={`M${arrow.x1} ${arrow.y1} L${arrow.x2} ${arrow.y2}`} stroke="rgb(125,211,252)" strokeWidth="3" strokeLinecap="round" />
            <path d={`M${arrow.x2} ${arrow.y2} L${arrow.x2 - 4} ${arrow.y2 + 2}`} stroke="rgb(125,211,252)" strokeWidth="3" strokeLinecap="round" />
            <path d={`M${arrow.x2} ${arrow.y2} L${arrow.x2 - 1} ${arrow.y2 + 5}`} stroke="rgb(125,211,252)" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-surface-400 bg-surface-800/60 px-3 py-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Thermometer size={14} />
              <span className="text-xs uppercase tracking-wide">Temp</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-100">
              {row.environment.temp != null ? `${row.environment.temp.toFixed(0)}°F` : '--'}
            </p>
          </div>
          <div className="rounded-xl border border-surface-400 bg-surface-800/60 px-3 py-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Wind size={14} />
              <span className="text-xs uppercase tracking-wide">Wind</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-100">{getWindText(row)}</p>
            {row.environment.windDirection && (
              <p className="mt-1 text-xs text-slate-500">{row.environment.windDirection}</p>
            )}
          </div>
          <div className="rounded-xl border border-surface-400 bg-surface-800/60 px-3 py-3">
            <div className="flex items-center gap-2 text-slate-400">
              <CloudRain size={14} />
              <span className="text-xs uppercase tracking-wide">Rain</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-100">{getRainText(row)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeaturedHRTargetCard({ row, researchHref }: FeaturedHRTargetCardProps) {
  const explanation = buildExplanation(row);

  return (
    <article className="overflow-hidden rounded-2xl border border-surface-400 bg-surface-800 shadow-[0_18px_45px_rgba(2,6,23,0.28)]">
      <div
        className={`h-1 w-full ${
          row.rank <= 3
            ? 'bg-gradient-to-r from-amber-400/90 to-amber-400/15'
            : row.rank <= 8
              ? 'bg-gradient-to-r from-emerald-400/75 to-emerald-400/10'
              : 'bg-gradient-to-r from-blue-400/60 to-blue-400/10'
        }`}
      />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface-700 px-2.5 py-1 text-xs font-bold text-slate-200">
                #{row.rank}
              </span>
              <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${getTierClass(row.tier)}`}>
                {row.tier}
              </span>
              <span className="rounded-md border border-surface-400 px-2.5 py-1 text-xs text-slate-300">
                {row.lineupConfirmed ? 'Confirmed lineup' : 'Projected lineup'}
              </span>
            </div>

            <Link
              href={researchHref}
              className="inline-flex max-w-full items-center gap-1 truncate text-xl font-semibold text-slate-100 hover:text-brand-300"
            >
              <span className="truncate">{row.batterName}</span>
              <ArrowUpRight size={15} className="shrink-0" />
            </Link>

            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
              <span>{getTeamAbbreviation(row.teamId)}</span>
              {row.batterPosition && <span>• {row.batterPosition}</span>}
              {row.batterBats && <span>• Bats {row.batterBats}</span>}
              {row.lineupSpot != null && row.lineupSpot > 0 && <span>• #{row.lineupSpot} spot</span>}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-surface-400 bg-surface-700/70 px-3 py-2 text-sm">
              <span className="text-slate-500">Matchup</span>
              <span className="font-medium text-slate-100">
                {row.opposingPitcherName ?? 'TBD pitcher'}
              </span>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${getThrowsBadgeClass(row.opposingPitcherThrows)}`}>
                {row.opposingPitcherThrows ? `${row.opposingPitcherThrows}HP` : 'TBD'}
              </span>
              <span className="text-slate-500">{row.matchupLabel}</span>
              {row.gameTime && <span className="text-slate-500">• {row.gameTime}</span>}
            </div>
          </div>

          <div className="text-right">
            <p className={`text-3xl font-bold ${getProbabilityClass(getDisplayedHrProbability(row) ?? 0)}`}>
              {formatProbabilityPercent(getDisplayedHrProbability(row))}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
              {HR_CHANCE_LABEL}
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
          </div>
          <p className="text-sm leading-7 text-slate-200">{explanation.summary}</p>
          <ul className="mt-4 space-y-2.5">
            {explanation.bullets.map((bullet, index) => (
              <li key={`${row.batterId}-explain-${index}`} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="mt-1 text-brand-300">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
