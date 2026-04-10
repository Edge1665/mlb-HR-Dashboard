export function getHRProbabilityTier(probability: number): string {
  if (probability >= 0.28) return 'Elite HR Target';
  if (probability >= 0.22) return 'Strong HR Target';
  if (probability >= 0.16) return 'Decent Upside';
  if (probability >= 0.10) return 'Longshot';
  return 'Low';
}
