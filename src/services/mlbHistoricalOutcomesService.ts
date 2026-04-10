import { fetchLiveMLBData } from '@/services/liveMLBDataService';

type FeedPlayer = {
  person?: {
    id?: number;
    fullName?: string;
  };
  stats?: {
    batting?: {
      homeRuns?: number;
      atBats?: number;
      hits?: number;
      baseOnBalls?: number;
      strikeOuts?: number;
      rbi?: number;
    };
  };
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
  };
};

export interface BatterOutcomeForDate {
  batterId: string;
  batterName: string;
  hrCount: number;
  hitHr: boolean;
  gamePk: number;
  officialDate: string;
}

function normalizeDate(date: string): string {
  return date.slice(0, 10);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`);
  }

  return (await response.json()) as T;
}

function extractPlayersFromLiveFeed(feed: LiveFeedResponse): FeedPlayer[] {
  const homePlayers = Object.values(feed.liveData?.boxscore?.teams?.home?.players ?? {});
  const awayPlayers = Object.values(feed.liveData?.boxscore?.teams?.away?.players ?? {});
  return [...homePlayers, ...awayPlayers];
}

async function fetchOutcomesForGameFromLiveFeed(
  gamePk: number,
  officialDate: string
): Promise<BatterOutcomeForDate[]> {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
  const feed = await fetchJson<LiveFeedResponse>(url);

  const players = extractPlayersFromLiveFeed(feed);

  return players
    .filter((player) => typeof player.person?.id === 'number')
    .map((player) => {
      const batterId = String(player.person!.id!);
      const batterName = player.person?.fullName ?? batterId;
      const hrCount = player.stats?.batting?.homeRuns ?? 0;

      return {
        batterId,
        batterName,
        hrCount,
        hitHr: hrCount > 0,
        gamePk,
        officialDate: normalizeDate(officialDate),
      };
    });
}

export async function fetchBatterOutcomesForDate(date: string): Promise<{
  officialDate: string;
  sourceGameCount: number;
  outcomes: Record<string, BatterOutcomeForDate>;
  sourceGames: Array<{
    gamePk: number;
    awayTeamId: string;
    homeTeamId: string;
  }>;
}> {
  const normalizedDate = normalizeDate(date);

  const liveData = await fetchLiveMLBData(normalizedDate);
  const sourceGames = (liveData.games ?? []).map((game) => ({
    gamePk: Number(game.id),
    awayTeamId: String(game.awayTeamId),
    homeTeamId: String(game.homeTeamId),
  }));

  const outcomeMap: Record<string, BatterOutcomeForDate> = {};

  for (const game of sourceGames) {
    if (!Number.isFinite(game.gamePk)) continue;

    const outcomes = await fetchOutcomesForGameFromLiveFeed(game.gamePk, normalizedDate);

    for (const outcome of outcomes) {
      outcomeMap[outcome.batterId] = outcome;
    }
  }

  return {
    officialDate: normalizedDate,
    sourceGameCount: sourceGames.length,
    outcomes: outcomeMap,
    sourceGames,
  };
}