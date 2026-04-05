import { NextResponse } from 'next/server';

import { saveDailyTop10, isTodaySaved } from '@/services/hrHistoryService';
import type { DailyPick } from '@/services/hrHistoryService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/hr-history/save-today
// Body: { projections, batters, pitchers }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projections, batters, pitchers } = body;

    if (!projections || !Array.isArray(projections)) {
      return NextResponse.json({ error: 'projections array required' }, { status: 400 });
    }

    // Take top 10 by hrProbability
    const top10 = [...projections]
      .sort((a: any, b: any) => b.hrProbability - a.hrProbability)
      .slice(0, 10);

    const picks: Omit<DailyPick, 'id'>[] = top10.map((proj: any, idx: number) => {
      const batter = batters?.[proj.batterId];
      const pitcher = proj.opposingPitcherId ? pitchers?.[proj.opposingPitcherId] : null;
      return {
        pickDate: new Date().toISOString().split('T')[0],
        rank: idx + 1,
        playerId: proj.batterId,
        playerName: batter?.name ?? proj.batterId,
        teamAbbreviation: batter?.teamId ?? '—',
        opposingPitcher: pitcher?.name ?? undefined,
        hrProbability: proj.hrProbability,
        geminiProbability: proj.geminiProbability ?? undefined,
        blendedProbability: proj.blendedProbability ?? undefined,
        confidenceTier: proj.confidenceTier,
        platoonAdvantage: proj.platoonAdvantage,
        matchupScore: proj.matchupScore ?? undefined,
        keyFactors: proj.keyFactors ?? [],
        lineupConfirmed: proj.lineupConfirmed ?? true,
      };
    });

    const result = await saveDailyTop10(picks);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, saved: picks.length });
  } catch (err) {
    console.error('[hr-history/save-today] Error:', err);
    return NextResponse.json({ error: 'Failed to save picks' }, { status: 500 });
  }
}

// GET /api/hr-history/save-today — check if today is already saved
export async function GET() {
  try {
    const saved = await isTodaySaved();
    return NextResponse.json({ saved });
  } catch (err) {
    return NextResponse.json({ saved: false });
  }
}
