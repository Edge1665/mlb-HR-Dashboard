import { NextRequest, NextResponse } from 'next/server';
import {
  getPlayerProfile,
  getPlayerSeasonStats,
  getPlayerSplits,
  getPlayerGameLog,
  computeRecentForm,
} from '@/services/playerResearchApi';

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get('id');
  const playerId = idParam ? parseInt(idParam, 10) : NaN;

  if (isNaN(playerId)) {
    return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
  }

  try {
    const [profile, stats, splits, gameLog] = await Promise.all([
      getPlayerProfile(playerId),
      getPlayerSeasonStats(playerId),
      getPlayerSplits(playerId),
      getPlayerGameLog(playerId, 30),
    ]);

    const form5 = computeRecentForm(gameLog, 5);
    const form10 = computeRecentForm(gameLog, 10);

    return NextResponse.json({ profile, stats, splits, form5, form10 });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch player data' }, { status: 500 });
  }
}
