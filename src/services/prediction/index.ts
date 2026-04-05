/**
 * Prediction Module — Public API
 *
 * Import from here to access types, the base model interface,
 * the registry, and individual model stubs.
 *
 * The home run model is intentionally NOT re-exported here because
 * it predates this module and is consumed directly by the HR dashboard.
 * Future models should be exported from this index once implemented.
 */

// Shared types
export type {
  PredictionEventType,
  BasePredictionInput,
  EventPredictionOutput,
  FeatureContribution,
  BatterPowerProfile,
  BatterContactProfile,
  BatterRecentForm,
  PlatoonSplits,
  PitcherProfile,
  BallparkContext,
  WeatherContext,
  TeamOffensiveContext,
} from './types';

// Base model interface + batch helper
export type { BasePredictionModel } from './baseModel';
export { runBatchPredictions, getProjectedPA, LINEUP_PA_MAP } from './baseModel';

// Registry
export {
  PREDICTION_REGISTRY,
  getActiveModels,
  getStubModels,
  getModelEntry,
} from './registry';
export type { ModelRegistryEntry, ModelStatus } from './registry';
