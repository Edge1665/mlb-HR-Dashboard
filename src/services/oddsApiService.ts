import { getTeamFullName } from '@/services/mlbTeamMetadata';

interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiOutcome {
  name?: string;
  description?: string;
  price?: number;
  point?: number;
}

export interface HRPropPrice {
  playerName: string;
  sportsbook: string;
  market: string;
  line: number | null;
  americanOdds: number;
  impliedProbability: number;
}

export interface DailyOddsLookup {
  byPlayerName: Record<string, HRPropPrice>;
  status: 'live' | 'cached' | 'unavailable';
  cachedAt: string | null;
  cacheTtlMinutes: number;
}

function normalizeSportsbookName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface TimedCacheEntry<T> {
  value: T;
  cachedAtMs: number;
}

const ODDS_CACHE_TTL_MS = 10 * 60 * 1000;
const LIVE_ODDS_CACHE_VERSION = 'live-odds-v3';

const globalCache = globalThis as typeof globalThis & {
  __oddsApiEventsCache?: TimedCacheEntry<OddsApiEvent[]>;
  __oddsApiEventPropsCache?: Record<string, TimedCacheEntry<OddsApiEvent>>;
  __oddsDailyLookupCache?: Record<string, TimedCacheEntry<DailyOddsLookup>>;
  __oddsApiEventsInflight?: Promise<OddsApiEvent[]> | null;
  __oddsApiEventPropsInflight?: Record<string, Promise<OddsApiEvent>>;
  __oddsDailyLookupInflight?: Record<string, Promise<DailyOddsLookup>>;
};

if (!globalCache.__oddsApiEventPropsCache) {
  globalCache.__oddsApiEventPropsCache = {};
}

if (!globalCache.__oddsDailyLookupCache) {
  globalCache.__oddsDailyLookupCache = {};
}

if (!globalCache.__oddsApiEventPropsInflight) {
  globalCache.__oddsApiEventPropsInflight = {};
}

if (!globalCache.__oddsDailyLookupInflight) {
  globalCache.__oddsDailyLookupInflight = {};
}

function buildEmptyOddsLookup(status: 'cached' | 'unavailable' = 'unavailable'): DailyOddsLookup {
  return {
    byPlayerName: {},
    status,
    cachedAt: null,
    cacheTtlMinutes: Math.round(ODDS_CACHE_TTL_MS / 60000),
  };
}

function normalizeTeamName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizePlayerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, '')
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenizePlayerName(value: string): string[] {
  return normalizePlayerName(value)
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildPlayerNameKeys(value: string): string[] {
  const normalized = normalizePlayerName(value);
  const tokens = tokenizePlayerName(value);

  if (tokens.length === 0) return [];

  const keys = new Set<string>();
  keys.add(normalized);

  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];

    keys.add(`${first} ${last}`);
    keys.add(`${first.charAt(0)} ${last}`);
    keys.add(`${first.charAt(0)}${last}`);
    keys.add(`${last} ${first}`);
  }

  return Array.from(keys);
}

function namesLikelyMatch(a: string, b: string): boolean {
  const aKeys = buildPlayerNameKeys(a);
  const bKeys = buildPlayerNameKeys(b);

  for (const aKey of aKeys) {
    for (const bKey of bKeys) {
      if (aKey === bKey) return true;
    }
  }

  const aTokens = tokenizePlayerName(a);
  const bTokens = tokenizePlayerName(b);

  if (aTokens.length >= 2 && bTokens.length >= 2) {
    const aFirst = aTokens[0];
    const aLast = aTokens[aTokens.length - 1];
    const bFirst = bTokens[0];
    const bLast = bTokens[bTokens.length - 1];

    if (aLast === bLast) {
      if (aFirst === bFirst) return true;
      if (aFirst.charAt(0) === bFirst.charAt(0)) return true;
    }
  }

  return false;
}

function americanOddsToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`The Odds API error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

function isCacheFresh(cachedAtMs: number): boolean {
  return Date.now() - cachedAtMs < ODDS_CACHE_TTL_MS;
}

function buildDailyLookupCacheKey(
  games: Array<{
    awayTeamId: string;
    homeTeamId: string;
  }>,
  sportsbooks?: string[]
): string {
  const gamesKey = games
    .map((game) => `${game.awayTeamId}@${game.homeTeamId}`)
    .sort()
    .join('|');
  const booksKey = (sportsbooks ?? [])
    .map((book) => normalizeSportsbookName(book))
    .sort()
    .join(',');
  return `${LIVE_ODDS_CACHE_VERSION}__${gamesKey}__${booksKey}`;
}

async function fetchMlbEvents(apiKey: string): Promise<OddsApiEvent[]> {
  const cached = globalCache.__oddsApiEventsCache;
  if (cached && isCacheFresh(cached.cachedAtMs)) {
    return cached.value;
  }

  if (globalCache.__oddsApiEventsInflight) {
    return globalCache.__oddsApiEventsInflight;
  }

  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=us` +
    `&markets=h2h` +
    `&oddsFormat=american` +
    `&dateFormat=iso`;

  const request = fetchJson<OddsApiEvent[]>(url)
    .then((events) => {
      globalCache.__oddsApiEventsCache = {
        value: events,
        cachedAtMs: Date.now(),
      };
      return events;
    })
    .finally(() => {
      globalCache.__oddsApiEventsInflight = null;
    });

  globalCache.__oddsApiEventsInflight = request;
  return request;
}

