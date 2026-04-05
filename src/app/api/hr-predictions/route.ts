import { NextResponse } from 'next/server';
import {
  buildPredictionInput,
  computeHRProbability,
  generateExplanation,
} from '@/services/hrPredictionService';
import { fetchLiveMLBData } from '@/services/liveMLBDataService';
import { enhanceWithGemini } from '@/services/geminiHREnhancement';
import type { HRProjection } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function getGeminiDisagreementTier(
  baseProbability: number,
  adjustedProbability?: number
): 'aligned' | 'mixed' | 'high' | undefined {
  if (adjustedProbability == null) return undefined;

  const diff = Math.abs(baseProbability - adjustedProbability);
  if (diff < 1.0) return 'aligned';
  if (diff < 2.5) return 'mixed';
  return 'high';
}

export async function GET() {
  try {
    const { batters, pitchers, games, ballparks, teams } = await fetchLiveMLBData();

    const projections: HRProjection[] = [];
    const batterList = Object.values(batters);

    if (batterList.length === 0) {
      return NextResponse.json({
        projections: [],
        generatedAt: new Date().toISOString(),
        note: 'No lineups available yet for today.',
      });
    }

    const baseProjections: Array<{
      projection: HRProjection;
      input: ReturnType<typeof buildPredictionInput>;
      result: ReturnType<typeof computeHRProbability>;
    }> = [];

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

    baseProjections.sort((a, b) => b.result.hrProbability - a.result.hrProbability);

    const GEMINI_LIMIT = 30;
    const topCandidates = baseProjections.slice(0, GEMINI_LIMIT);
    const restCandidates = baseProjections.slice(GEMINI_LIMIT);

    const geminiResults = await Promise.allSettled(
      topCandidates.map(({ input, result }) => enhanceWithGemini(input, result))
    );

    for (let i = 0; i < topCandidates.length; i++) {
      const { projection } = topCandidates[i];
      const geminiResult = geminiResults[i];

      if (geminiResult.status === 'fulfilled' && geminiResult.value) {
        const enhancement = geminiResult.value;
        projection.geminiProbability = enhancement.geminiProbability;
        projection.adjustedProbability = enhancement.adjustedProbability;
        projection.blendedProbability = enhancement.adjustedProbability;
        projection.geminiAdjustmentApplied = enhancement.adjustmentApplied;
        projection.geminiReasoning = enhancement.reasoning;
        projection.geminiKeyInsight = enhancement.keyInsight;
        projection.geminiConfidence = enhancement.geminiConfidence;
        projection.geminiDisagreementTier = getGeminiDisagreementTier(
          projection.hrProbability,
          enhancement.adjustedProbability
        );
      } else if (
        geminiResult.status === 'rejected' ||
        (geminiResult.status === 'fulfilled' && !geminiResult.value)
      ) {
        console.warn(
          `[hr-predictions] Gemini enhancement failed for ${projection.batterId}, using base model only`
        );
      }

      const batter = batters[projection.batterId];
      projection.lineupConfirmed = batter?.lineupConfirmed ?? true;
      projections.push(projection);
    }

    for (const { projection } of restCandidates) {
      const batter = batters[projection.batterId];
      projection.lineupConfirmed = batter?.lineupConfirmed ?? true;
      projections.push(projection);
    }

    projections.sort((a, b) => b.hrProbability - a.hrProbability);
    projections.forEach((p, i) => {
      p.rank = i + 1;
    });

    const gamesMap: Record<string, (typeof games)[number]> = {};
    games.forEach((g: (typeof games)[number]) => {
      gamesMap[g.id] = g;
    });

    return NextResponse.json({
      projections,
      batters,
      pitchers,
      games: gamesMap,
      ballparks,
      teams,
      generatedAt: new Date().toISOString(),
      modelVersion: 'base-statistical-v1',
      advisoryLayer: 'gemini-advisory-only',
    });
  } catch (err) {
    console.error('[hr-predictions] Error computing predictions:', err);
    return NextResponse.json({ error: 'Failed to compute predictions' }, { status: 500 });
  }
}
