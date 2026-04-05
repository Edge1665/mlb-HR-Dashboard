/**
 * Triple Probability Model — STUB
 *
 * NOT YET IMPLEMENTED.
 *
 * This file reserves the architecture slot for a triple-hit probability model.
 * When ready to implement, replace the stub body with a real feature-based
 * model following the same pattern as hrPredictionService.ts.
 *
 * Suggested inputs to incorporate:
 *   - Season triple rate (3B / PA) — triples are rare; small sample caution
 *   - Sprint speed (primary driver of triples)
 *   - Line-drive rate, gap power
 *   - Ballpark dimensions (deep gaps, large outfield)
 *   - Platoon splits (AVG/SLG vs LHP/RHP)
 *   - Pitcher ground-ball %, hard-contact-allowed rate
 *   - Recent form (last 7/14d XBH)
 *   - Lineup position (PA projection)
 */

import type { BasePredictionModel } from './baseModel';
import type { BasePredictionInput, EventPredictionOutput } from './types';

export class TriplePredictionModel implements BasePredictionModel {
  readonly eventType = 'triple' as const;

  compute(_input: BasePredictionInput): EventPredictionOutput {
    throw new Error('TriplePredictionModel is not yet implemented.');
  }

  explain(_input: BasePredictionInput, _output: EventPredictionOutput): string {
    throw new Error('TriplePredictionModel is not yet implemented.');
  }
}

export const tripleModel = new TriplePredictionModel();
