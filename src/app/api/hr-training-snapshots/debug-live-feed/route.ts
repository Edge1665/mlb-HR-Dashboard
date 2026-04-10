import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type FeedPlayer = {
  person?: {
    id?: number;
    fullName?: string;
  };
  stats?: Record<string, unknown>;
};

type LiveFeedResponse = {
  liveData?: {
    boxscore?: {
      teams?: {
        home?: {
          players?: Record<string, FeedPlayer>;
        };
        away?: {
          players?: Record<string, FeedPlayer>;
        };
      };
    };
    plays?: unknown;
    linescore?: unknown;
  };
  gameData?: unknown;
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

    const url = `https://statsapi.mlb.com/api/v1.1/game/${numericGamePk}/feed/live`;
    const feed = await fetchJson<LiveFeedResponse>(url);

    const homePlayers = Object.values(feed.liveData?.boxscore?.teams?.home?.players ?? {});
    const awayPlayers = Object.values(feed.liveData?.boxscore?.teams?.away?.players ?? {});
    const allPlayers = [...homePlayers, ...awayPlayers];

    const first20 = allPlayers.slice(0, 20).map((player) => ({
      id: player.person?.id,
      name: player.person?.fullName,
      statsKeys: Object.keys(player.stats ?? {}),
      stats: player.stats,
    }));

    return NextResponse.json({
      gamePk: numericGamePk,
      playerCount: allPlayers.length,
      first20,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown debug-live-feed error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}