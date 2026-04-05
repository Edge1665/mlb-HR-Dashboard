import { NextResponse } from 'next/server';
import { fetchHistoryDates, fetchHistoryForDate } from '@/services/hrHistoryService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/hr-history?date=YYYY-MM-DD  → fetch picks+outcomes for a date
// GET /api/hr-history                  → fetch list of available dates
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (date) {
      const entry = await fetchHistoryForDate(date);
      if (!entry) {
        return NextResponse.json({ error: 'No data for this date' }, { status: 404 });
      }
      return NextResponse.json(entry);
    }

    const dates = await fetchHistoryDates();
    return NextResponse.json({ dates });
  } catch (err) {
    console.error('[hr-history] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
