/**
 * Hit Probability Model — STUB
 *
 * NOT YET IMPLEMENTED.
 *
 * This file reserves the architecture slot for a hit probability model.
 * When ready to implement, replace the stub body with a real feature-based
 * model following the same pattern as hrPredictionService.ts.
 *
 * Suggested inputs to incorporate:
 *   - Season batting average / OBP / OPS
 *   - Contact rate, line-drive rate, xBA
 *   - Recent form (last 7/14d AVG, OPS)
 *   - Platoon splits (AVG vs LHP/RHP)
 *   - Pitcher K%, WHIP, contact-allowed rate
 *   - Ballpark hit factor (if available)
 *   - Lineup position (PA projection)
 *   - Weather (temperature effect on ball carry)
 */

import type { BasePredictionModel } from './baseModel';
import type { BasePredictionInput, EventPredictionOutput } from './types';


export class HitPredictionModel implements BasePredictionModel {
  readonly eventType = 'hit' as const;

  compute(_input: BasePredictionInput): EventPredictionOutput {
    throw new Error('HitPredictionModel is not yet implemented.');
  }

  explain(_input: BasePredictionInput, _output: EventPredictionOutput): string {
    throw new Error('HitPredictionModel is not yet implemented.');
  }
}

export const hitModel = new HitPredictionModel();
