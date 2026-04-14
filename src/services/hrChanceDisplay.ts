export const HR_CHANCE_LABEL = 'Est. HR Chance';

export const HR_CHANCE_INFO_TEXT =
  'Estimated HR Chance is a model-adjusted probability calibrated for realistic single-game home run likelihood.';

export function formatProbabilityPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '--';
  }

  return `${(value * 100).toFixed(1)}%`;
}