async function fetchEventHrProps(apiKey: string, eventId: string): Promise<OddsApiEvent> {
  const cached = globalCache.__oddsApiEventPropsCache?.[eventId];
  if (cached && isCacheFresh(cached.cachedAtMs)) {
    return cached.value;
  }

  const inflight = globalCache.__oddsApiEventPropsInflight?.[eventId];
  if (inflight) {
    return inflight;
  }

  const url =
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=us` +
    `&markets=batter_home_runs` +
    `&oddsFormat=american` +
    `&dateFormat=iso`;

  const request = fetchJson<OddsApiEvent>(url)
    .then((event) => {
      globalCache.__oddsApiEventPropsCache![eventId] = {
        value: event,
        cachedAtMs: Date.now(),
      };
      return event;
    })
    .finally(() => {
      delete globalCache.__oddsApiEventPropsInflight![eventId];
    });

  globalCache.__oddsApiEventPropsInflight![eventId] = request;
  return request;
}

function findMatchingEventId(
  events: OddsApiEvent[],
  homeTeamId: string,
  awayTeamId: string
): string | null {
  const expectedHome = normalizeTeamName(getTeamFullName(homeTeamId));
  const expectedAway = normalizeTeamName(getTeamFullName(awayTeamId));

  const match = events.find((event) => {
    const home = normalizeTeamName(event.home_team);
    const away = normalizeTeamName(event.away_team);
    return home === expectedHome && away === expectedAway;
  });

  return match?.id ?? null;
}

function parseLiveHrOddsResponse(
  event: OddsApiEvent,
  sportsbooks?: string[]
): Record<string, HRPropPrice> {
  const bestByPlayer: Record<string, HRPropPrice> = {};
  const allowedSportsbooks =
    sportsbooks && sportsbooks.length > 0
      ? new Set(sportsbooks.map((book) => normalizeSportsbookName(book)))
      : null;

  for (const bookmaker of event.bookmakers ?? []) {
    if (allowedSportsbooks) {
      const normalizedTitle = normalizeSportsbookName(bookmaker.title);
      const normalizedKey = normalizeSportsbookName(bookmaker.key);
      if (
        !allowedSportsbooks.has(normalizedTitle) &&
        !allowedSportsbooks.has(normalizedKey)
      ) {
        continue;
      }
    }

    for (const market of bookmaker.markets ?? []) {
      if (market.key !== 'batter_home_runs') continue;

      for (const outcome of market.outcomes ?? []) {
        const label = outcome.name ?? '';
        const description = outcome.description ?? '';
        const point = typeof outcome.point === 'number' ? outcome.point : null;
        const price = typeof outcome.price === 'number' ? outcome.price : null;

        if (label.toLowerCase() !== 'over' || !description || price == null) {
          continue;
        }

        if (point !== 0.5) {
          continue;
        }

        const impliedProbability = americanOddsToImpliedProbability(price);

        const candidate: HRPropPrice = {
          playerName: description,
          sportsbook: bookmaker.title,
          market: market.key,
          line: point,
          americanOdds: price,
          impliedProbability,
        };

        const nameKeys = buildPlayerNameKeys(description);

        for (const key of nameKeys) {
          const existing = bestByPlayer[key];
          if (!existing || candidate.impliedProbability > existing.impliedProbability) {
            bestByPlayer[key] = candidate;
          }
        }
      }
    }
  }

  return bestByPlayer;
}

function debugLogLiveOddsSample(
  lookup: Record<string, HRPropPrice>,
  sourceEndpoint: string
) {
  if (process.env.HR_LIVE_ODDS_DEBUG !== '1') {
    return;
  }

  const samplePlayers = ['Aaron Judge', 'Salvador Perez', 'Matt Wallner'];
  for (const player of samplePlayers) {
    const keys = buildPlayerNameKeys(player);
    const match = keys.map((key) => lookup[key]).find(Boolean);
    console.log(
      '[oddsApiService] live-odds-sanity',
      JSON.stringify({
        player,
        sportsbook: match?.sportsbook ?? null,
        rawLiveOddsFound: match?.americanOdds ?? null,
        impliedProbability: match?.impliedProbability ?? null,
        matchedMarketKey: match?.market ?? null,
        sourceEndpoint,
      })
    );
  }
}

export async function buildDailyHrOddsLookup(
  games: Array<{
    awayTeamId: string;
    homeTeamId: string;
  }>,
  sportsbooks?: string[]
): Promise<DailyOddsLookup> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    return buildEmptyOddsLookup();
  }

  const cacheKey = buildDailyLookupCacheKey(games, sportsbooks);
  const cachedLookup = globalCache.__oddsDailyLookupCache?.[cacheKey];
  if (cachedLookup && isCacheFresh(cachedLookup.cachedAtMs)) {
    return {
      ...cachedLookup.value,
      status: 'cached',
      cachedAt: new Date(cachedLookup.cachedAtMs).toISOString(),
    };
  }

  const inflightLookup = globalCache.__oddsDailyLookupInflight?.[cacheKey];
  if (inflightLookup) {
    return inflightLookup;
  }

  const request = (async () => {
    const events = await fetchMlbEvents(apiKey);

    const uniqueEventIds = new Set<string>();
    for (const game of games) {
      const eventId = findMatchingEventId(events, game.homeTeamId, game.awayTeamId);
      if (eventId) {
        uniqueEventIds.add(eventId);
      }
    }

    const byPlayerName: Record<string, HRPropPrice> = {};

    for (const eventId of uniqueEventIds) {
      try {
        const eventWithProps = await fetchEventHrProps(apiKey, eventId);
        const props = parseLiveHrOddsResponse(eventWithProps, sportsbooks);

        for (const [playerKey, price] of Object.entries(props)) {
          const existing = byPlayerName[playerKey];
          if (!existing || price.impliedProbability > existing.impliedProbability) {
            byPlayerName[playerKey] = price;
          }
        }
      } catch {
        // Skip event if props are unavailable
      }
    }

    const lookup: DailyOddsLookup = {
      byPlayerName,
      status: 'live',
      cachedAt: null,
      cacheTtlMinutes: Math.round(ODDS_CACHE_TTL_MS / 60000),
    };
    debugLogLiveOddsSample(
      byPlayerName,
      'https://api.the-odds-api.com/v4/sports/baseball_mlb/events/{eventId}/odds'
    );
    globalCache.__oddsDailyLookupCache![cacheKey] = {
      value: lookup,
      cachedAtMs: Date.now(),
    };
    return lookup;
  })().finally(() => {
    delete globalCache.__oddsDailyLookupInflight![cacheKey];
  });

  globalCache.__oddsDailyLookupInflight![cacheKey] = request;
  return request;
}

export function normalizePlayerNameForOdds(name: string): string {
  return normalizePlayerName(name);
}

export function findBestOddsMatch(
  lookup: Record<string, HRPropPrice>,
  batterName: string
): HRPropPrice | null {
  const directKeys = buildPlayerNameKeys(batterName);

  for (const key of directKeys) {
    if (lookup[key]) {
      return lookup[key];
    }
  }

  for (const [lookupKey, price] of Object.entries(lookup)) {
    if (namesLikelyMatch(lookupKey, batterName) || namesLikelyMatch(price.playerName, batterName)) {
      return price;
    }
  }

  return null;
}
