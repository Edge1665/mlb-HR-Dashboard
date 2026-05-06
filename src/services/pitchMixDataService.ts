import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createEmptyPitchGroupRecord,
  normalizePitchGroupUsage,
  PITCH_GROUPS,
  PITCH_GROUP_SOURCE_CODES,
  type PitchGroup,
  type PitchGroupMetricRecord,
} from '@/services/pitchMixTaxonomy';

const SAVANT_PITCH_ARSENAL_URL =
  'https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats';
const PITCH_MIX_CACHE_DIR = path.join(process.cwd(), 'output', 'cache', 'pitch-mix');
const PITCH_MIX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type SavantLeaderboardType = 'pitcher' | 'batter';
type PitchMixSourceMode = 'disabled' | 'baseballsavant';

interface PitchMixFileCachePayload {
  fetchedAt: string;
  season: number;
  source: PitchMixSourceMode;
  pitchersById: Record<string, PitchMixPitcherProfile>;
  battersById: Record<string, PitchMixBatterProfile>;
  diagnostics: PitchMixDiagnostics;
}

interface SavantPitchRow {
  playerId: string;
  sampleSize: number;
  xSlugging: number | null;
  slugging: number | null;
  iso: number | null;
  hardHitRate: number | null;
  barrelRate: number | null;
}

export interface PitchMixPitcherProfile {
  pitchMix: PitchGroupMetricRecord;
  totalTrackedPitches: number;
  source: string;
}

export interface PitchMixBatterProfile {
  pitchTypeSkill: PitchGroupMetricRecord;
  sampleByGroup: PitchGroupMetricRecord;
  source: string;
}

export interface PitchMixDiagnostics {
  season: number;
  sourceMode: PitchMixSourceMode;
  cacheHit: boolean;
  fetchedAt: string | null;
  attempted: boolean;
  succeeded: boolean;
  pitcherRows: number;
  batterRows: number;
  groupsWithPitcherData: string[];
  groupsWithBatterData: string[];
  errors: string[];
}

export interface PitchMixDataset {
  pitchersById: Record<string, PitchMixPitcherProfile>;
  battersById: Record<string, PitchMixBatterProfile>;
  diagnostics: PitchMixDiagnostics;
}

const seasonCache = new Map<number, PitchMixFileCachePayload>();

function getPitchMixSourceMode(): PitchMixSourceMode {
  const mode = String(process.env.PITCH_MIX_SOURCE_MODE ?? '').trim().toLowerCase();
  if (mode === 'baseballsavant') return 'baseballsavant';
  return 'disabled';
}

function getCachePath(season: number): string {
  return path.join(PITCH_MIX_CACHE_DIR, `${season}.json`);
}

async function ensureCacheDir(): Promise<void> {
  await mkdir(PITCH_MIX_CACHE_DIR, { recursive: true });
}

