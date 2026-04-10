import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildPredictionInput } from '@/services/hrPredictionService';
import { fetchLiveMLBData } from '@/services/liveMLBDataService';
import { buildHRFeatureExample } from '@/services/ml/hrFeatureEngineering';
import { fetchRecentBatterGameLogSummary } from '@/services/mlbPlayerGameLogService';
import { fetchRecentPitcherFormSummary } from '@/services/mlbPitcherRecentFormService';
import type { HRTrainingExample } from '@/services/ml/types';

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function getTodayETDateString(): string {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yyyy = etDate.getFullYear();
  const mm = String(etDate.getMonth() + 1).padStart(2, '0');
  const dd = String(etDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateString(value: string): string {
  return value.slice(0, 10);
}

function getSeasonFromDate(value: string): number {
  const [year] = normalizeDateString(value).split('-').map(Number);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function sumHrCountForExactDate(
  splits: Array<{ date?: string; stat?: { homeRuns?: number | string } }>,
  targetDate: string
): { matched: boolean; hrCount: number } {
  const matchingGames = splits.filter((game) => {
    const gameDate = typeof game?.date === 'string' ? normalizeDateString(game.date) : '';
    return gameDate === targetDate;
  });

  if (matchingGames.length === 0) {
    return { matched: false, hrCount: 0 };
  }

  const hrCount = matchingGames.reduce(
    (sum, game) => sum + Number(game?.stat?.homeRuns ?? 0),
    0
  );

  return { matched: true, hrCount };
}

async function fetchAllSnapshotRows(
  columns: string,
  filters?: { startDate?: string; endDate?: string; labeledOnly?: boolean }
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabase();
  const pageSize = 1000;
  let from = 0;
  let allRows: Record<string, unknown>[] = [];

  while (true) {
    let query = supabase
      .from('hr_feature_snapshots')
      .select(columns)
      .order('snapshot_date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (filters?.startDate) {
      query = query.gte('snapshot_date', filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte('snapshot_date', filters.endDate);
    }

    if (filters?.labeledOnly) {
      query = query.not('hit_hr', 'is', null);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = new Array(items.length);
  let currentIndex = 0;

  async function runWorker() {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;

      if (index >= items.length) return;

      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);

  return results;
}

export interface SaveSnapshotResult {
  success: boolean;
  savedCount: number;
  error?: string;
}

export async function saveTodayTrainingSnapshots(): Promise<SaveSnapshotResult> {
  const snapshotDate = getTodayETDateString();
  return saveSnapshotsForDate(snapshotDate);
}

export async function saveSnapshotsForDate(date: string): Promise<SaveSnapshotResult> {
  const supabase = getSupabase();
  const normalizedDate = normalizeDateString(date);
  const season = getSeasonFromDate(normalizedDate);

  try {
    const { batters, pitchers, games, ballparks } = await fetchLiveMLBData(normalizedDate);
    const batterList = Object.values(batters);

    if (batterList.length === 0) {
      return {
        success: true,
        savedCount: 0,
      };
    }

    const rows = await mapWithConcurrency(batterList, 8, async (batter) => {
      if (!batter?.id || !batter?.teamId) return null;

      const game = games.find(
        (g) => g.awayTeamId === batter.teamId || g.homeTeamId === batter.teamId
      );
      if (!game) return null;

      const isHome = game.homeTeamId === batter.teamId;
      const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
      const pitcher = pitcherId ? (pitchers[pitcherId] ?? undefined) : undefined;
      const ballpark = game.ballparkId ? (ballparks[game.ballparkId] ?? undefined) : undefined;

      const input = buildPredictionInput(batter, pitcher, game, ballpark);
      const baseExample = buildHRFeatureExample(input, 0, normalizedDate);

      let recentBatterLog = null;
      try {
        recentBatterLog = await fetchRecentBatterGameLogSummary(String(batter.id), normalizedDate, {
          season,
          gamesBack: 10,
        });
      } catch {
        recentBatterLog = null;
      }

      let recentPitcherForm = null;
      try {
        if (pitcherId) {
          recentPitcherForm = await fetchRecentPitcherFormSummary(String(pitcherId), normalizedDate, {
            season,
            gamesBack: 3,
          });
        }
      } catch {
        recentPitcherForm = null;
      }

      const recentHardHits =
        recentBatterLog?.recentHardHitsProxy ?? baseExample.recentHardHits;
      const recentExtraBaseHits =
        recentBatterLog?.recentExtraBaseHits ?? baseExample.recentExtraBaseHits;
      const recentHrTrend =
        recentBatterLog?.recentHrTrend ?? baseExample.recentHrTrend;
      const recentPowerScore =
        recentBatterLog?.recentPowerScore ?? baseExample.recentPowerScore;

      const recentGamesWithHR =
        recentBatterLog?.recentGamesWithHR ?? baseExample.recentGamesWithHR;
      const multiHRGamesLast30 =
        recentBatterLog?.multiHRGamesLast30 ?? baseExample.multiHRGamesLast30;

      const recentPitcherHr9 =
        recentPitcherForm?.recentHrPer9 ?? baseExample.recentPitcherHr9;

      return {
        snapshot_date: normalizedDate,
        batter_id: baseExample.batterId,
        batter_name: baseExample.batterName,

        season_hr_per_game: baseExample.seasonHRPerGame,
        barrel_rate: baseExample.barrelRate,
        exit_velocity_avg: baseExample.exitVelocityAvg,
        iso: baseExample.iso,
        hard_hit_rate: baseExample.hardHitRate,
        fly_ball_rate: baseExample.flyBallRate,
        x_slugging: baseExample.xSlugging,

        pitcher_hr9: baseExample.pitcherHr9,
        pitcher_fb_pct: baseExample.pitcherFbPct,

        park_hr_factor: baseExample.parkHrFactor,
        weather_hr_impact_score: baseExample.weatherHrImpactScore,
        projected_at_bats: baseExample.projectedAtBats,
        platoon_edge: baseExample.platoonEdge,
        team_hr_per_game: baseExample.teamHrPerGame,

        last7_hr: baseExample.last7HR,
        last14_hr: baseExample.last14HR,
        last30_hr: baseExample.last30HR,

        recent_hard_hits: recentHardHits,
        recent_extra_base_hits: recentExtraBaseHits,
        fb_matchup_factor: baseExample.fbMatchupFactor,
        recent_hr_trend: recentHrTrend,
        recent_power_score: recentPowerScore,
        pitcher_recent_risk: baseExample.pitcherRecentRisk,
        platoon_power_interaction: baseExample.platoonPowerInteraction,
        environment_score: baseExample.environmentScore,

        recent_games_with_hr: recentGamesWithHR,
        multi_hr_games_last30: multiHRGamesLast30,
        recent_pitcher_hr9: recentPitcherHr9,

        hit_hr: null,
        hr_count: 0,
        updated_at: new Date().toISOString(),
      };
    });

    const validRows = rows.filter(Boolean) as Record<string, unknown>[];

    const { error } = await supabase
      .from('hr_feature_snapshots')
      .upsert(validRows, { onConflict: 'snapshot_date,batter_id' });

    if (error) {
      return {
        success: false,
        savedCount: 0,
        error: error.message,
      };
    }

    return {
      success: true,
      savedCount: validRows.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown snapshot save error';
    return {
      success: false,
      savedCount: 0,
      error: message,
    };
  }
}

export async function syncSnapshotOutcomesForDate(date: string): Promise<{
  success: boolean;
  updatedCount: number;
  missingCount: number;
  positiveCount: number;
  debugSamples: Array<{
    batterName: string;
    batterId: string;
    matched: boolean;
    hrCount: number;
  }>;
  error?: string;
}> {
  const supabase = getSupabase();
  const normalizedDate = normalizeDateString(date);
  const season = getSeasonFromDate(normalizedDate);

  try {
    const { data, error } = await supabase
      .from('hr_feature_snapshots')
      .select('id, batter_id, batter_name, snapshot_date')
      .eq('snapshot_date', normalizedDate);

    if (error) {
      return {
        success: false,
        updatedCount: 0,
        missingCount: 0,
        positiveCount: 0,
        debugSamples: [],
        error: error.message,
      };
    }

    const snapshotRows = data ?? [];

    let updatedCount = 0;
    let missingCount = 0;
    let positiveCount = 0;

    const debugSamples: Array<{
      batterName: string;
      batterId: string;
      matched: boolean;
      hrCount: number;
    }> = [];

    for (const row of snapshotRows) {
      const batterId = String(row.batter_id);

      let hrCount = 0;
      let matched = false;

      try {
        const url = `https://statsapi.mlb.com/api/v1/people/${batterId}/stats?stats=gameLog&season=${season}`;
        const response = await fetch(url);
        const json = await response.json();

        const splits = (json?.stats?.[0]?.splits ?? []) as Array<{
          date?: string;
          stat?: { homeRuns?: number | string };
        }>;

        const result = sumHrCountForExactDate(splits, normalizedDate);
        hrCount = result.hrCount;
        matched = result.matched;
      } catch {
        // ignore individual player errors
      }

      if (debugSamples.length < 10) {
        debugSamples.push({
          batterName: String(row.batter_name),
          batterId,
          matched,
          hrCount,
        });
      }

      if (!matched) {
        missingCount += 1;
        continue;
      }

      const hitHr = hrCount > 0;

      const { error: updateError } = await supabase
        .from('hr_feature_snapshots')
        .update({
          hit_hr: hitHr,
          hr_count: hrCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (updateError) {
        missingCount += 1;
        continue;
      }

      updatedCount += 1;
      if (hitHr) positiveCount += 1;
    }

    return {
      success: true,
      updatedCount,
      missingCount,
      positiveCount,
      debugSamples,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    return {
      success: false,
      updatedCount: 0,
      missingCount: 0,
      positiveCount: 0,
      debugSamples: [],
      error: message,
    };
  }
}

export async function fetchTrainingExamplesFromSnapshots(filters?: {
  startDate?: string;
  endDate?: string;
  minRows?: number;
}): Promise<HRTrainingExample[]> {
  const rows = await fetchAllSnapshotRows('*', {
    startDate: filters?.startDate,
    endDate: filters?.endDate,
    labeledOnly: true,
  });

  const examples: HRTrainingExample[] = rows.map((row: Record<string, unknown>) => ({
    batterId: String(row.batter_id),
    batterName: String(row.batter_name),
    gameDate: String(row.snapshot_date),

    seasonHRPerGame: Number(row.season_hr_per_game),
    barrelRate: Number(row.barrel_rate),
    exitVelocityAvg: Number(row.exit_velocity_avg),
    iso: Number(row.iso),
    hardHitRate: Number(row.hard_hit_rate),
    flyBallRate: Number(row.fly_ball_rate),
    xSlugging: Number(row.x_slugging),

    pitcherHr9: Number(row.pitcher_hr9),
    pitcherFbPct: Number(row.pitcher_fb_pct),

    parkHrFactor: Number(row.park_hr_factor),
    weatherHrImpactScore: Number(row.weather_hr_impact_score),
    projectedAtBats: Number(row.projected_at_bats),
    platoonEdge: Number(row.platoon_edge),
    teamHrPerGame: Number(row.team_hr_per_game),

    last7HR: Number(row.last7_hr),
    last14HR: Number(row.last14_hr),
    last30HR: Number(row.last30_hr),

    recentHardHits: Number(row.recent_hard_hits ?? 0),
    recentExtraBaseHits: Number(row.recent_extra_base_hits ?? 0),
    fbMatchupFactor: Number(row.fb_matchup_factor ?? 0),
    recentHrTrend: Number(row.recent_hr_trend ?? 0),
    recentPowerScore: Number(row.recent_power_score ?? 0),
    pitcherRecentRisk: Number(row.pitcher_recent_risk ?? 0),
    platoonPowerInteraction: Number(row.platoon_power_interaction ?? 0),
    environmentScore: Number(row.environment_score ?? 0),

    recentGamesWithHR: Number(row.recent_games_with_hr ?? 0),
    multiHRGamesLast30: Number(row.multi_hr_games_last30 ?? 0),
    recentPitcherHr9: Number(row.recent_pitcher_hr9 ?? 0),

    label: row.hit_hr ? 1 : 0,
  }));

  if (filters?.minRows && examples.length < filters.minRows) {
    throw new Error(
      `Only found ${examples.length} labeled examples. Need at least ${filters.minRows}.`
    );
  }

  return examples;
}

export async function getTrainingSnapshotSummary(): Promise<{
  totalRows: number;
  labeledRows: number;
  unlabeledRows: number;
  positiveRows: number;
  dates: string[];
}> {
  const rows = await fetchAllSnapshotRows('snapshot_date, hit_hr, hr_count');

  const labeledRows = rows.filter((row) => row.hit_hr !== null).length;
  const positiveRows = rows.filter((row) => Boolean(row.hit_hr)).length;
  const dates = [...new Set(rows.map((row) => String(row.snapshot_date)))];

  return {
    totalRows: rows.length,
    labeledRows,
    unlabeledRows: rows.length - labeledRows,
    positiveRows,
    dates,
  };
}
