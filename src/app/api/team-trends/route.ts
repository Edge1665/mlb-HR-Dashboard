import { NextRequest, NextResponse } from 'next/server';
import { fetchTeamTrends, fetchAllTeams } from '@/services/teamTrendsApi';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const listTeams = searchParams.get('list');

  if (listTeams === 'true') {
    const teams = await fetchAllTeams();
    return NextResponse.json({ teams });
  }

  if (!teamId || isNaN(Number(teamId))) {
    return NextResponse.json({ error: 'Invalid teamId' }, { status: 400 });
  }

  const data = await fetchTeamTrends(Number(teamId));
  if (!data) {
    return NextResponse.json({ error: 'Team data unavailable' }, { status: 404 });
  }

  return NextResponse.json(data);
}
