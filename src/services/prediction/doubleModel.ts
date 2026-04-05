/**
 * Double Probability Model — STUB
 *
 * NOT YET IMPLEMENTED.
 *
 * This file reserves the architecture slot for a double-hit probability model.
 * When ready to implement, replace the stub body with a real feature-based
 * model following the same pattern as hrPredictionService.ts.
 *
 * Suggested inputs to incorporate:
 *   - Season double rate (2B / PA)
 *   - Exit velocity, line-drive rate, hard-hit rate
 *   - ISO (isolated power — doubles contribute heavily)
 *   - Platoon splits (SLG vs LHP/RHP)
 *   - Pitcher hard-contact-allowed rate
 *   - Ballpark dimensions (gap depth, outfield size)
 *   - Recent form (last 7/14d XBH, OPS)
 *   - Lineup position (PA projection)
 */

import type { BasePredictionModel } from './baseModel';
import type { BasePredictionInput, EventPredictionOutput } from './types';

export class DoublePredictionModel implements BasePredictionModel {
  readonly eventType = 'double' as const;

  compute(_input: BasePredictionInput): EventPredictionOutput {
    throw new Error('DoublePredictionModel is not yet implemented.');
  }

  explain(_input: BasePredictionInput, _output: EventPredictionOutput): string {
    throw new Error('DoublePredictionModel is not yet implemented.');
  }
}

export const doubleModel = new DoublePredictionModel();
