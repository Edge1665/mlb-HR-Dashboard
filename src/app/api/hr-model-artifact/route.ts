import { NextRequest, NextResponse } from 'next/server';
import {
  getHRModelArtifactPath,
  loadHRModelArtifact,
  trainAndSaveHRModelArtifact,
} from '@/services/hrModelArtifactService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const loaded = await loadHRModelArtifact();

    if (!loaded) {
      return NextResponse.json({
        ok: true,
        exists: false,
        path: getHRModelArtifactPath(),
      });
    }

    return NextResponse.json({
      ok: true,
      exists: true,
      path: getHRModelArtifactPath(),
      artifact: loaded.artifact,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load model artifact';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const trainingStartDate =
      typeof body?.trainingStartDate === 'string' ? body.trainingStartDate : undefined;
    const trainingEndDate =
      typeof body?.trainingEndDate === 'string' ? body.trainingEndDate : undefined;
    const featureSetName =
      typeof body?.featureSetName === 'string' ? body.featureSetName : undefined;

    const { artifact } = await trainAndSaveHRModelArtifact({
      trainingStartDate,
      trainingEndDate,
      minRows: 500,
      featureSetName,
    });

    return NextResponse.json({
      ok: true,
      path: getHRModelArtifactPath(),
      artifact,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to train model artifact';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
