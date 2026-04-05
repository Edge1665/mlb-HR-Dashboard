import { NextResponse } from 'next/server';
import { runTimeSplitBacktest } from '@/services/ml/hrBacktest';
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
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiagnosticsRequestBody;
    const examples = body.examples ?? [];

    if (!Array.isArray(examples) || examples.length < 100) {
      return NextResponse.json(
        { error: 'Provide at least 100 historical examples in the request body.' },
        { status: 400 }
      );
    }

    const results = runTimeSplitBacktest(examples, body.options);

    return NextResponse.json({
      ok: true,
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
