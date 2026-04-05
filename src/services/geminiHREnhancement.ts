/**
 * Gemini HR Enhancement Service
 * Uses Gemini AI as a bounded adjustment + explanation layer.
 * The base statistical model remains the primary probability engine.
 */

import { getChatCompletion } from '@/lib/ai/chatCompletion';
import type { HRPredictionInput, HRPredictionOutput } from './hrPredictionService';

export interface GeminiHREnhancement {
  geminiProbability: number;
  adjustedProbability: number;
  adjustmentApplied: number;
  reasoning: string;
  keyInsight: string;
  geminiConfidence: 'high' | 'medium' | 'low';
}

const SYSTEM_PROMPT = `You are an expert MLB home run probability analyst with deep knowledge of sabermetrics, Statcast data, and advanced baseball analytics.

You will receive:
1. A structured batter-pitcher matchup input
2. A base model home run probability already computed by a transparent statistical model

Your job is NOT to replace the base model unless there is strong reason.
Your main job is to:
- evaluate whether the base model seems directionally sound
- identify interactions or contradictions between inputs
- suggest only a SMALL bounded adjustment when justified
- provide concise reasoning

Rules:
1. Respect the base model as the primary estimate
2. Suggested adjustment must be between -2.5 and +2.5 percentage points
3. Use larger adjustments only when multiple factors strongly align or strongly conflict
4. If the evidence is mixed or incomplete, prefer 0 adjustment
5. Never hallucinate missing stats
6. Respond ONLY with valid JSON

Return JSON in exactly this format:
{
  "geminiProbability": <number 1-30>,
  "suggestedAdjustment": <number between -2.5 and 2.5>,
  "confidence": "<high|medium|low>",
  "reasoning": "<2-3 sentence analytical summary>",
  "keyInsight": "<single most important factor or interaction>"
}`;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildPrompt(input: HRPredictionInput, baseOutput: HRPredictionOutput): string {
  const lines: string[] = [
    `BATTER: ${input.batterName}`,
    `Base Model HR Probability: ${baseOutput.hrProbability.toFixed(1)}%`,
    `Base Confidence Tier: ${baseOutput.confidenceTier}`,
    `Data Completeness: ${(baseOutput.dataCompleteness * 100).toFixed(0)}%`,
    `Lineup Position: ${input.lineupPosition ?? 'Unknown'}`,
    '',
    '=== POWER PROFILE ===',
  ];

  if (input.power) {
    const p = input.power;
    if (p.seasonHR != null && p.seasonGames != null) {
      lines.push(
        `Season: ${p.seasonHR} HR in ${p.seasonGames} games (${((p.seasonHR / p.seasonGames) * 162).toFixed(0)}-HR pace)`
      );
    }
    if (p.barrelRate != null) lines.push(`Barrel Rate: ${p.barrelRate.toFixed(1)}%`);
    if (p.exitVelocityAvg != null) lines.push(`Avg Exit Velocity: ${p.exitVelocityAvg.toFixed(1)} mph`);
    if (p.iso != null) lines.push(`ISO: .${Math.round(p.iso * 1000).toString().padStart(3, '0')}`);
    if (p.hardHitRate != null) lines.push(`Hard-Hit Rate: ${p.hardHitRate.toFixed(1)}%`);
    if (p.flyBallRate != null) lines.push(`Fly-Ball Rate: ${p.flyBallRate.toFixed(1)}%`);
    if (p.hrFbRate != null) lines.push(`HR/FB Rate: ${(p.hrFbRate * 100).toFixed(1)}%`);
    if (p.xSlugging != null) lines.push(`xSLG: .${Math.round(p.xSlugging * 1000).toString().padStart(3, '0')}`);
  } else {
    lines.push('No power profile data available');
  }

  lines.push('', '=== RECENT FORM ===');
  if (input.recentForm) {
    const f = input.recentForm;
    if (f.last7HR != null) lines.push(`Last 7 days: ${f.last7HR} HR`);
    if (f.last7OPS != null) lines.push(`Last 7 days OPS: ${f.last7OPS.toFixed(3)}`);
    if (f.last14HR != null) lines.push(`Last 14 days: ${f.last14HR} HR`);
    if (f.last14OPS != null) lines.push(`Last 14 days OPS: ${f.last14OPS.toFixed(3)}`);
    if (f.last30HR != null) lines.push(`Last 30 days: ${f.last30HR} HR`);
  } else {
    lines.push('No recent form data available');
  }

  lines.push('', '=== PLATOON MATCHUP ===');
  if (input.platoon) {
    const pl = input.platoon;
    lines.push(`Batter Handedness: ${pl.bats ?? 'Unknown'}`);
    lines.push(`Pitcher Handedness: ${pl.pitcherThrows ?? input.pitcher?.throws ?? 'Unknown'}`);

    if (pl.hrVsLeft != null && pl.paVsLeft != null) {
      lines.push(
        `vs LHP: ${pl.hrVsLeft} HR in ${pl.paVsLeft} PA (${pl.paVsLeft > 0 ? ((pl.hrVsLeft / pl.paVsLeft) * 100).toFixed(2) : '0.00'}% HR rate)`
      );
    }

    if (pl.hrVsRight != null && pl.paVsRight != null) {
      lines.push(
        `vs RHP: ${pl.hrVsRight} HR in ${pl.paVsRight} PA (${pl.paVsRight > 0 ? ((pl.hrVsRight / pl.paVsRight) * 100).toFixed(2) : '0.00'}% HR rate)`
      );
    }

    if (pl.slgVsLeft != null) lines.push(`SLG vs LHP: .${Math.round(pl.slgVsLeft * 1000).toString().padStart(3, '0')}`);
    if (pl.slgVsRight != null) lines.push(`SLG vs RHP: .${Math.round(pl.slgVsRight * 1000).toString().padStart(3, '0')}`);
  } else {
    lines.push('No platoon data available');
  }

  lines.push('', '=== OPPOSING PITCHER ===');
  if (input.pitcher) {
    const pit = input.pitcher;
    lines.push(`Throws: ${pit.throws ?? 'Unknown'}`);
    if (pit.hr9 != null) lines.push(`HR/9: ${pit.hr9.toFixed(2)}`);
    if (pit.hrFbRate != null) lines.push(`HR/FB Rate: ${(pit.hrFbRate * 100).toFixed(1)}%`);
    if (pit.fbPct != null) lines.push(`Fly-Ball %: ${pit.fbPct.toFixed(1)}%`);
    if (pit.era != null) lines.push(`ERA: ${pit.era.toFixed(2)}`);
    if (pit.recentHr9 != null) lines.push(`Recent HR/9 (last 7d): ${pit.recentHr9.toFixed(2)}`);
  } else {
    lines.push('Pitcher data not available');
  }

  lines.push('', '=== BALLPARK & CONDITIONS ===');
  if (input.ballpark) {
    const bp = input.ballpark;
    if (bp.name) lines.push(`Park: ${bp.name}`);
    if (bp.hrFactor != null) lines.push(`HR Park Factor: ${bp.hrFactor.toFixed(2)}x`);
    if (bp.elevation != null) lines.push(`Elevation: ${bp.elevation.toLocaleString()} ft`);
  } else {
    lines.push('Ballpark data not available');
  }

  if (input.weather) {
    const w = input.weather;
    if (w.temp != null) lines.push(`Temperature: ${w.temp}°F`);
    if (w.windSpeed != null && w.windToward) {
      const dir =
        w.windToward === 'out'
          ? 'blowing out'
          : w.windToward === 'in'
          ? 'blowing in'
          : w.windToward === 'crosswind'
          ? 'crosswind'
          : 'neutral';
      lines.push(`Wind: ${w.windSpeed} mph ${dir}`);
    }
    if (w.hrImpact != null) lines.push(`Precomputed Weather HR Impact: ${w.hrImpact}`);
    if (w.hrImpactScore != null) lines.push(`Precomputed Weather HR Impact Score: ${w.hrImpactScore}/10`);
  } else {
    lines.push('Weather data not available');
  }

  lines.push('', '=== TEAM CONTEXT ===');
  if (input.teamOffense) {
    if (input.teamOffense.teamSeasonHR != null && input.teamOffense.teamGames != null) {
      lines.push(
        `Team HR: ${input.teamOffense.teamSeasonHR} in ${input.teamOffense.teamGames} games (${(input.teamOffense.teamSeasonHR / input.teamOffense.teamGames).toFixed(2)} per game)`
      );
    }
    if (input.teamOffense.teamOPS != null) {
      lines.push(`Team OPS: ${input.teamOffense.teamOPS.toFixed(3)}`);
    }
  } else {
    lines.push('No team offense data provided');
  }

  lines.push('', '=== BASE MODEL BREAKDOWN ===');
  lines.push(`Base HR Probability: ${baseOutput.hrProbability.toFixed(1)}%`);
  lines.push(`Confidence Tier: ${baseOutput.confidenceTier}`);
  lines.push(`Matchup Score: ${baseOutput.matchupScore}/100`);
  lines.push(`Projected At-Bats: ${baseOutput.projectedAtBats.toFixed(1)}`);
  lines.push(`Park Factor Used: ${baseOutput.parkFactorUsed.toFixed(2)}x`);
  lines.push(`Weather Impact Used: ${baseOutput.weatherImpactUsed.toFixed(2)}x`);
  lines.push('Key Factors:');
  baseOutput.keyFactors.forEach((f) => lines.push(`  - ${f}`));

  lines.push(
    '',
    'Review the base model estimate.',
    'If the evidence mostly agrees with the base model, return a suggestedAdjustment close to 0.',
    'Only use larger adjustments when there is a clear interaction the base model may underweight or overstate.'
  );

  return lines.join('\n');
}

