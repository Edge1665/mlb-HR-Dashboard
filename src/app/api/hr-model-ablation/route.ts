import { NextResponse } from 'next/server';
import { fetchTrainingExamplesFromSnapshots } from '@/services/hrTrainingSnapshotService';
import {
  DEFAULT_ABLATION_SCENARIOS,
  QUICK_ABLATION_SCENARIOS,
  runHRFeatureAblation,
} from '@/services/ml/hrFeatureAblationService';
import type { HRTrainingExample } from '@/services/ml/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface AblationRequestBody {
  examples?: HRTrainingExample[];
  startDate?: string;
  endDate?: string;
  mode?: 'quick' | 'full';
  trainFraction?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as AblationRequestBody;

    let examples = body.examples ?? [];

    if (!Array.isArray(examples) || examples.length === 0) {
      examples = await fetchTrainingExamplesFromSnapshots({
        startDate: body.startDate,
        endDate: body.endDate,
        minRows: 500,
      });
    }

    const scenarios =
      body.mode === 'full' ? DEFAULT_ABLATION_SCENARIOS : QUICK_ABLATION_SCENARIOS;

    const ablation = await runHRFeatureAblation(examples, scenarios, {
      trainFraction: body.trainFraction,
    });

    return NextResponse.json({
      ok: true,
      dataSource: 'supabase-hr_feature_snapshots',
      exampleCount: examples.length,
      mode: body.mode === 'full' ? 'full' : 'quick',
      ...ablation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run feature ablation';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
