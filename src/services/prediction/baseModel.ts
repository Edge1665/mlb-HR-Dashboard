/**
 * Base Prediction Model Interface
 *
 * All event prediction models (HR, hit, RBI, single, double, triple)
 * must conform to this interface. This ensures a consistent contract
 * for computing probabilities, generating explanations, and running
 * batch predictions.
 *
 * Usage pattern for a new model:
 *
 *   import { BasePredictionModel } from '@/services/prediction/baseModel';
 *   import type { BasePredictionInput, EventPredictionOutput } from '@/services/prediction/types';
 *
 *   export class HitPredictionModel implements BasePredictionModel {
 *     readonly eventType = 'hit' as const;
 *     compute(input: BasePredictionInput): EventPredictionOutput { ... }
 *     explain(input: BasePredictionInput, output: EventPredictionOutput): string { ... }
 *   }
 */

import type { BasePredictionInput, EventPredictionOutput, PredictionEventType } from './types';

// ─── Model Interface ──────────────────────────────────────────────────────────

export interface BasePredictionModel {
  /** Identifies which event this model predicts */
  readonly eventType: PredictionEventType;

  /**
   * Compute the event probability for a single batter.
   * All input fields are optional — models must handle missing data gracefully.
   */
  compute(input: BasePredictionInput): EventPredictionOutput;

  /**
   * Generate a plain-English explanation of the prediction.
   * Should reference only the data that was actually available.
   */
  explain(input: BasePredictionInput, output: EventPredictionOutput): string;
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

/**
 * Run a model against multiple batters and return results sorted by
 * probability descending.
 */
export function runBatchPredictions(
  model: BasePredictionModel,
  inputs: BasePredictionInput[]
): EventPredictionOutput[] {
  return inputs
    .map(input => model.compute(input))
    .sort((a, b) => b.probability - a.probability);
}

// ─── Shared utility: lineup PA map ───────────────────────────────────────────

/** Projected plate appearances by lineup slot (used by all models) */
export const LINEUP_PA_MAP: Record<number, number> = {
  1: 4.4, 2: 4.3, 3: 4.2, 4: 4.1, 5: 3.9,
  6: 3.8, 7: 3.7, 8: 3.6, 9: 3.5,
};

export function getProjectedPA(lineupPosition: number | null | undefined): number {
  if (lineupPosition == null) return 3.8;
  return LINEUP_PA_MAP[lineupPosition] ?? 3.8;
}
