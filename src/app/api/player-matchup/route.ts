import { NextRequest, NextResponse } from 'next/server';
import { getTodaysMatchup } from '@/services/playerResearchApi';

export async function GET(request: NextRequest) {
  const playerIdParam = request.nextUrl.searchParams.get('playerId');
  const teamIdParam = request.nextUrl.searchParams.get('teamId');

  const playerId = playerIdParam ? parseInt(playerIdParam, 10) : NaN;
  const teamId = teamIdParam ? parseInt(teamIdParam, 10) : NaN;

  if (isNaN(playerId) || isNaN(teamId)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  try {
    const matchup = await getTodaysMatchup(playerId, teamId);
    return NextResponse.json({ matchup });
  } catch {
    return NextResponse.json({ matchup: null }, { status: 500 });
  }
}
