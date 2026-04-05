/**
 * Prediction Model Registry
 *
 * Single source of truth for all available event prediction models.
 * Import from here to discover which models are implemented vs stubbed.
 *
 * ─── Adding a new model ───────────────────────────────────────────────────────
 * 1. Create src/services/prediction/<event>Model.ts implementing BasePredictionModel
 * 2. Import the model instance below
 * 3. Add it to PREDICTION_REGISTRY
 * 4. Change its status from 'stub' to 'active'
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The HR model lives in src/services/hrPredictionService.ts and is intentionally
 * kept separate because it predates this registry. It is listed here for
 * discoverability only.
 */

import type { PredictionEventType } from './types';

// ─── Model status ─────────────────────────────────────────────────────────────

export type ModelStatus = 'active' | 'stub';

export interface ModelRegistryEntry {
  eventType: PredictionEventType;
  label: string;
  description: string;
  status: ModelStatus;
  /** Path to the model's service file (relative to src/) */
  servicePath: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const PREDICTION_REGISTRY: ModelRegistryEntry[] = [
  {
    eventType: 'home_run',
    label: 'Home Run',
    description: '9-feature multiplicative model: HR rate, power indicators, recent form, platoon, pitcher tendency, ballpark, weather, lineup, team context.',
    status: 'active',
    servicePath: 'services/hrPredictionService.ts',
  },
  {
    eventType: 'hit',
    label: 'Hit',
    description: 'Contact-based model: season AVG/OBP, contact rate, line-drive rate, xBA, platoon splits, pitcher K%/WHIP, lineup position.',
    status: 'stub',
    servicePath: 'services/prediction/hitModel.ts',
  },
  {
    eventType: 'rbi',
    label: 'RBI',
    description: 'Run-production model: season RBI rate, SLG, lineup position (3–5 slot), team OBP context, pitcher WHIP, platoon splits.',
    status: 'stub',
    servicePath: 'services/prediction/rbiModel.ts',
  },
  {
    eventType: 'single',
    label: 'Single',
    description: 'Contact/speed model: single rate, contact rate, ground-ball %, sprint speed, infield hit rate, pitcher GB%, BABIP-against.',
    status: 'stub',
    servicePath: 'services/prediction/singleModel.ts',
  },
  {
    eventType: 'double',
    label: 'Double',
    description: 'Gap-power model: double rate, exit velocity, line-drive %, ISO, ballpark gap dimensions, pitcher hard-contact-allowed rate.',
    status: 'stub',
    servicePath: 'services/prediction/doubleModel.ts',
  },
  {
    eventType: 'triple',
    label: 'Triple',
    description: 'Speed/gap model: triple rate, sprint speed, line-drive %, ballpark outfield depth, pitcher GB%, hard-contact-allowed rate.',
    status: 'stub',
    servicePath: 'services/prediction/tripleModel.ts',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns only models that are fully implemented */
export function getActiveModels(): ModelRegistryEntry[] {
  return PREDICTION_REGISTRY.filter(m => m.status === 'active');
}

/** Returns only models that are stubs (not yet implemented) */
export function getStubModels(): ModelRegistryEntry[] {
  return PREDICTION_REGISTRY.filter(m => m.status === 'stub');
}

/** Look up a registry entry by event type */
export function getModelEntry(eventType: PredictionEventType): ModelRegistryEntry | undefined {
  return PREDICTION_REGISTRY.find(m => m.eventType === eventType);
}
