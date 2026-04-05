import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { buildPredictionInput } from '@/services/hrPredictionService';
import { fetchLiveMLBData } from '@/services/liveMLBDataService';
import { getPlayerGameLog } from '@/services/playerResearchApi';
import { buildHRFeatureExample } from '@/services/ml/hrFeatureEngineering';
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

export interface SaveSnapshotResult {
  success: boolean;
  savedCount: number;
  error?: string;
}

export async function saveTodayTrainingSnapshots(): Promise<SaveSnapshotResult> {
  const supabase = getSupabase();
  const snapshotDate = getTodayETDateString();

  try {
    const { batters, pitchers, games, ballparks } = await fetchLiveMLBData();
    const batterList = Object.values(batters);

    if (batterList.length === 0) {
      return {
        success: true,
        savedCount: 0,
      };
    }

    const rows: Record<string, unknown>[] = [];

    for (const batter of batterList) {
      if (!batter?.id || !batter?.teamId) continue;

      const game = games.find(
        (g) => g.awayTeamId === batter.teamId || g.homeTeamId === batter.teamId
      );
      if (!game) continue;

      const isHome = game.homeTeamId === batter.teamId;
      const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
      const pitcher = pitcherId ? (pitchers[pitcherId] ?? undefined) : undefined;
      const ballpark = game.ballparkId ? (ballparks[game.ballparkId] ?? undefined) : undefined;

      const input = buildPredictionInput(batter, pitcher, game, ballpark);
      const example = buildHRFeatureExample(input, 0, snapshotDate);

      rows.push({
        snapshot_date: snapshotDate,
        batter_id: example.batterId,
        batter_name: example.batterName,
        season_hr_per_game: example.seasonHRPerGame,
        barrel_rate: example.barrelRate,
        exit_velocity_avg: example.exitVelocityAvg,
        iso: example.iso,
        hard_hit_rate: example.hardHitRate,
        fly_ball_rate: example.flyBallRate,
        x_slugging: example.xSlugging,
        pitcher_hr9: example.pitcherHr9,
        pitcher_fb_pct: example.pitcherFbPct,
        park_hr_factor: example.parkHrFactor,
        weather_hr_impact_score: example.weatherHrImpactScore,
        projected_at_bats: example.projectedAtBats,
        platoon_edge: example.platoonEdge,
        team_hr_per_game: example.teamHrPerGame,
        last7_hr: example.last7HR,
        last14_hr: example.last14HR,
        last30_hr: example.last30HR,
        hit_hr: null,
        hr_count: 0,
        updated_at: new Date().toISOString(),
      });
    }

    const { error } = await supabase
      .from('hr_feature_snapshots')
      .upsert(rows, { onConflict: 'snapshot_date,batter_id' });

    if (error) {
      return {
        success: false,
        savedCount: 0,
        error: error.message,
      };
    }

    return {
      success: true,
      savedCount: rows.length,
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
  error?: string;
}> {
  const supabase = getSupabase();
  const normalizedDate = normalizeDateString(date);

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
        error: error.message,
      };
    }

    const rows = data ?? [];
    let updatedCount = 0;
    let missingCount = 0;

    for (const row of rows) {
      const batterIdRaw = row.batter_id as string;
      const batterId = Number(batterIdRaw);

      if (!Number.isFinite(batterId)) {
        missingCount += 1;
        continue;
      }

      try {
        const gameLog = await getPlayerGameLog(batterId, 200);
        const matchingGame = gameLog.find((entry) => normalizeDateString(entry.date) === normalizedDate);

        const hrCount = matchingGame?.homeRuns ?? 0;
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
          console.warn(
            `[hrTrainingSnapshotService] Failed updating ${row.batter_name}: ${updateError.message}`
          );
          missingCount += 1;
          continue;
        }

        updatedCount += 1;
      } catch (playerErr) {
        console.warn(
          `[hrTrainingSnapshotService] Failed syncing outcome for ${row.batter_name}:`,
          playerErr
        );
        missingCount += 1;
      }
    }

    return {
      success: true,
      updatedCount,
      missingCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown sync error';
    return {
      success: false,
      updatedCount: 0,
      missingCount: 0,
      error: message,
    };
  }
}

export async function fetchTrainingExamplesFromSnapshots(filters?: {
  startDate?: string;
  endDate?: string;
  minRows?: number;
}): Promise<HRTrainingExample[]> {
  const supabase = getSupabase();

  let query = supabase
    .from('hr_feature_snapshots')
    .select('*')
    .not('hit_hr', 'is', null)
    .order('snapshot_date', { ascending: true });

  if (filters?.startDate) {
    query = query.gte('snapshot_date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('snapshot_date', filters.endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];

  const examples: HRTrainingExample[] = rows.map((row: Record<string, unknown>) => ({
    batterId: row.batter_id as string,
    batterName: row.batter_name as string,
    gameDate: row.snapshot_date as string,
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
  dates: string[];
}> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('hr_feature_snapshots')
    .select('snapshot_date, hit_hr')
    .order('snapshot_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const labeledRows = rows.filter((row: Record<string, unknown>) => row.hit_hr !== null).length;
  const dates = [...new Set(rows.map((row: Record<string, unknown>) => row.snapshot_date as string))];

  return {
    totalRows: rows.length,
    labeledRows,
    unlabeledRows: rows.length - labeledRows,
    dates,
  };
}