function buildEmptyDiagnostics(season: number, sourceMode: PitchMixSourceMode): PitchMixDiagnostics {
  return {
    season,
    sourceMode,
    cacheHit: false,
    fetchedAt: null,
    attempted: sourceMode !== 'disabled',
    succeeded: false,
    pitcherRows: 0,
    batterRows: 0,
    groupsWithPitcherData: [],
    groupsWithBatterData: [],
    errors: [],
  };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function getHeaderIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  return headers.findIndex((header) => normalizedAliases.includes(header.toLowerCase()));
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(String(value).replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function computeBatterPitchSkill(row: SavantPitchRow): number {
  const xSlugging = row.xSlugging ?? row.slugging ?? 0.42;
  const iso = row.iso ?? Math.max(0, xSlugging - 0.25);
  const hardHitRate = row.hardHitRate ?? 35;
  const barrelRate = row.barrelRate ?? 8;

  const skill =
    ((xSlugging - 0.42) * 4.5) +
    ((iso - 0.16) * 3.2) +
    ((hardHitRate - 38) * 0.03) +
    ((barrelRate - 8) * 0.05);

  return Math.max(-2, Math.min(2, Number(skill.toFixed(4))));
}

async function readCachedSeasonPayload(
  season: number,
  sourceMode: PitchMixSourceMode
): Promise<PitchMixFileCachePayload | null> {
  const memoryCached = seasonCache.get(season);
  if (
    memoryCached &&
    memoryCached.source === sourceMode &&
    Date.now() - new Date(memoryCached.fetchedAt).getTime() < PITCH_MIX_CACHE_TTL_MS
  ) {
    return memoryCached;
  }

  try {
    const raw = await readFile(getCachePath(season), 'utf-8');
    const parsed = JSON.parse(raw) as PitchMixFileCachePayload;
    if (
      parsed.source !== sourceMode ||
      Date.now() - new Date(parsed.fetchedAt).getTime() >= PITCH_MIX_CACHE_TTL_MS
    ) {
      return null;
    }

    seasonCache.set(season, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedSeasonPayload(payload: PitchMixFileCachePayload): Promise<void> {
  await ensureCacheDir();
  seasonCache.set(payload.season, payload);
  await writeFile(getCachePath(payload.season), JSON.stringify(payload, null, 2), 'utf-8');
}

async function fetchSavantPitchArsenalRows(
  season: number,
  type: SavantLeaderboardType,
  pitchCode: string
): Promise<SavantPitchRow[]> {
  const url = `${SAVANT_PITCH_ARSENAL_URL}?year=${season}&type=${type}&team=&min=1&minPitches=1&sort=0&sortDir=desc&pitchType=${pitchCode}&csv=true`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MLBAnalytics/1.0)' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`${type}:${pitchCode}:${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buffer);
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.trim().replace(/^"|"$/g, ''));

  const playerIdIndex = getHeaderIndex(headers, ['player_id', 'playerid', 'mlb_id', 'id']);
  const pitchesIndex = getHeaderIndex(headers, ['pitches', 'pitch_count', 'pitchcount']);
  const paIndex = getHeaderIndex(headers, ['pa', 'plate_appearances']);
  const bbeIndex = getHeaderIndex(headers, ['bbe', 'batted_ball_events']);
  const xslgIndex = getHeaderIndex(headers, ['xslg']);
  const slgIndex = getHeaderIndex(headers, ['slg']);
  const isoIndex = getHeaderIndex(headers, ['iso', 'xiso']);
  const hardHitIndex = getHeaderIndex(headers, ['hard_hit_percent', 'hardhit%', 'hard_hit_pct']);
  const barrelIndex = getHeaderIndex(headers, ['barrel_batted_rate', 'barrel%', 'barrel_pct']);

  if (playerIdIndex === -1) {
    return [];
  }

  const rows: SavantPitchRow[] = [];

  for (const rawLine of lines.slice(1)) {
    if (!rawLine.trim()) continue;
    const columns = splitCsvLine(rawLine);
    const playerId = columns[playerIdIndex]?.replace(/^"|"$/g, '');
    if (!playerId) continue;

    const sampleSize =
      parseNumber(columns[paIndex]) ??
      parseNumber(columns[pitchesIndex]) ??
      parseNumber(columns[bbeIndex]) ??
      0;

    rows.push({
      playerId,
      sampleSize,
      xSlugging: parseNumber(columns[xslgIndex]),
      slugging: parseNumber(columns[slgIndex]),
      iso: parseNumber(columns[isoIndex]),
      hardHitRate: parseNumber(columns[hardHitIndex]),
      barrelRate: parseNumber(columns[barrelIndex]),
    });
  }

  return rows;
}

async function fetchBaseballSavantPitchMixDataset(season: number): Promise<PitchMixDataset> {
  const diagnostics = buildEmptyDiagnostics(season, 'baseballsavant');
  const pitcherUsageAccumulator = new Map<string, Record<PitchGroup, number>>();
  const batterSkillAccumulator = new Map<
    string,
    Record<PitchGroup, { weightedSkill: number; totalSample: number }>
  >();

  for (const group of PITCH_GROUPS) {
    const rawPitchCodes = PITCH_GROUP_SOURCE_CODES[group];
    let groupHasPitcherData = false;
    let groupHasBatterData = false;

    for (const pitchCode of rawPitchCodes) {
      try {
        const [pitcherRows, batterRows] = await Promise.all([
          fetchSavantPitchArsenalRows(season, 'pitcher', pitchCode),
          fetchSavantPitchArsenalRows(season, 'batter', pitchCode),
        ]);

        diagnostics.pitcherRows += pitcherRows.length;
        diagnostics.batterRows += batterRows.length;

        for (const row of pitcherRows) {
          const existing = pitcherUsageAccumulator.get(row.playerId) ?? createEmptyPitchGroupRecord();
          existing[group] = (existing[group] ?? 0) + Math.max(0, row.sampleSize);
          pitcherUsageAccumulator.set(row.playerId, existing);
          groupHasPitcherData = true;
        }

        for (const row of batterRows) {
          const skill = computeBatterPitchSkill(row);
          const existing =
            batterSkillAccumulator.get(row.playerId) ??
            Object.fromEntries(
              PITCH_GROUPS.map((pitchGroup) => [pitchGroup, { weightedSkill: 0, totalSample: 0 }])
            ) as Record<PitchGroup, { weightedSkill: number; totalSample: number }>;

          const sampleSize = Math.max(1, row.sampleSize);
          existing[group].weightedSkill += skill * sampleSize;
          existing[group].totalSample += sampleSize;
          batterSkillAccumulator.set(row.playerId, existing);
          groupHasBatterData = true;
        }
      } catch (error) {
        diagnostics.errors.push(
          `baseballsavant ${group}/${pitchCode}: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      }
    }

    if (groupHasPitcherData) diagnostics.groupsWithPitcherData.push(group);
    if (groupHasBatterData) diagnostics.groupsWithBatterData.push(group);
  }

  const pitchersById = Object.fromEntries(
    Array.from(pitcherUsageAccumulator.entries()).map(([playerId, usageRecord]) => {
      const normalizedUsage = normalizePitchGroupUsage(usageRecord);
      const totalTrackedPitches = Object.values(usageRecord).reduce((sum, value) => sum + value, 0);

      return [
        playerId,
        {
          pitchMix: normalizedUsage,
          totalTrackedPitches,
          source: 'baseballsavant-pitch-arsenal',
        } satisfies PitchMixPitcherProfile,
      ];
    })
  );

  const battersById = Object.fromEntries(
    Array.from(batterSkillAccumulator.entries()).map(([playerId, accumulator]) => {
      const pitchTypeSkill: PitchGroupMetricRecord = {};
      const sampleByGroup: PitchGroupMetricRecord = {};

      for (const group of PITCH_GROUPS) {
        const totalSample = accumulator[group].totalSample;
        if (totalSample <= 0) continue;
        pitchTypeSkill[group] = Number(
          (accumulator[group].weightedSkill / totalSample).toFixed(4)
        );
        sampleByGroup[group] = Number(totalSample.toFixed(4));
      }

      return [
        playerId,
        {
          pitchTypeSkill,
          sampleByGroup,
          source: 'baseballsavant-pitch-arsenal',
        } satisfies PitchMixBatterProfile,
      ];
    })
  );

  diagnostics.succeeded =
    diagnostics.groupsWithPitcherData.length > 0 || diagnostics.groupsWithBatterData.length > 0;
  diagnostics.fetchedAt = new Date().toISOString();

  return {
    pitchersById,
    battersById,
    diagnostics,
  };
}

export async function fetchSeasonPitchMixDataset(season: number): Promise<PitchMixDataset> {
  const sourceMode = getPitchMixSourceMode();
  const cached = await readCachedSeasonPayload(season, sourceMode);

  if (cached) {
    return {
      pitchersById: cached.pitchersById,
      battersById: cached.battersById,
      diagnostics: {
        ...cached.diagnostics,
        cacheHit: true,
      },
    };
  }

  if (sourceMode === 'disabled') {
    return {
      pitchersById: {},
      battersById: {},
      diagnostics: buildEmptyDiagnostics(season, sourceMode),
    };
  }

  const dataset = await fetchBaseballSavantPitchMixDataset(season);

  await writeCachedSeasonPayload({
    fetchedAt: dataset.diagnostics.fetchedAt ?? new Date().toISOString(),
    season,
    source: sourceMode,
    pitchersById: dataset.pitchersById,
    battersById: dataset.battersById,
    diagnostics: dataset.diagnostics,
  });

  return dataset;
}
