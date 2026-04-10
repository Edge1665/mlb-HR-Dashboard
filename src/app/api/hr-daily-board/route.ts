import { NextResponse } from 'next/server';
import { buildDailyHRBoard } from '@/services/hrDailyBoardService';
import { parseSeasonSampleWeightsFromString } from '@/services/ml/hrSeasonWeights';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get('date') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const trainingStartDate = url.searchParams.get('trainingStartDate') ?? undefined;
    const sortParam = url.searchParams.get('sort');
    const lineupModeParam = url.searchParams.get('lineupMode');
    const sportsbooksParam = url.searchParams.get('sportsbooks');
    const seasonWeightsParam = url.searchParams.get('seasonWeights');

    const limit = limitParam ? Number(limitParam) : undefined;
    const sortMode =
      sortParam === 'edge'
        ? 'edge'
        : sortParam === 'best'
          ? 'best'
          : 'model';
    const lineupMode =
      lineupModeParam === 'all'
        ? 'all'
        : lineupModeParam === 'confirmed'
          ? 'confirmed'
          : undefined;
    const sportsbooks = sportsbooksParam
      ? sportsbooksParam
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;
    const seasonSampleWeights = parseSeasonSampleWeightsFromString(seasonWeightsParam);

    const result = await buildDailyHRBoard({
      targetDate: date,
      trainingStartDate,
      limit,
      sortMode,
      lineupMode,
      sportsbooks,
      seasonSampleWeights,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build daily HR board';

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
