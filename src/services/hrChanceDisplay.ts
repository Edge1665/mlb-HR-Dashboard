export const HR_CHANCE_LABEL = 'Est. HR %';
export const MAX_DISPLAYED_HR_PROBABILITY = 0.18;

export const HR_CHANCE_INFO_TEXT =
  'Est. HR % is the public-facing single-game HR estimate, calibrated into a realistic MLB range. Model Score still drives ranking.';

type DisplayedHrChanceSource = {
  displayedHrProbability?: number | null;
  predictedProbability?: number | null;
  calibratedHrProbability?: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function interpolateByBreakpoints(
  value: number,
  inputBreakpoints: number[],
  outputBreakpoints: number[],
): number {
  if (inputBreakpoints.length !== outputBreakpoints.length) {
    throw new Error("Breakpoint arrays must be the same length.");
  }

  if (value <= inputBreakpoints[0]) {
    return outputBreakpoints[0];
  }

  for (let index = 1; index < inputBreakpoints.length; index += 1) {
    const leftInput = inputBreakpoints[index - 1];
    const rightInput = inputBreakpoints[index];

    if (value <= rightInput) {
      const ratio = (value - leftInput) / (rightInput - leftInput);
      const leftOutput = outputBreakpoints[index - 1];
      const rightOutput = outputBreakpoints[index];
      return leftOutput + (rightOutput - leftOutput) * ratio;
    }
  }

  return outputBreakpoints[outputBreakpoints.length - 1];
}

export function sanitizeDisplayedHrProbability(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return clamp(value, 0, MAX_DISPLAYED_HR_PROBABILITY);
}

export function getRealisticDisplayedHrProbability(params: {
  modelScore?: number | null;
  rawProbability?: number | null;
  oddsImpliedProbability?: number | null;
}): number {
  const score =
    params.modelScore != null && Number.isFinite(params.modelScore)
      ? clamp(params.modelScore, 0, 0.65)
      : null;
  const rawProbability =
    params.rawProbability != null && Number.isFinite(params.rawProbability)
      ? clamp(params.rawProbability, 0, 1)
      : null;
  if (score != null) {
    return clamp(
      interpolateByBreakpoints(
        score,
        [0, 0.03, 0.05, 0.08, 0.12, 0.18, 0.26, 0.35, 0.45, 0.55, 0.65],
        [0.02, 0.028, 0.038, 0.05, 0.065, 0.082, 0.1, 0.118, 0.135, 0.155, 0.17],
      ),
      0.02,
      MAX_DISPLAYED_HR_PROBABILITY,
    );
  }

  if (rawProbability != null) {
    const displayedProbability = interpolateByBreakpoints(
      rawProbability,
      [0.5, 0.55, 0.6, 0.65, 0.7, 0.75],
      [0.03, 0.04, 0.06, 0.08, 0.11, 0.14],
    );

    return clamp(displayedProbability, 0.02, MAX_DISPLAYED_HR_PROBABILITY);
  }

  return 0.03;
}

export function getDisplayedHrProbability(
  value: DisplayedHrChanceSource,
): number | null {
  if (value.displayedHrProbability != null && Number.isFinite(value.displayedHrProbability)) {
    return sanitizeDisplayedHrProbability(value.displayedHrProbability);
  }

  if (value.predictedProbability != null && Number.isFinite(value.predictedProbability)) {
    return sanitizeDisplayedHrProbability(value.predictedProbability);
  }

  if (value.calibratedHrProbability != null && Number.isFinite(value.calibratedHrProbability)) {
    return sanitizeDisplayedHrProbability(value.calibratedHrProbability);
  }

  return null;
}

export function formatProbabilityPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '--';
  }

  return `${(value * 100).toFixed(1)}%`;
}
