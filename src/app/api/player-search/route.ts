import { NextRequest, NextResponse } from 'next/server';
import { searchPlayers } from '@/services/playerResearchApi';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ players: [] });
  }
  try {
    const players = await searchPlayers(q.trim());
    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ players: [] }, { status: 500 });
  }
}
