import { NextResponse } from 'next/server';
import { runTimeSplitBacktest } from '@/services/ml/hrBacktest';
import { fetchTrainingExamplesFromSnapshots } from '@/services/hrTrainingSnapshotService';
import type { HRTrainingExample } from '@/services/ml/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface DiagnosticsRequestBody {
  examples?: HRTrainingExample[];
  options?: {
    trainFraction?: number;
    iterations?: number;
    learningRate?: number;
    l2Penalty?: number;
  };
  startDate?: string;
  endDate?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as DiagnosticsRequestBody;

    let examples = body.examples ?? [];

    if (!Array.isArray(examples) || examples.length === 0) {
      examples = await fetchTrainingExamplesFromSnapshots({
        startDate: body.startDate,
        endDate: body.endDate,
        minRows: 100,
      });
    }

    if (examples.length < 100) {
      return NextResponse.json(
        { error: `Need at least 100 labeled examples. Found ${examples.length}.` },
        { status: 400 }
      );
    }

    const results = runTimeSplitBacktest(examples, body.options);

    return NextResponse.json({
      ok: true,
      dataSource: 'supabase-hr_feature_snapshots',
      exampleCount: examples.length,
      model: results.model,
      trainMetrics: results.trainMetrics,
      testMetrics: results.testMetrics,
      testPredictionsSample: results.testPredictions.slice(0, 25),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown diagnostics error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
