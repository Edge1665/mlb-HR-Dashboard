export function getHRProbabilityTier(probability: number): string {
  if (probability >= 0.24) return 'Elite HR Targets';
  if (probability >= 0.18) return 'Strong HR Targets';
  if (probability >= 0.12) return 'Solid HR Targets';
  return 'Longshot HR Targets';
}
