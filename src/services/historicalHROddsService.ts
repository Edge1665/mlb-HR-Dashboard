import fs from 'fs/promises';
import path from 'path';
import {
  buildHistoricalOddsPlayerNameKeys,
  normalizeHistoricalOddsPlayerName,
} from '@/services/historicalOddsMatcher';

interface HistoricalOddsApiEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
}

interface HistoricalOddsApiBookmaker {
  key: string;
  title: string;
  markets?: Array<{
    key: string;
    last_update?: string;
    outcomes?: Array<{
      name?: string;
      description?: string;
      price?: number;
      point?: number;
    }>;
  }>;
}

interface HistoricalOddsApiEventOddsResponse {
  timestamp: string;
  previous_timestamp?: string;
  next_timestamp?: string;
  data: {
    id: string;
    home_team: string;
    away_team: string;
    commence_time: string;
    bookmakers?: HistoricalOddsApiBookmaker[];
  };
}

interface HistoricalOddsApiEventsResponse {
  timestamp: string;
  previous_timestamp?: string;
  next_timestamp?: string;
  data: HistoricalOddsApiEvent[];
}

export interface HistoricalHROddsRecord {
  targetDate: string;
  requestedSnapshotTimestamp: string;
  resolvedSnapshotTimestamp: string;
  eventId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  sportsbook: string;
  sportsbookKey: string;
  market: string;
  marketTimestamp: string | null;
  playerName: string;
  normalizedPlayerName: string;
  playerNameKeys: string[];
  line: number | null;
  americanOdds: number;
  impliedProbability: number;
}

export interface HistoricalHROddsCacheArtifact {
  targetDate: string;
  sportsbooks: string[];
  market: string;
  fetchedAt: string;
  attemptedSnapshotTimestamps: string[];
  resolvedSnapshotTimestamp: string | null;
  apiUsage: HistoricalHROddsApiUsage;
  records: HistoricalHROddsRecord[];
}

export interface HistoricalHROddsApiUsage {
  cacheHit: boolean;
  historicalEventsCalls: number;
  historicalEventOddsCalls: number;
  totalApiCalls: number;
  estimatedCredits: number;
}

export interface HistoricalOddsVerificationRequestLog {
  stage: 'events' | 'event_odds';
  targetDate: string;
  snapshotTimestamp: string;
  eventId?: string;
  url: string;
}

export interface HistoricalOddsVerificationResponseLog {
  stage: 'events' | 'event_odds';
  targetDate: string;
  snapshotTimestamp: string;
  eventId?: string;
  responseTimestamp: string | null;
  eventCount?: number;
  bookmakerKeys?: string[];
  bookmakerTitles?: string[];
  filteredBookmakerKeys?: string[];
  filteredBookmakerTitles?: string[];
  marketKeys?: string[];
  filteredMarketKeys?: string[];
  bookmakerCount?: number;
  draftKingsBookmakerCount?: number;
  marketCount?: number;
  batterHomeRunsMarketCount?: number;
  batterHomeRunsPresent?: boolean;
  outcomeCount?: number;
  usableRecordCount?: number;
  rawBatterHomeRunsRecordCount?: number;
  filteredBatterHomeRunsRecordCount?: number;
  rawDraftKingsBatterHomeRunsRecordCount?: number;
  missingPointRecordCount?: number;
}

export interface HistoricalOddsSingleDateVerificationResult {
  targetDate: string;
  sportsbooks: string[];
  market: string;
  attemptedSnapshotTimestamps: string[];
  requestLogs: HistoricalOddsVerificationRequestLog[];
  responseLogs: HistoricalOddsVerificationResponseLog[];
  records: HistoricalHROddsRecord[];
  rawRecords: HistoricalHROddsRecord[];
  draftKingsRecords: HistoricalHROddsRecord[];
  missingPointRecords: HistoricalHROddsRecord[];
  apiUsage: HistoricalHROddsApiUsage;
  wroteCache: boolean;
  abortedReason: string | null;
}

const HR_MARKET_KEY = 'batter_home_runs';
export const HISTORICAL_ODDS_VALIDATION_STATUS = 'unvalidated_for_roi';
const DEFAULT_HR_ODDS_SPORTSBOOKS = ['Caesars', 'BetRivers', 'BetOnline.ag'];
const SPORTSBOOK_PRIORITY: Record<string, number> = {
  williamhillus: 1,
  betrivers: 2,
  betonlineag: 3,
};
const HISTORICAL_ODDS_CACHE_DIR = path.join(
  process.cwd(),
  'output',
  'historical-odds-cache'
);
const HISTORICAL_ODDS_REQUEST_DELAY_MS = Number(
  process.env.HR_HISTORICAL_ODDS_REQUEST_DELAY_MS ?? 1500
);

