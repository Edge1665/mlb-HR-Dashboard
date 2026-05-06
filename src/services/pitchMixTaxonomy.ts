export const PITCH_GROUPS = [
  'FF_SI',
  'SL',
  'CH',
  'CU',
  'FC',
  'FS_SPL',
] as const;

export type PitchGroup = (typeof PITCH_GROUPS)[number];

export const PITCH_GROUP_DISPLAY_NAMES: Record<PitchGroup, string> = {
  FF_SI: 'FF/SI',
  SL: 'SL',
  CH: 'CH',
  CU: 'CU',
  FC: 'FC',
  FS_SPL: 'FS/SPL',
};

export const PITCH_GROUP_SOURCE_CODES: Record<PitchGroup, string[]> = {
  FF_SI: ['FF', 'FA', 'FT', 'SI'],
  SL: ['SL', 'ST', 'SV'],
  CH: ['CH', 'EP'],
  CU: ['CU', 'KC', 'CS'],
  FC: ['FC'],
  FS_SPL: ['FS', 'FO', 'SC', 'SF'],
};

const RAW_PITCH_CODE_TO_GROUP: Record<string, PitchGroup> = Object.entries(
  PITCH_GROUP_SOURCE_CODES
).reduce<Record<string, PitchGroup>>((accumulator, [group, codes]) => {
  for (const code of codes) {
    accumulator[code] = group as PitchGroup;
  }

  return accumulator;
}, {});

export type PitchGroupMetricRecord = Partial<Record<PitchGroup, number>>;

export function createEmptyPitchGroupRecord(): Record<PitchGroup, number> {
  return {
    FF_SI: 0,
    SL: 0,
    CH: 0,
    CU: 0,
    FC: 0,
    FS_SPL: 0,
  };
}

export function getPitchGroupForRawCode(rawCode?: string | null): PitchGroup | null {
  if (!rawCode) return null;
  return RAW_PITCH_CODE_TO_GROUP[String(rawCode).trim().toUpperCase()] ?? null;
}

export function normalizePitchGroupUsage(
  usageByGroup?: PitchGroupMetricRecord
): PitchGroupMetricRecord {
  if (!usageByGroup) return {};

  const total = PITCH_GROUPS.reduce((sum, group) => {
    const value = usageByGroup[group];
    return sum + (Number.isFinite(value) && (value ?? 0) > 0 ? Number(value) : 0);
  }, 0);

  if (total <= 0) return {};

  const normalized: PitchGroupMetricRecord = {};
  for (const group of PITCH_GROUPS) {
    const value = usageByGroup[group];
    if (!Number.isFinite(value) || (value ?? 0) <= 0) continue;
    normalized[group] = Number((((value ?? 0) / total) * 100).toFixed(4));
  }

  return normalized;
}
