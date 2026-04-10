import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type BoxscorePlayer = {
  person?: {
    id?: number;
    fullName?: string;
  };
  stats?: Record<string, unknown>;
};

type BoxscoreResponse = {
  teams?: {
    home?: {
      players?: Record<string, BoxscorePlayer>;
    };
    away?: {
      players?: Record<string, BoxscorePlayer>;
    };
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function GET(request: NextRequest) {
  try {
    const gamePk = request.nextUrl.searchParams.get('gamePk');

    if (!gamePk) {
      return NextResponse.json({ error: 'gamePk is required' }, { status: 400 });
    }

    const numericGamePk = Number(gamePk);
    if (!Number.isFinite(numericGamePk)) {
      return NextResponse.json({ error: 'gamePk must be numeric' }, { status: 400 });
    }

    const url = `https://statsapi.mlb.com/api/v1/game/${numericGamePk}/boxscore`;
    const boxscore = await fetchJson<BoxscoreResponse>(url);

    const homePlayers = Object.values(boxscore.teams?.home?.players ?? {});
    const awayPlayers = Object.values(boxscore.teams?.away?.players ?? {});
    const allPlayers = [...homePlayers, ...awayPlayers];

    const first15 = allPlayers.slice(0, 15).map((player) => ({
      id: player.person?.id,
      name: player.person?.fullName,
      stats: player.stats,
    }));

    const battingSamples = allPlayers
      .filter((player) => player.stats && typeof player.stats === 'object')
      .slice(0, 15)
      .map((player) => ({
        id: player.person?.id,
        name: player.person?.fullName,
        statsKeys: Object.keys(player.stats ?? {}),
        batting: (player.stats as Record<string, unknown>)?.batting ?? null,
      }));

    return NextResponse.json({
      gamePk: numericGamePk,
      first15,
      battingSamples,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown debug-boxscore error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}