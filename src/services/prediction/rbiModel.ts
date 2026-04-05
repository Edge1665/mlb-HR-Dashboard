/**
 * RBI Probability Model — STUB
 *
 * NOT YET IMPLEMENTED.
 *
 * This file reserves the architecture slot for an RBI probability model.
 * When ready to implement, replace the stub body with a real feature-based
 * model following the same pattern as hrPredictionService.ts.
 *
 * Suggested inputs to incorporate:
 *   - Season RBI total / RBI rate per PA
 *   - Season OPS, SLG (run-production indicators)
 *   - Lineup position (3–5 = most RBI opportunities)
 *   - Team OBP / runners-on-base context
 *   - Platoon splits (SLG vs LHP/RHP)
 *   - Pitcher WHIP, runners-allowed rate
 *   - Recent form (last 7/14d RBI, OPS)
 *   - Ballpark run factor
 */

import type { BasePredictionModel } from './baseModel';
import type { BasePredictionInput, EventPredictionOutput } from './types';

export class RBIPredictionModel implements BasePredictionModel {
  readonly eventType = 'rbi' as const;

  compute(_input: BasePredictionInput): EventPredictionOutput {
    throw new Error('RBIPredictionModel is not yet implemented.');
  }

  explain(_input: BasePredictionInput, _output: EventPredictionOutput): string {
    throw new Error('RBIPredictionModel is not yet implemented.');
  }
}

export const rbiModel = new RBIPredictionModel();