function normalizeSportsbookName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildCacheKey(targetDate: string, sportsbooks: string[]): string {
  const booksKey = sportsbooks
    .map((book) => normalizeSportsbookName(book))
    .sort()
    .join('__');
  return `${targetDate}__${booksKey || 'all'}.json`;
}

function getCachePath(targetDate: string, sportsbooks: string[]): string {
  return path.join(HISTORICAL_ODDS_CACHE_DIR, buildCacheKey(targetDate, sportsbooks));
}

export async function readHistoricalHROddsCacheForDate(options: {
  targetDate: string;
  sportsbooks?: string[];
}): Promise<HistoricalHROddsCacheArtifact | null> {
  const sportsbooks = options.sportsbooks?.length
    ? options.sportsbooks
    : DEFAULT_HR_ODDS_SPORTSBOOKS;
  const cached = await readJsonIfExists<HistoricalHROddsCacheArtifact>(
    getCachePath(options.targetDate, sportsbooks)
  );

  if (!cached) {
    return null;
  }

  return {
    ...cached,
    market: cached.market ?? HR_MARKET_KEY,
    apiUsage: cached.apiUsage ?? {
      cacheHit: true,
      historicalEventsCalls: 0,
      historicalEventOddsCalls: 0,
      totalApiCalls: 0,
      estimatedCredits: 0,
    },
  };
}

async function ensureCacheDir() {
  await fs.mkdir(HISTORICAL_ODDS_CACHE_DIR, { recursive: true });
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureCacheDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function americanOddsToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }

  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function buildSnapshotCandidates(targetDate: string): string[] {
  const configuredTimes = (process.env.HR_HISTORICAL_ODDS_SNAPSHOT_TIMES_UTC ?? '19:00:00Z')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredTimes.map((time) => `${targetDate}T${time}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const historicalOddsState = globalThis as typeof globalThis & {
    __historicalOddsNextRequestAtMs?: number;
  };
  const nextRequestAtMs = historicalOddsState.__historicalOddsNextRequestAtMs ?? 0;
  const waitMs = Math.max(0, nextRequestAtMs - Date.now());

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });
  historicalOddsState.__historicalOddsNextRequestAtMs =
    Date.now() + HISTORICAL_ODDS_REQUEST_DELAY_MS;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Historical odds API error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function fetchHistoricalEventsSnapshot(
  apiKey: string,
  targetDate: string,
  snapshotTimestamp: string
): Promise<HistoricalOddsApiEventsResponse> {
  const url = buildHistoricalEventsSnapshotUrl(apiKey, targetDate, snapshotTimestamp);

  return fetchJson<HistoricalOddsApiEventsResponse>(url);
}

function buildHistoricalEventsSnapshotUrl(
  apiKey: string,
  targetDate: string,
  snapshotTimestamp: string
): string {
  return (
    `https://api.the-odds-api.com/v4/historical/sports/baseball_mlb/events` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&date=${encodeURIComponent(snapshotTimestamp)}` +
    `&dateFormat=iso` +
    `&commenceTimeFrom=${encodeURIComponent(`${targetDate}T00:00:00Z`)}` +
    `&commenceTimeTo=${encodeURIComponent(`${targetDate}T23:59:59Z`)}`
  );
}

async function fetchHistoricalEventOdds(
  apiKey: string,
  eventId: string,
  snapshotTimestamp: string
): Promise<HistoricalOddsApiEventOddsResponse> {
  const url = buildHistoricalEventOddsUrl(apiKey, eventId, snapshotTimestamp);
  return fetchJson<HistoricalOddsApiEventOddsResponse>(url);
}

