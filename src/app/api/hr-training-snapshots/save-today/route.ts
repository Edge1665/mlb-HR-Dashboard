import { NextResponse } from 'next/server';
import { saveTodayTrainingSnapshots } from '@/services/hrTrainingSnapshotService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    const result = await saveTodayTrainingSnapshots();

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      savedCount: result.savedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save training snapshots';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
