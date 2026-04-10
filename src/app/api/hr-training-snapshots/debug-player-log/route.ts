import { NextRequest, NextResponse } from 'next/server';
import { getPlayerGameLog } from '@/services/playerResearchApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const playerId = request.nextUrl.searchParams.get('playerId');

    if (!playerId) {
      return NextResponse.json(
        { error: 'playerId query parameter is required' },
        { status: 400 }
      );
    }

    const numericPlayerId = Number(playerId);

    if (!Number.isFinite(numericPlayerId)) {
      return NextResponse.json(
        { error: 'playerId must be numeric' },
        { status: 400 }
      );
    }

    const gameLog = await getPlayerGameLog(numericPlayerId, 20);

    return NextResponse.json({
      playerId: numericPlayerId,
      itemCount: Array.isArray(gameLog) ? gameLog.length : 0,
      first5: Array.isArray(gameLog) ? gameLog.slice(0, 5) : gameLog,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown debug-player-log error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}