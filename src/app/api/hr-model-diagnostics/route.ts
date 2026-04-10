import { NextResponse } from 'next/server';
import { runTimeSplitBacktest } from '@/services/ml/hrBacktest';
import { runTimeSplitBacktestXGBoost } from '@/services/ml/hrXGBoostModel';
import {
  parseSeasonSampleWeights,
  type SeasonSampleWeights,
} from '@/services/ml/hrSeasonWeights';
import type { HRProbabilityMode } from '@/services/ml/hrXGBoostModel';
import { fetchTrainingExamplesFromSnapshots } from '@/services/hrTrainingSnapshotService';
import type { HRTrainingExample } from '@/services/ml/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface DiagnosticsRequestBody {
  examples?: HRTrainingExample[];
  modelType?: 'logistic' | 'xgboost';
  options?: {
    trainFraction?: number;
    calibrationFraction?: number;
    iterations?: number;
    learningRate?: number;
    l2Penalty?: number;
    maxDepth?: number;
    minChildWeight?: number;
    numRounds?: number;
    seasonSampleWeights?: SeasonSampleWeights;
    probabilityMode?: HRProbabilityMode;
  };
  startDate?: string;
  endDate?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DiagnosticsRequestBody;

    let examples = body.examples ?? [];

    if (!Array.isArray(examples) || examples.length === 0) {
      try {
        examples = await fetchTrainingExamplesFromSnapshots({
          startDate: body.startDate,
          endDate: body.endDate,
          minRows: 200,
        });
      } catch (fetchError) {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Not enough labeled examples yet.';

        return NextResponse.json(
          {
            ok: false,
            error: message,
            hint: 'Collect more labeled rows before running diagnostics.',
          },
          { status: 400 }
        );
      }
    }

    if (examples.length < 200) {
      return NextResponse.json(
        {
          ok: false,
          error: `Need at least 200 labeled examples. Found ${examples.length}.`,
        },
        { status: 400 }
      );
    }

    const modelType = body.modelType ?? 'xgboost';

    if (modelType === 'logistic') {
      const results = runTimeSplitBacktest(examples, {
        trainFraction: body.options?.trainFraction,
        iterations: body.options?.iterations,
        learningRate: body.options?.learningRate,
        l2Penalty: body.options?.l2Penalty,
      });

      return NextResponse.json({
        ok: true,
        modelType: 'logistic',
        dataSource: 'supabase-hr_feature_snapshots',
        exampleCount: examples.length,
        model: results.model,
        trainMetrics: results.trainMetrics,
        testMetrics: results.testMetrics,
        testPredictionsSample: results.testPredictions.slice(0, 25),
      });
    }

    const results = await runTimeSplitBacktestXGBoost(examples, {
      trainFraction: body.options?.trainFraction,
      calibrationFraction: body.options?.calibrationFraction,
      learningRate: body.options?.learningRate,
      maxDepth: body.options?.maxDepth,
      minChildWeight: body.options?.minChildWeight,
      numRounds: body.options?.numRounds,
      seasonSampleWeights: parseSeasonSampleWeights(body.options?.seasonSampleWeights),
      probabilityMode:
        body.options?.probabilityMode === 'conservative'
          ? 'conservative'
          : 'raw_calibrated',
    });
    const probabilityMode =
      body.options?.probabilityMode === 'conservative'
        ? 'conservative'
        : 'raw_calibrated';

    return NextResponse.json({
      ok: true,
      modelType: 'xgboost',
      probabilityMode,
      dataSource: 'supabase-hr_feature_snapshots',
      exampleCount: examples.length,
      split: results.split,
      model: results.model,
      trainMetrics: results.trainMetrics,
      calibrationMetrics: results.calibrationMetrics,
      testMetrics: results.testMetrics,
      calibrationPredictionsSample: results.calibrationPredictions.slice(0, 25),
      testPredictionsSample: results.testPredictions.slice(0, 25),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown diagnostics error';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
