import { createClient as createSupabaseClient } from '@supabase/supabase-js';

function getSupabase() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export interface DailyPick {
  id: string;
  pickDate: string;
  rank: number;
  playerId: string;
  playerName: string;
  teamAbbreviation: string;
  opposingPitcher?: string;
  hrProbability: number;
  geminiProbability?: number;
  blendedProbability?: number;
  confidenceTier: string;
  platoonAdvantage: string;
  matchupScore?: number;
  keyFactors?: string[];
  lineupConfirmed: boolean;
}

export interface HROutcome {
  id: string;
  pickId: string;
  pickDate: string;
  playerId: string;
  playerName: string;
  hitHr: boolean | null;
  hrCount: number;
  updatedAt: string;
}

export interface DailyHistoryEntry {
  date: string;
  picks: DailyPick[];
  outcomes: HROutcome[];
}

// Save today's top 10 picks (replaces existing picks for today if called again)
export async function saveDailyTop10(picks: Omit<DailyPick, 'id'>[]): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Delete existing picks for today first (idempotent)
    const { error: deleteError } = await supabase
      .from('daily_top10_picks')
      .delete()
      .eq('pick_date', today);

    if (deleteError) {
      console.error('[hrHistoryService] Delete error:', deleteError.message);
      return { success: false, error: deleteError.message };
    }

    // Insert new picks
    const rows = picks.map(p => ({
      pick_date: today,
      rank: p.rank,
      player_id: p.playerId,
      player_name: p.playerName,
      team_abbreviation: p.teamAbbreviation,
      opposing_pitcher: p.opposingPitcher ?? null,
      hr_probability: p.hrProbability,
      gemini_probability: p.geminiProbability ?? null,
      blended_probability: p.blendedProbability ?? null,
      confidence_tier: p.confidenceTier,
      platoon_advantage: p.platoonAdvantage,
      matchup_score: p.matchupScore ?? null,
      key_factors: p.keyFactors ?? [],
      lineup_confirmed: p.lineupConfirmed,
    }));

    const { error: insertError } = await supabase
      .from('daily_top10_picks')
      .insert(rows);

    if (insertError) {
      console.error('[hrHistoryService] Insert error:', insertError.message);
      return { success: false, error: insertError.message };
    }

    // Create outcome placeholders for each pick
    const { data: savedPicks, error: fetchError } = await supabase
      .from('daily_top10_picks')
      .select('id, player_id, player_name')
      .eq('pick_date', today);

    if (!fetchError && savedPicks) {
      const outcomeRows = savedPicks.map((p: { id: string; player_id: string; player_name: string }) => ({
        pick_id: p.id,
        pick_date: today,
        player_id: p.player_id,
        player_name: p.player_name,
        hit_hr: null,
        hr_count: 0,
      }));

      await supabase.from('hr_outcomes').insert(outcomeRows);
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: msg };
  }
}

// Fetch all history dates (most recent first)
export async function fetchHistoryDates(): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('daily_top10_picks')
    .select('pick_date')
    .order('pick_date', { ascending: false });

  if (error || !data) return [];

  const unique = [...new Set(data.map((r: { pick_date: string }) => r.pick_date as string))];
  return unique;
}

// Fetch picks + outcomes for a specific date
export async function fetchHistoryForDate(date: string): Promise<DailyHistoryEntry | null> {
  const supabase = getSupabase();

  const [picksRes, outcomesRes] = await Promise.all([
    supabase
      .from('daily_top10_picks')
      .select('*')
      .eq('pick_date', date)
      .order('rank', { ascending: true }),
    supabase
      .from('hr_outcomes')
      .select('*')
      .eq('pick_date', date),
  ]);

  if (picksRes.error || !picksRes.data) return null;

  const picks: DailyPick[] = picksRes.data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    pickDate: r.pick_date as string,
    rank: r.rank as number,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    teamAbbreviation: r.team_abbreviation as string,
    opposingPitcher: r.opposing_pitcher != null ? (r.opposing_pitcher as string) : undefined,
    hrProbability: Number(r.hr_probability),
    geminiProbability: r.gemini_probability != null ? Number(r.gemini_probability) : undefined,
    blendedProbability: r.blended_probability != null ? Number(r.blended_probability) : undefined,
    confidenceTier: r.confidence_tier as string,
    platoonAdvantage: r.platoon_advantage as string,
    matchupScore: r.matchup_score != null ? (r.matchup_score as number) : undefined,
    keyFactors: (r.key_factors as string[]) ?? [],
    lineupConfirmed: r.lineup_confirmed as boolean,
  }));

  const outcomes: HROutcome[] = ((outcomesRes.data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    pickId: r.pick_id as string,
    pickDate: r.pick_date as string,
    playerId: r.player_id as string,
    playerName: r.player_name as string,
    hitHr: r.hit_hr as boolean | null,
    hrCount: (r.hr_count as number) ?? 0,
    updatedAt: r.updated_at as string,
  }));

  return { date, picks, outcomes };
}

// Update HR outcome for a specific pick
export async function updateHROutcome(
  pickId: string,
  hitHr: boolean,
  hrCount: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('hr_outcomes')
    .update({ hit_hr: hitHr, hr_count: hrCount, updated_at: new Date().toISOString() })
    .eq('pick_id', pickId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// Check if today's picks are already saved
export async function isTodaySaved(): Promise<boolean> {
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('daily_top10_picks')
    .select('*', { count: 'exact', head: true })
    .eq('pick_date', today);
  return (count ?? 0) > 0;
}
