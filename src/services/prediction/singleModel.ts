/**
 * Single Probability Model — STUB
 *
 * NOT YET IMPLEMENTED.
 *
 * This file reserves the architecture slot for a single-hit probability model.
 * When ready to implement, replace the stub body with a real feature-based
 * model following the same pattern as hrPredictionService.ts.
 *
 * Suggested inputs to incorporate:
 *   - Season single rate (1B / PA)
 *   - Contact rate, ground-ball rate, line-drive rate
 *   - Sprint speed / infield hit rate
 *   - Platoon splits (AVG vs LHP/RHP)
 *   - Pitcher ground-ball %, BABIP-against
 *   - Infield defense quality (if available)
 *   - Recent form (last 7/14d AVG)
 *   - Lineup position (PA projection)
 */

import type { BasePredictionModel } from './baseModel';
import type { BasePredictionInput, EventPredictionOutput } from './types';

export class SinglePredictionModel implements BasePredictionModel {
  readonly eventType = 'single' as const;

  compute(_input: BasePredictionInput): EventPredictionOutput {
    throw new Error('SinglePredictionModel is not yet implemented.');
  }

  explain(_input: BasePredictionInput, _output: EventPredictionOutput): string {
    throw new Error('SinglePredictionModel is not yet implemented.');
  }
}

export const singleModel = new SinglePredictionModel();
