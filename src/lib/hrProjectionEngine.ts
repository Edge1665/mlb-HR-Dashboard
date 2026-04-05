// TODO: Replace with real ML model using Statcast API data + historical HR rates
import type { HRProjection, Pitcher } from '@/types';

export function getConfidenceTierLabel(tier: string): string {
  switch (tier) {
    case 'elite': return 'Elite';
    case 'high': return 'High';
    case 'medium': return 'Medium';
    case 'low': return 'Low';
    default: return 'Unknown';
  }
}

export function getConfidenceTierColor(tier: string): string {
  switch (tier) {
    case 'elite': return 'text-amber-400';
    case 'high': return 'text-emerald-400';
    case 'medium': return 'text-blue-400';
    case 'low': return 'text-slate-400';
    default: return 'text-slate-400';
  }
}

export function getConfidenceTierBg(tier: string): string {
  switch (tier) {
    case 'elite': return 'bg-amber-400/10 border-amber-400/30 text-amber-400';
    case 'high': return 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400';
    case 'medium': return 'bg-blue-400/10 border-blue-400/30 text-blue-400';
    case 'low': return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
    default: return 'bg-slate-500/10 border-slate-500/30 text-slate-400';
  }
}

export function getProbabilityColor(prob: number): string {
  if (prob >= 22) return 'text-amber-400';
  if (prob >= 16) return 'text-emerald-400';
  if (prob >= 10) return 'text-blue-400';
  return 'text-slate-400';
}

export function getPlatoonLabel(advantage: string): string {
  switch (advantage) {
    case 'strong': return 'Strong Platoon Edge';
    case 'moderate': return 'Moderate Edge';
    case 'neutral': return 'Neutral Matchup';
    case 'disadvantage': return 'Platoon Disadvantage';
    default: return 'Unknown';
  }
}

export function getPlatoonColor(advantage: string): string {
  switch (advantage) {
    case 'strong': return 'text-emerald-400';
    case 'moderate': return 'text-blue-400';
    case 'neutral': return 'text-slate-400';
    case 'disadvantage': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

export function getHRImpactLabel(impact: string): string {
  switch (impact) {
    case 'positive': return 'HR Favorable';
    case 'neutral': return 'Neutral';
    case 'negative': return 'HR Suppressing';
    default: return 'Unknown';
  }
}

export function formatAvg(val: number): string {
  return val.toFixed(3).replace('0.', '.');
}

export function formatEra(val: number): string {
  return val.toFixed(2);
}

export function getBarrelRateColor(rate: number): string {
  if (rate >= 20) return 'text-amber-400';
  if (rate >= 14) return 'text-emerald-400';
  if (rate >= 8) return 'text-blue-400';
  return 'text-slate-400';
}

export function getExitVeloColor(velo: number): string {
  if (velo >= 95) return 'text-amber-400';
  if (velo >= 92) return 'text-emerald-400';
  if (velo >= 89) return 'text-blue-400';
  return 'text-slate-400';
}

export function getWindImpactLabel(windToward: string, windSpeed: number): string {
  if (windToward === 'out' && windSpeed >= 10) return `${windSpeed} mph blowing out ↑`;
  if (windToward === 'in' && windSpeed >= 10) return `${windSpeed} mph blowing in ↓`;
  if (windToward === 'crosswind') return `${windSpeed} mph crosswind →`;
  return `${windSpeed} mph neutral`;
}

export function getParkFactorLabel(factor: number): string {
  if (factor >= 1.2) return 'Extreme Hitter\'s Park';
  if (factor >= 1.1) return 'Hitter\'s Park';
  if (factor >= 0.95) return 'Neutral Park';
  if (factor >= 0.85) return 'Pitcher\'s Park';
  return 'Extreme Pitcher\'s Park';
}

export function getParkFactorColor(factor: number): string {
  if (factor >= 1.2) return 'text-red-400';
  if (factor >= 1.1) return 'text-orange-400';
  if (factor >= 0.95) return 'text-slate-300';
  if (factor >= 0.85) return 'text-blue-400';
  return 'text-blue-300';
}

export function sortProjections(
  projections: HRProjection[],
  sortKey: keyof HRProjection,
  direction: 'asc' | 'desc'
): HRProjection[] {
  return [...projections].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return direction === 'desc' ? bv - av : av - bv;
  });
}