function buildHistoricalEventOddsUrl(
  apiKey: string,
  eventId: string,
  snapshotTimestamp: string
): string {
  return (
    `https://api.the-odds-api.com/v4/historical/sports/baseball_mlb/events/${encodeURIComponent(eventId)}/odds` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&date=${encodeURIComponent(snapshotTimestamp)}` +
    `&regions=us` +
    `&markets=${encodeURIComponent(HR_MARKET_KEY)}` +
    `&dateFormat=iso` +
    `&oddsFormat=american`
  );
}

function filterHistoricalOddsResponseBySportsbook(
  response: HistoricalOddsApiEventOddsResponse,
  sportsbooks: string[]
): HistoricalOddsApiEventOddsResponse {
  const allowedSportsbooks =
    sportsbooks.length > 0
      ? new Set(sportsbooks.map((book) => normalizeSportsbookName(book)))
      : null;

  if (!allowedSportsbooks) {
    return response;
  }

  return {
    ...response,
    data: {
      ...response.data,
      bookmakers: (response.data.bookmakers ?? []).filter((bookmaker) => {
        const normalizedTitle = normalizeSportsbookName(bookmaker.title);
        const normalizedKey = normalizeSportsbookName(bookmaker.key);
        return (
          allowedSportsbooks.has(normalizedTitle) || allowedSportsbooks.has(normalizedKey)
        );
      }),
    },
  };
}

function normalizeSportsbookKeyForPriority(value: string): string {
  return normalizeSportsbookName(value).replace(/\s+/g, '');
}

function isAllowedSportsbook(record: HistoricalHROddsRecord, sportsbooks: string[]): boolean {
  const allowedSportsbooks =
    sportsbooks.length > 0
      ? new Set(sportsbooks.map((book) => normalizeSportsbookName(book)))
      : null;

  if (!allowedSportsbooks) {
    return true;
  }

  const normalizedSportsbook = normalizeSportsbookName(record.sportsbook);
  const normalizedSportsbookKey = normalizeSportsbookName(record.sportsbookKey);
  return (
    allowedSportsbooks.has(normalizedSportsbook) ||
    allowedSportsbooks.has(normalizedSportsbookKey)
  );
}

function payoutUnitsFromAmericanOdds(americanOdds: number): number {
  if (americanOdds > 0) {
    return americanOdds / 100;
  }

  return 100 / Math.abs(americanOdds);
}

function selectBestAvailableSportsbookRecords(
  records: HistoricalHROddsRecord[],
  sportsbooks: string[]
): HistoricalHROddsRecord[] {
  const filtered = records.filter((record) => isAllowedSportsbook(record, sportsbooks));
  const bestByPlayer = new Map<string, HistoricalHROddsRecord>();

  for (const record of filtered) {
    const existing = bestByPlayer.get(record.normalizedPlayerName);
    if (!existing) {
      bestByPlayer.set(record.normalizedPlayerName, record);
      continue;
    }

    const payoutDelta =
      payoutUnitsFromAmericanOdds(record.americanOdds) -
      payoutUnitsFromAmericanOdds(existing.americanOdds);
    const existingPriority =
      SPORTSBOOK_PRIORITY[normalizeSportsbookKeyForPriority(existing.sportsbookKey)] ??
      SPORTSBOOK_PRIORITY[normalizeSportsbookKeyForPriority(existing.sportsbook)] ??
      Number.MAX_SAFE_INTEGER;
    const currentPriority =
      SPORTSBOOK_PRIORITY[normalizeSportsbookKeyForPriority(record.sportsbookKey)] ??
      SPORTSBOOK_PRIORITY[normalizeSportsbookKeyForPriority(record.sportsbook)] ??
      Number.MAX_SAFE_INTEGER;

    if (
      payoutDelta > 0 ||
      (Math.abs(payoutDelta) < 1e-9 && currentPriority < existingPriority)
    ) {
      bestByPlayer.set(record.normalizedPlayerName, record);
    }
  }

  return Array.from(bestByPlayer.values());
}

function summarizeHistoricalEventOddsResponse(
  rawResponse: HistoricalOddsApiEventOddsResponse,
  selectedRecords: HistoricalHROddsRecord[],
  targetDate: string,
  snapshotTimestamp: string,
  eventId: string
): HistoricalOddsVerificationResponseLog {
  const rawBookmakers = rawResponse.data.bookmakers ?? [];
  const filteredResponse = filterHistoricalOddsResponseBySportsbook(
    rawResponse,
    DEFAULT_HR_ODDS_SPORTSBOOKS
  );
  const bookmakers = filteredResponse.data.bookmakers ?? [];
  const draftKingsBookmakers = bookmakers.filter((bookmaker) => {
    const normalizedTitle = normalizeSportsbookName(bookmaker.title);
    const normalizedKey = normalizeSportsbookName(bookmaker.key);
    return normalizedTitle.includes('draftkings') || normalizedKey.includes('draftkings');
  });
  const rawMarkets = rawBookmakers.flatMap((bookmaker) => bookmaker.markets ?? []);
  const allMarkets = bookmakers.flatMap((bookmaker) => bookmaker.markets ?? []);
  const hrMarkets = allMarkets.filter((market) => market.key === HR_MARKET_KEY);
  const rawHrMarkets = rawMarkets.filter((market) => market.key === HR_MARKET_KEY);
  const outcomes = hrMarkets.flatMap((market) => market.outcomes ?? []);
  const { records: rawRecords, missingPointRecords } = parseHistoricalHrOddsFromEvent(
    targetDate,
    snapshotTimestamp,
    rawResponse
  );
  const rawDraftKingsRecords = rawRecords.filter((record) => {
    const normalizedSportsbook = normalizeSportsbookName(record.sportsbook);
    const normalizedSportsbookKey = normalizeSportsbookName(record.sportsbookKey);
    return (
      normalizedSportsbook.includes('draftkings') ||
        normalizedSportsbookKey.includes('draftkings')
    );
  });

  return {
    stage: 'event_odds',
    targetDate,
    snapshotTimestamp,
    eventId,
    responseTimestamp: rawResponse.timestamp ?? null,
    bookmakerKeys: Array.from(new Set(rawBookmakers.map((bookmaker) => bookmaker.key))).sort(),
    bookmakerTitles: Array.from(new Set(rawBookmakers.map((bookmaker) => bookmaker.title))).sort(),
    filteredBookmakerKeys: Array.from(
      new Set(bookmakers.map((bookmaker) => bookmaker.key))
    ).sort(),
    filteredBookmakerTitles: Array.from(
      new Set(bookmakers.map((bookmaker) => bookmaker.title))
    ).sort(),
    marketKeys: Array.from(new Set(rawMarkets.map((market) => market.key))).sort(),
    filteredMarketKeys: Array.from(new Set(allMarkets.map((market) => market.key))).sort(),
    bookmakerCount: bookmakers.length,
    draftKingsBookmakerCount: draftKingsBookmakers.length,
    marketCount: allMarkets.length,
    batterHomeRunsMarketCount: hrMarkets.length,
    batterHomeRunsPresent:
      rawHrMarkets.length > 0 || hrMarkets.length > 0,
    outcomeCount: outcomes.length,
    usableRecordCount: selectedRecords.length,
    rawBatterHomeRunsRecordCount: rawRecords.length,
    filteredBatterHomeRunsRecordCount: selectedRecords.length,
    rawDraftKingsBatterHomeRunsRecordCount: rawDraftKingsRecords.length,
    missingPointRecordCount: missingPointRecords.length,
  };
}

function parseHistoricalHrOddsFromEvent(
  targetDate: string,
  requestedSnapshotTimestamp: string,
  response: HistoricalOddsApiEventOddsResponse
): {
  records: HistoricalHROddsRecord[];
  missingPointRecords: HistoricalHROddsRecord[];
} {
  const records: HistoricalHROddsRecord[] = [];
  const missingPointRecords: HistoricalHROddsRecord[] = [];

  for (const bookmaker of response.data.bookmakers ?? []) {
    for (const market of bookmaker.markets ?? []) {
      if (market.key !== HR_MARKET_KEY) {
        continue;
      }

      for (const outcome of market.outcomes ?? []) {
        if (String(outcome.name ?? '').toLowerCase() !== 'over') {
          continue;
        }

        if (!outcome.description || typeof outcome.price !== 'number') {
          continue;
        }

        const record: HistoricalHROddsRecord = {
          targetDate,
          requestedSnapshotTimestamp,
          resolvedSnapshotTimestamp: response.timestamp,
          eventId: response.data.id,
          commenceTime: response.data.commence_time,
          homeTeam: response.data.home_team,
          awayTeam: response.data.away_team,
          sportsbook: bookmaker.title,
          sportsbookKey: bookmaker.key,
          market: market.key,
          marketTimestamp: market.last_update ?? null,
          playerName: outcome.description,
          normalizedPlayerName: normalizeHistoricalOddsPlayerName(outcome.description),
          playerNameKeys: buildHistoricalOddsPlayerNameKeys(outcome.description),
          line: typeof outcome.point === 'number' ? outcome.point : null,
          americanOdds: outcome.price,
          impliedProbability: americanOddsToImpliedProbability(outcome.price),
        };

        if (typeof outcome.point !== 'number') {
          missingPointRecords.push(record);
          continue;
        }

        if (outcome.point !== 0.5) {
          continue;
        }

        records.push(record);
      }
    }
  }

  return {
    records,
    missingPointRecords,
  };
}

export async function loadHistoricalHROddsForDate(options: {
  targetDate: string;
  sportsbooks?: string[];
  forceRefresh?: boolean;
}): Promise<HistoricalHROddsCacheArtifact> {
  const targetDate = options.targetDate;
  const sportsbooks = options.sportsbooks?.length
    ? options.sportsbooks
    : DEFAULT_HR_ODDS_SPORTSBOOKS;
  const cachePath = getCachePath(targetDate, sportsbooks);

  if (!options.forceRefresh) {
    const cached = await readHistoricalHROddsCacheForDate({
      targetDate,
      sportsbooks,
    });
    if (cached) {
      return cached;
    }
  }

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('THE_ODDS_API_KEY is required for historical odds backfill.');
  }

  const attemptedSnapshotTimestamps = buildSnapshotCandidates(targetDate);
  let resolvedSnapshotTimestamp: string | null = null;
  let records: HistoricalHROddsRecord[] = [];
  let historicalEventsCalls = 0;
  let historicalEventOddsCalls = 0;
  let estimatedCredits = 0;

  for (const snapshotTimestamp of attemptedSnapshotTimestamps) {
    historicalEventsCalls += 1;
    const eventsResponse = await fetchHistoricalEventsSnapshot(
      apiKey,
      targetDate,
      snapshotTimestamp
    );
    const eventIds = eventsResponse.data.map((event) => event.id);

    if (eventIds.length === 0) {
      continue;
    }

    estimatedCredits += 1;
    historicalEventOddsCalls += eventIds.length;
    estimatedCredits += eventIds.length;

    const eventResponses: HistoricalOddsApiEventOddsResponse[] = [];
    for (const eventId of eventIds) {
      eventResponses.push(
        await fetchHistoricalEventOdds(apiKey, eventId, snapshotTimestamp)
      );
    }

    records = selectBestAvailableSportsbookRecords(
      eventResponses.flatMap(
        (response) => parseHistoricalHrOddsFromEvent(targetDate, snapshotTimestamp, response).records
      ),
      sportsbooks
    );

    if (records.length > 0) {
      resolvedSnapshotTimestamp = eventResponses[0]?.timestamp ?? eventsResponse.timestamp;
      break;
    }
  }

  const artifact: HistoricalHROddsCacheArtifact = {
    targetDate,
    sportsbooks,
    market: HR_MARKET_KEY,
    fetchedAt: new Date().toISOString(),
    attemptedSnapshotTimestamps,
    resolvedSnapshotTimestamp,
    apiUsage: {
      cacheHit: false,
      historicalEventsCalls,
      historicalEventOddsCalls,
      totalApiCalls: historicalEventsCalls + historicalEventOddsCalls,
      estimatedCredits,
    },
    records,
  };

  await writeJson(cachePath, artifact);
  return artifact;
}

export async function loadHistoricalHROddsForDates(options: {
  targetDates: string[];
  sportsbooks?: string[];
  forceRefresh?: boolean;
}): Promise<Record<string, HistoricalHROddsCacheArtifact>> {
  const dates = Array.from(new Set(options.targetDates)).sort();
  const results: Record<string, HistoricalHROddsCacheArtifact> = {};

  for (const targetDate of dates) {
    results[targetDate] = await loadHistoricalHROddsForDate({
      targetDate,
      sportsbooks: options.sportsbooks,
      forceRefresh: options.forceRefresh,
    });
  }

  return results;
}

export async function verifyHistoricalHROddsForSingleDate(options: {
  targetDate: string;
  sportsbooks?: string[];
  snapshotTimestamp?: string;
  writeCacheOnSuccess?: boolean;
}): Promise<HistoricalOddsSingleDateVerificationResult> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('THE_ODDS_API_KEY is required for historical odds verification.');
  }

  const sportsbooks = options.sportsbooks?.length
    ? options.sportsbooks
    : DEFAULT_HR_ODDS_SPORTSBOOKS;
  const attemptedSnapshotTimestamps = options.snapshotTimestamp
    ? [options.snapshotTimestamp]
    : buildSnapshotCandidates(options.targetDate);
  const requestLogs: HistoricalOddsVerificationRequestLog[] = [];
  const responseLogs: HistoricalOddsVerificationResponseLog[] = [];
  let records: HistoricalHROddsRecord[] = [];
  let rawRecords: HistoricalHROddsRecord[] = [];
  let draftKingsRecords: HistoricalHROddsRecord[] = [];
  let missingPointRecords: HistoricalHROddsRecord[] = [];
  let historicalEventsCalls = 0;
  let historicalEventOddsCalls = 0;
  let estimatedCredits = 0;
  let abortedReason: string | null = null;

  for (const snapshotTimestamp of attemptedSnapshotTimestamps) {
    const eventsUrl = buildHistoricalEventsSnapshotUrl(
      apiKey,
      options.targetDate,
      snapshotTimestamp
    );
    requestLogs.push({
      stage: 'events',
      targetDate: options.targetDate,
      snapshotTimestamp,
      url: eventsUrl,
    });
    historicalEventsCalls += 1;

    const eventsResponse = await fetchJson<HistoricalOddsApiEventsResponse>(eventsUrl);
    responseLogs.push({
      stage: 'events',
      targetDate: options.targetDate,
      snapshotTimestamp,
      responseTimestamp: eventsResponse.timestamp ?? null,
      eventCount: eventsResponse.data.length,
    });

    if (eventsResponse.data.length === 0) {
      abortedReason = 'No MLB events returned for snapshot timestamp.';
      continue;
    }

    estimatedCredits += 1;

    for (const event of eventsResponse.data) {
      const oddsUrl = buildHistoricalEventOddsUrl(apiKey, event.id, snapshotTimestamp);
      requestLogs.push({
        stage: 'event_odds',
        targetDate: options.targetDate,
        snapshotTimestamp,
        eventId: event.id,
        url: oddsUrl,
      });
      historicalEventOddsCalls += 1;
      estimatedCredits += 1;

      const rawResponse = await fetchJson<HistoricalOddsApiEventOddsResponse>(oddsUrl);
      const parsed = parseHistoricalHrOddsFromEvent(
        options.targetDate,
        snapshotTimestamp,
        rawResponse
      );
      const eventRawRecords = parsed.records;
      const eventDraftKingsRecords = eventRawRecords.filter((record) => {
        const normalizedSportsbook = normalizeSportsbookName(record.sportsbook);
        const normalizedSportsbookKey = normalizeSportsbookName(record.sportsbookKey);
        return (
          normalizedSportsbook.includes('draftkings') ||
          normalizedSportsbookKey.includes('draftkings')
        );
      });
      const eventSelectedRecords = selectBestAvailableSportsbookRecords(
        eventRawRecords,
        sportsbooks
      );
      responseLogs.push(
        summarizeHistoricalEventOddsResponse(
          rawResponse,
          eventSelectedRecords,
          options.targetDate,
          snapshotTimestamp,
          event.id
        )
      );

      rawRecords.push(...eventRawRecords);
      draftKingsRecords.push(...eventDraftKingsRecords);
      missingPointRecords.push(...parsed.missingPointRecords);
      records.push(...eventSelectedRecords);
    }

    if (records.length > 0) {
      break;
    }

    abortedReason = 'No usable DraftKings batter_home_runs records were returned.';
  }

  const result: HistoricalOddsSingleDateVerificationResult = {
    targetDate: options.targetDate,
    sportsbooks,
    market: HR_MARKET_KEY,
    attemptedSnapshotTimestamps,
    requestLogs,
    responseLogs,
    records,
    rawRecords,
    draftKingsRecords,
    missingPointRecords,
    apiUsage: {
      cacheHit: false,
      historicalEventsCalls,
      historicalEventOddsCalls,
      totalApiCalls: historicalEventsCalls + historicalEventOddsCalls,
      estimatedCredits,
    },
    wroteCache: false,
    abortedReason,
  };

  if (options.writeCacheOnSuccess !== false && records.length > 0) {
    const artifact: HistoricalHROddsCacheArtifact = {
      targetDate: options.targetDate,
      sportsbooks,
      market: HR_MARKET_KEY,
      fetchedAt: new Date().toISOString(),
      attemptedSnapshotTimestamps,
      resolvedSnapshotTimestamp: records[0]?.resolvedSnapshotTimestamp ?? null,
      apiUsage: result.apiUsage,
      records,
    };
    await writeJson(getCachePath(options.targetDate, sportsbooks), artifact);
    result.wroteCache = true;
  }

  return result;
}
