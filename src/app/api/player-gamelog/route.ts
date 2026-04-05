import { NextRequest, NextResponse } from 'next/server';
import { getPlayerGameLog } from '@/services/playerResearchApi';

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get('id');
  const playerId = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

  try {
    const gameLog = await getPlayerGameLog(playerId, 30);
    return NextResponse.json({ gameLog });
  } catch {
    return NextResponse.json({ gameLog: [] }, { status: 500 });
  }
}
