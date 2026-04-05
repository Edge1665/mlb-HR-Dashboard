import { NextRequest, NextResponse } from 'next/server';
import {
  fetchTrainingExamplesFromSnapshots,
  getTrainingSnapshotSummary,
} from '@/services/hrTrainingSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const startDate = request.nextUrl.searchParams.get('startDate') ?? undefined;
    const endDate = request.nextUrl.searchParams.get('endDate') ?? undefined;
    const includeExamples = request.nextUrl.searchParams.get('includeExamples') === 'true';

    const summary = await getTrainingSnapshotSummary();

    if (!includeExamples) {
      return NextResponse.json({ summary });
    }

    const examples = await fetchTrainingExamplesFromSnapshots({ startDate, endDate });

    return NextResponse.json({
      summary,
      exampleCount: examples.length,
      examples: examples.slice(0, 100),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch training data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
