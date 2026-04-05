import { NextResponse } from 'next/server';
import { updateHROutcome } from '@/services/hrHistoryService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/hr-history/outcomes
// Body: { pickId, hitHr, hrCount }
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { pickId, hitHr, hrCount = 0 } = body;

    if (!pickId || typeof hitHr !== 'boolean') {
      return NextResponse.json({ error: 'pickId and hitHr (boolean) required' }, { status: 400 });
    }

    const result = await updateHROutcome(pickId, hitHr, hrCount);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[hr-history/outcomes] Error:', err);
    return NextResponse.json({ error: 'Failed to update outcome' }, { status: 500 });
  }
}
