import { NextResponse } from 'next/server';
import { buildPredictionInput, computeHRProbability, generateExplanation } from '@/services/hrPredictionService';
import { fetchLiveMLBData } from '@/services/liveMLBDataService';
import { enhanceWithGemini } from '@/services/geminiHREnhancement';
import type { HRProjection } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    // Fetch all live MLB data for today
    const { batters, pitchers, games, ballparks, teams } = await fetchLiveMLBData();

    const projections: HRProjection[] = [];
    const batterList = Object.values(batters);

    if (batterList.length === 0) {
      return NextResponse.json({ projections: [], generatedAt: new Date().toISOString(), note: 'No lineups available yet for today.' });
    }

    // Build base projections first, then enhance top candidates with Gemini
    const baseProjections: Array<{ projection: HRProjection; input: ReturnType<typeof buildPredictionInput>; result: ReturnType<typeof computeHRProbability> }> = [];

    for (const batter of batterList) {
      if (!batter?.id || !batter?.teamId) continue;

      const game = games.find(
        g => g.awayTeamId === batter.teamId || g.homeTeamId === batter.teamId
      );
      if (!game) continue;

      const isHome = game.homeTeamId === batter.teamId;
      const pitcherId = isHome ? game.awayPitcherId : game.homePitcherId;
      const pitcher = pitcherId ? (pitchers[pitcherId] ?? undefined) : undefined;
      const ballpark = game.ballparkId ? (ballparks[game.ballparkId] ?? undefined) : undefined;

      const input = buildPredictionInput(batter, pitcher, game, ballpark);
      const result = computeHRProbability(input);
      const explanation = generateExplanation(input, result);

      baseProjections.push({
        input,
        result,
        projection: {
          id: `pred-${batter.id}`,
          batterId: batter.id,
          gameId: game.id,
          opposingPitcherId: pitcherId ?? '',
          ballparkId: game.ballparkId ?? '',
          hrProbability: result.hrProbability,
          confidenceTier: result.confidenceTier,
          platoonAdvantage: result.platoonAdvantage,
          parkFactorBoost: result.parkFactorUsed,
          weatherImpact: result.weatherImpactUsed,
          formMultiplier: 1.0,
          matchupScore: result.matchupScore,
          projectedAtBats: result.projectedAtBats,
          keyFactors: result.keyFactors ?? [],
          rank: 0,
          explanation,
        },
      });
    }

    // Sort by base probability to identify top candidates
    baseProjections.sort((a, b) => b.result.hrProbability - a.result.hrProbability);

    // Enhance only top 30 players with Gemini to avoid serverless timeout (502)
    const GEMINI_LIMIT = 30;
    const topCandidates = baseProjections.slice(0, GEMINI_LIMIT);
    const restCandidates = baseProjections.slice(GEMINI_LIMIT);

    // Enhance top candidates with Gemini (parallel calls)
    const geminiResults = await Promise.allSettled(
      topCandidates.map(({ input, result }) => enhanceWithGemini(input, result))
    );

    // Merge Gemini enhancements into top projections
    for (let i = 0; i < topCandidates.length; i++) {
      const { projection } = topCandidates[i];
      const geminiResult = geminiResults[i];

      if (geminiResult.status === 'fulfilled' && geminiResult.value) {
        const enhancement = geminiResult.value;
        projection.geminiProbability = enhancement.geminiProbability;
        projection.blendedProbability = enhancement.blendedProbability;
        projection.geminiReasoning = enhancement.reasoning;
        projection.geminiKeyInsight = enhancement.keyInsight;
        projection.geminiConfidence = enhancement.geminiConfidence;
        // Use blended probability (50% base + 50% Gemini) as the displayed HR probability
        projection.hrProbability = enhancement.blendedProbability;
      } else if (geminiResult.status === 'rejected' || (geminiResult.status === 'fulfilled' && !geminiResult.value)) {
        // Gemini failed — log and fall back to base model
        console.warn(`[hr-predictions] Gemini enhancement failed for ${projection.batterId}, using base model only`);
      }

      // Carry lineupConfirmed from batter data
      const batter = batters[projection.batterId];
      projection.lineupConfirmed = batter?.lineupConfirmed ?? true;

      projections.push(projection);
    }

    // Add remaining players (no Gemini enhancement) using base model only
    for (const { projection } of restCandidates) {
      const batter = batters[projection.batterId];
      projection.lineupConfirmed = batter?.lineupConfirmed ?? true;
      projections.push(projection);
    }

    // Re-sort by final HR probability and assign ranks
    projections.sort((a, b) => b.hrProbability - a.hrProbability);
    projections.forEach((p, i) => { p.rank = i + 1; });

    // Build lookup maps for client-side rendering
    const gamesMap: Record<string, (typeof games)[number]> = {};
    games.forEach((g: (typeof games)[number]) => { gamesMap[g.id] = g; });

    return NextResponse.json({
      projections,
      batters,
      pitchers,
      games: gamesMap,
      ballparks,
      teams,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[hr-predictions] Error computing predictions:', err);
    return NextResponse.json({ error: 'Failed to compute predictions' }, { status: 500 });
  }
}
