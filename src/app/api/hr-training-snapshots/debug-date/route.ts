import { NextRequest, NextResponse } from 'next/server';
import { fetchLiveMLBData } from '@/services/liveMLBDataService';
import { fetchBatterOutcomesForDate } from '@/services/mlbHistoricalOutcomesService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    const liveData = await fetchLiveMLBData(date);
    const outcomes = await fetchBatterOutcomesForDate(date);

    const batterList = Object.values(liveData.batters ?? {});
    const games = liveData.games ?? [];

    return NextResponse.json({
      date,
      snapshotSide: {
        batterCount: batterList.length,
        gameCount: games.length,
        first10Batters: batterList.slice(0, 10).map((b: any) => ({
          id: b.id,
          name: b.name,
          teamId: b.teamId,
        })),
        games: games.map((g: any) => ({
          id: g.id,
          awayTeamId: g.awayTeamId,
          homeTeamId: g.homeTeamId,
          awayPitcherId: g.awayPitcherId,
          homePitcherId: g.homePitcherId,
        })),
      },
      outcomeSide: {
        sourceGameCount: outcomes.sourceGameCount,
        outcomeCount: Object.keys(outcomes.outcomes).length,
        first10Outcomes: Object.values(outcomes.outcomes).slice(0, 10),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown debug-date error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
