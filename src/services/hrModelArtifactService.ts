import fs from 'fs/promises';
import path from 'path';
import { XGBoost } from '@fractal-solutions/xgboost-js';
import {
  splitChronologically,
  trainHRXGBoostModel,
} from '@/services/ml/hrXGBoostModel';
import {
  DEFAULT_SEASON_SAMPLE_WEIGHTS,
  normalizeSeasonSampleWeights,
  type SeasonSampleWeights,
} from '@/services/ml/hrSeasonWeights';
import { fetchTrainingExamplesFromSnapshots } from '@/services/hrTrainingSnapshotService';

type CalibrationBucket = {
  rawMin: number;
  rawMax: number;
  avgRaw: number;
  actualRate: number;
  count: number;
};

type CalibrationModel = {
  globalPositiveRate: number;
  buckets: CalibrationBucket[];
};

type StandardizationModel = {
  means: number[];
  stds: number[];
};

export interface HRModelArtifact {
  version: 1;
  modelType: 'xgboost';
  trainedAt: string;
  trainingStartDate: string;
  trainingEndDate?: string;
  trainingExampleCount: number;
  seasonSampleWeights: SeasonSampleWeights;
  params: {
    learningRate: number;
    maxDepth: number;
    minChildWeight: number;
    numRounds: number;
    positiveBoostFactor: number;
    negativeSampleRate: number;
    probabilityPower: number;
    seasonSampleWeights: SeasonSampleWeights;
  };
  standardization: StandardizationModel;
  calibration: CalibrationModel;
  featureNames: string[];
  featureImportance: Record<string, number>;
  modelJson: {
    trees: unknown[];
    params: Record<string, unknown>;
  };
}

export interface LoadedHRModelArtifact {
  artifact: HRModelArtifact;
  model: XGBoost;
}

const ARTIFACT_DIR = path.join(process.cwd(), 'output', 'models');
const ARTIFACT_PATH = path.join(ARTIFACT_DIR, 'hr-xgboost-latest.json');

async function ensureArtifactDir() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

export function getHRModelArtifactPath(): string {
  return ARTIFACT_PATH;
}

export async function loadHRModelArtifact(): Promise<LoadedHRModelArtifact | null> {
  try {
    const raw = await fs.readFile(ARTIFACT_PATH, 'utf8');
    const artifact = JSON.parse(raw) as HRModelArtifact;
    const model = (XGBoost as typeof XGBoost & {
      fromJSON: (json: HRModelArtifact['modelJson']) => XGBoost;
    }).fromJSON(artifact.modelJson);
    return { artifact, model };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    throw error;
  }
}

export async function trainAndSaveHRModelArtifact(options?: {
  trainingStartDate?: string;
  trainingEndDate?: string;
  minRows?: number;
  seasonSampleWeights?: SeasonSampleWeights;
}) {
  const trainingStartDate = options?.trainingStartDate ?? '2024-03-28';
  const seasonSampleWeights = normalizeSeasonSampleWeights(
    options?.seasonSampleWeights ?? DEFAULT_SEASON_SAMPLE_WEIGHTS
  );
  const trainingExamples = await fetchTrainingExamplesFromSnapshots({
    startDate: trainingStartDate,
    endDate: options?.trainingEndDate,
    minRows: options?.minRows ?? 500,
  });
  const { trainExamples, calibrationExamples, testExamples } = splitChronologically(
    trainingExamples
  );

  const { model, summary, standardization, calibration } = await trainHRXGBoostModel(
    trainExamples,
    {
      learningRate: 0.08,
      maxDepth: 5,
      minChildWeight: 1,
      numRounds: 180,
      positiveBoostFactor: 6,
      negativeSampleRate: 1.0,
      probabilityPower: 0.85,
      seasonSampleWeights,
      calibrationExamples,
      testExamples,
    }
  );

  const artifact: HRModelArtifact = {
    version: 1,
    modelType: 'xgboost',
    trainedAt: summary.trainedAt,
    trainingStartDate,
    trainingEndDate: options?.trainingEndDate,
    trainingExampleCount: trainingExamples.length,
    seasonSampleWeights,
    params: summary.params,
    standardization,
    calibration,
    featureNames: summary.featureNames,
    featureImportance: summary.featureImportance,
    modelJson: summary.modelJson,
  };

  await ensureArtifactDir();
  await fs.writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2), 'utf8');

  return {
    artifact,
    model,
  };
}