export async function enhanceWithGemini(
  input: HRPredictionInput,
  baseOutput: HRPredictionOutput
): Promise<GeminiHREnhancement | null> {
  try {
    const userPrompt = buildPrompt(input, baseOutput);

    const response = await getChatCompletion(
      'GEMINI',
      'gemini/gemini-2.5-flash',
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.2,
        max_tokens: 512,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'hr_prediction_adjustment',
            schema: {
              type: 'object',
              properties: {
                geminiProbability: { type: 'number' },
                suggestedAdjustment: { type: 'number' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                reasoning: { type: 'string' },
                keyInsight: { type: 'string' },
              },
              required: [
                'geminiProbability',
                'suggestedAdjustment',
                'confidence',
                'reasoning',
                'keyInsight',
              ],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      }
    );

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    const geminiProb = clamp(Number(parsed.geminiProbability), 1, 30);
    const rawAdjustment = clamp(Number(parsed.suggestedAdjustment), -2.5, 2.5);

    const confidence = (parsed.confidence as 'high' | 'medium' | 'low') ?? 'medium';

    // Confidence-weighted cap
    const confidenceCap =
      confidence === 'high' ? 2.0 : confidence === 'medium' ? 1.2 : 0.6;

    // Data completeness also limits Gemini influence
    const completenessCap =
      baseOutput.dataCompleteness >= 0.75
        ? 1.5
        : baseOutput.dataCompleteness >= 0.5
        ? 1.0
        : 0.5;

    const finalCap = Math.min(confidenceCap, completenessCap);
    const boundedAdjustment = clamp(rawAdjustment, -finalCap, finalCap);

    const adjustedProbability = round1(
      clamp(baseOutput.hrProbability + boundedAdjustment, 1, 30)
    );

    console.log(
      `[Gemini HR Adjustment] ${input.batterName} | Base: ${baseOutput.hrProbability.toFixed(
        1
      )}% | Gemini Ref: ${geminiProb.toFixed(1)}% | Raw Adj: ${rawAdjustment.toFixed(
        1
      )} | Applied Adj: ${boundedAdjustment.toFixed(1)} | Final: ${adjustedProbability.toFixed(
        1
      )}% | Confidence: ${confidence}`
    );

    return {
      geminiProbability: round1(geminiProb),
      adjustedProbability,
      adjustmentApplied: round1(boundedAdjustment),
      reasoning: String(parsed.reasoning ?? ''),
      keyInsight: String(parsed.keyInsight ?? ''),
      geminiConfidence: confidence,
    };
  } catch {
    return null;
  }
}
