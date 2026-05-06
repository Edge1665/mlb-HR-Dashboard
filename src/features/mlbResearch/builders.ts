import {
  MODEL_READY_RESEARCH_FEATURE_KEYS,
  RESEARCH_FLAG_THRESHOLDS,
} from "@/features/mlbResearch/constants";
import {
  computeContactQualityScore,
  computeEnvironmentScore,
  computeHrResearchScore,
  computeMatchupScore,
  computePitchTypeFitScore,
  computeTrendStrengthScore,
} from "@/features/mlbResearch/scoring";
import type {
  MLBPlayerResearchProfile,
  MLBResearchScores,
  ResearchEnvironmentProfile,
  ResearchMatchupProfile,
  ResearchRecentFormWindow,
  ResearchSplitMetrics,
  ResearchSplits,
  ResearchStatcastProfile,
  ResearchTrendFlag,
} from "@/features/mlbResearch/types";
import type { DailyHRBoardRow } from "@/services/hrDailyBoardService";
import type { DailyOddsLookup, HRPropPrice } from "@/services/oddsApiService";
import type {
  BatterGameLogEntry,
  BatterGameLogWindowSummary,
} from "@/services/mlbPlayerGameLogService";
import {
  summarizeBatterGameLogWindow,
  summarizeBatterGameLogsByFilter,
} from "@/services/mlbPlayerGameLogService";
import type { RecentPitcherFormSummary } from "@/services/mlbPitcherRecentFormService";
import {
  PITCH_GROUP_DISPLAY_NAMES,
  PITCH_GROUPS,
} from "@/services/pitchMixTaxonomy";
import { formatAwayHomeMatchup } from "@/services/gamePresentation";
import type { Ballpark, Batter, Game, Pitcher, Team } from "@/types";

interface BuildResearchProfileParams {
  batter: Batter;
  pitcher?: Pitcher;
  game: Game;
  ballpark?: Ballpark;
  team?: Team;
  opponentTeam?: Team;
  isHome: boolean;
  boardRow: Pick<
    DailyHRBoardRow,
    "modelScore" | "predictedProbability" | "edge"
  >;
  odds?: HRPropPrice | null;
  oddsLookup?: DailyOddsLookup;
  batterGameLogs: BatterGameLogEntry[];
  recentPitcherForm?: RecentPitcherFormSummary | null;
}

function roundTo(value: number | null | undefined, digits = 3): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toRecentFormWindow(
  label: ResearchRecentFormWindow["label"],
  summary: BatterGameLogWindowSummary,
): ResearchRecentFormWindow {
  return {
    label,
    gamesPlayed: summary.gamesPlayed,
    plateAppearances: summary.plateAppearances,
    atBats: summary.atBats,
    hits: summary.hits,
    homeRuns: summary.homeRuns,
    extraBaseHits: summary.extraBaseHits,
    battingAverage: summary.battingAverage,
    slugging: summary.slugging,
    iso: summary.iso,
    hardHitProxy: summary.hardHitProxy,
  };
}

function toSplitMetrics(
  summary: BatterGameLogWindowSummary | null,
  hrRateDenominator?: number | null,
): ResearchSplitMetrics | null {
  if (!summary || summary.gamesPlayed <= 0) {
    return null;
  }

  const denominator = hrRateDenominator ?? summary.plateAppearances;
  return {
    sampleSize: denominator ?? summary.gamesPlayed,
    homeRuns: summary.homeRuns,
    battingAverage: summary.battingAverage,
    slugging: summary.slugging,
    iso: summary.iso,
    hrRate:
      denominator && denominator > 0
        ? roundTo(summary.homeRuns / denominator, 4)
        : null,
  };
}

function buildResearchSplits(
  batter: Batter,
  pitcher: Pitcher | undefined,
  gameLogs: BatterGameLogEntry[],
): ResearchSplits {
  const vsRhp = toSplitMetrics(
    {
      gamesPlayed: batter.splits.vsRight.pa > 0 ? 1 : 0,
      plateAppearances: batter.splits.vsRight.pa,
      atBats: 0,
      hits: 0,
      homeRuns: batter.splits.vsRight.hr,
      doubles: 0,
      triples: 0,
      extraBaseHits: batter.splits.vsRight.hr,
      totalBases: 0,
      walks: 0,
      strikeOuts: 0,
      runs: 0,
      rbi: 0,
      battingAverage: batter.splits.vsRight.avg || null,
      slugging: batter.splits.vsRight.slg || null,
      iso:
        batter.splits.vsRight.slg > 0 && batter.splits.vsRight.avg > 0
          ? roundTo(batter.splits.vsRight.slg - batter.splits.vsRight.avg)
          : null,
      hardHitProxy: null,
    },
    batter.splits.vsRight.pa,
  );

  const vsLhp = toSplitMetrics(
    {
      gamesPlayed: batter.splits.vsLeft.pa > 0 ? 1 : 0,
      plateAppearances: batter.splits.vsLeft.pa,
      atBats: 0,
      hits: 0,
      homeRuns: batter.splits.vsLeft.hr,
      doubles: 0,
      triples: 0,
      extraBaseHits: batter.splits.vsLeft.hr,
      totalBases: 0,
      walks: 0,
      strikeOuts: 0,
      runs: 0,
      rbi: 0,
      battingAverage: batter.splits.vsLeft.avg || null,
      slugging: batter.splits.vsLeft.slg || null,
      iso:
        batter.splits.vsLeft.slg > 0 && batter.splits.vsLeft.avg > 0
          ? roundTo(batter.splits.vsLeft.slg - batter.splits.vsLeft.avg)
          : null,
      hardHitProxy: null,
    },
    batter.splits.vsLeft.pa,
  );

  const home = toSplitMetrics(
    summarizeBatterGameLogsByFilter(gameLogs, (log) => log.isHome === true),
  );
  const away = toSplitMetrics(
    summarizeBatterGameLogsByFilter(gameLogs, (log) => log.isHome === false),
  );
  const last20 = toSplitMetrics(summarizeBatterGameLogWindow(gameLogs, 20));

  return {
    vsRhp,
    vsLhp,
    home,
    away,
    last20,
  };
}

function buildStatcastProfile(batter: Batter): ResearchStatcastProfile {
  return {
    barrelRate: batter.statcast.barrelRate || null,
    hardHitRate: batter.statcast.hardHitRate || null,
    flyBallRate: batter.statcast.flyBallRate || null,
    pullRate: batter.statcast.pullRate || null,
    averageExitVelocity: batter.statcast.exitVelocityAvg || null,
    maxExitVelocity: null,
    xSlugging: batter.statcast.xSlugging || null,
  };
}

function buildEnvironmentProfile(
  game: Game,
  ballpark: Ballpark | undefined,
): ResearchEnvironmentProfile {
  const parkFactor = ballpark?.hrFactor ?? null;
  const weatherScore = game.weather.hrImpactScore ?? 0;
  const score = roundTo(
    50 + weatherScore * 10 + ((parkFactor ?? 1) - 1) * 60,
    1,
  );

  return {
    park: ballpark?.name ?? null,
    parkFactor,
    weather: {
      temperature: game.weather.temp ?? null,
      windSpeed: game.weather.windSpeed ?? null,
      windDirection: game.weather.windDirection ?? null,
      windToward: game.weather.windToward ?? null,
      condition: game.weather.condition ?? null,
    },
    hrEnvironmentScore: score,
    hrEnvironmentLabel:
      (score ?? 50) >= 57
        ? "favorable"
        : (score ?? 50) <= 44
          ? "poor"
          : "neutral",
  };
}

function buildMatchupProfile(params: {
  batter: Batter;
  pitcher?: Pitcher;
  recentPitcherForm?: RecentPitcherFormSummary | null;
  opponentTeam?: Team;
  gameLogs: BatterGameLogEntry[];
}): ResearchMatchupProfile {
  const { batter, pitcher, recentPitcherForm, opponentTeam, gameLogs } = params;
  const recentVsOpponent = opponentTeam
    ? toSplitMetrics(
        summarizeBatterGameLogsByFilter(
          gameLogs,
          (log) =>
            log.opponentId === opponentTeam.id ||
            log.opponent.toLowerCase() ===
              opponentTeam.abbreviation.toLowerCase(),
        ),
      )
    : null;

  return {
    opposingPitcherName: pitcher?.name ?? null,
    pitcherHand: pitcher?.throws ?? null,
    pitcherHr9: pitcher?.hr9 ?? null,
    pitcherFlyBallRate: pitcher?.fbPct ?? null,
    pitcherHardContactAllowed: null,
    pitcherBarrelsAllowed: null,
    pitcherRecentHr9Allowed: roundTo(
      recentPitcherForm?.recentHrPer9 ?? null,
      2,
    ),
    batterVsPitcherHistory: null,
    recentVsOpponent,
  };
}

function buildPitchMixProfile(batter: Batter, pitcher: Pitcher | undefined) {
  const fitDetails = PITCH_GROUPS.map((pitchGroup) => ({
    pitchGroup,
    usagePercent: roundTo(pitcher?.pitchMix?.[pitchGroup] ?? null, 2),
    hitterSkill: roundTo(batter.pitchTypeSkill?.[pitchGroup] ?? null, 3),
  }))
    .filter(
      (detail) => detail.usagePercent != null || detail.hitterSkill != null,
    )
    .sort((a, b) => (b.usagePercent ?? 0) - (a.usagePercent ?? 0));

  const weightedSkill = fitDetails.reduce((accumulator, detail) => {
    const usage = detail.usagePercent ?? 0;
    const skill = detail.hitterSkill ?? 0;
    return accumulator + usage * skill;
  }, 0);

  const fitScore =
    fitDetails.length > 0 ? roundTo(50 + weightedSkill * 7, 1) : null;

  return {
    pitcherUsage: pitcher?.pitchMix ?? {},
    hitterPerformance: batter.pitchTypeSkill ?? {},
    fitDetails,
    fitScore,
  };
}

function buildTrendFlags(params: {
  recentForm: ResearchRecentFormWindow[];
  splits: ResearchSplits;
  environment: ResearchEnvironmentProfile;
  matchup: ResearchMatchupProfile;
  pitchMixFitScore: number | null;
  boardRow: Pick<DailyHRBoardRow, "edge">;
}): ResearchTrendFlag[] {
  const flags: ResearchTrendFlag[] = [];
  const last7 = params.recentForm.find((window) => window.label === "last7");
  const relevantSplitIso =
    params.matchup.pitcherHand === "L"
      ? params.splits.vsLhp?.iso
      : params.splits.vsRhp?.iso;

  if ((last7?.homeRuns ?? 0) >= RESEARCH_FLAG_THRESHOLDS.hotRecentHrForm) {
    flags.push({
      key: "hot_recent_form",
      label: "Hot recent HR form",
      tone: "positive",
    });
  }

  if ((relevantSplitIso ?? 0) >= RESEARCH_FLAG_THRESHOLDS.strongSplitIso) {
    flags.push({
      key: "strong_split",
      label: "Strong split vs handedness",
      tone: "positive",
    });
  }

  if (
    (params.environment.hrEnvironmentScore ?? 50) >=
    RESEARCH_FLAG_THRESHOLDS.favorableEnvironment
  ) {
    flags.push({
      key: "hr_weather",
      label: "Favorable HR weather",
      tone: "positive",
    });
  }

  if (
    (params.matchup.pitcherHr9 ?? 0) >=
    RESEARCH_FLAG_THRESHOLDS.hrPronePitcherHr9
  ) {
    flags.push({
      key: "hr_prone_pitcher",
      label: "HR-prone opposing pitcher",
      tone: "positive",
    });
  }

  if (
    (params.pitchMixFitScore ?? 0) >=
    RESEARCH_FLAG_THRESHOLDS.strongPitchTypeFit
  ) {
    flags.push({
      key: "pitch_fit",
      label: "Strong pitch-type fit",
      tone: "positive",
    });
  }

  if (
    (params.boardRow.edge ?? 0) >= RESEARCH_FLAG_THRESHOLDS.likelyValueEdgePct
  ) {
    flags.push({
      key: "value",
      label: "Likely value versus odds",
      tone: "positive",
    });
  }

  if ((params.environment.hrEnvironmentScore ?? 50) <= 42) {
    flags.push({
      key: "poor_environment",
      label: "Muted HR environment",
      tone: "caution",
    });
  }

  return flags.slice(0, 6);
}

function buildResearchSummary(params: {
  environment: ResearchEnvironmentProfile;
  recentForm: ResearchRecentFormWindow[];
  matchup: ResearchMatchupProfile;
  splits: ResearchSplits;
  flags: ResearchTrendFlag[];
  pitchMixFitScore: number | null;
}): string {
  const sentences: string[] = [];
  const last7 = params.recentForm.find((window) => window.label === "last7");
  const splitIso =
    params.matchup.pitcherHand === "L"
      ? params.splits.vsLhp?.iso
      : params.splits.vsRhp?.iso;

  if (params.environment.hrEnvironmentLabel === "favorable") {
    const windText =
      params.environment.weather.windToward === "out"
        ? "with wind out"
        : params.environment.weather.windSpeed
          ? `with playable weather around ${params.environment.weather.windSpeed} mph wind`
          : "with supportive run-scoring conditions";
    sentences.push(`Strong HR environment ${windText}.`);
  } else if (params.environment.hrEnvironmentLabel === "poor") {
    sentences.push(
      "The park and weather context lean a bit suppressive for home-run carry.",
    );
  }

  if ((last7?.homeRuns ?? 0) >= 2 || (last7?.iso ?? 0) >= 0.2) {
    sentences.push(
      "Recent power form has been above baseline over the last week.",
    );
  } else if ((last7?.homeRuns ?? 0) === 0) {
    sentences.push(
      "Recent form is steadier than explosive, so this reads more as context-driven upside.",
    );
  }

  if ((splitIso ?? 0) >= 0.2 && params.matchup.pitcherHand) {
    sentences.push(
      `The handedness matchup is favorable against this ${params.matchup.pitcherHand}HP look.`,
    );
  }

  if ((params.matchup.pitcherHr9 ?? 0) >= 1.35) {
    sentences.push(
      "The opposing pitcher has allowed elevated home-run damage.",
    );
  }

  if ((params.pitchMixFitScore ?? 0) >= 60) {
    const topPitch = params.flags.find((flag) => flag.key === "pitch_fit")
      ? params.matchup.pitcherHand
      : null;
    sentences.push(
      topPitch
        ? `Pitch-type fit adds some support to the matchup against the probable arsenal.`
        : "Pitch-type fit adds some support to the matchup.",
    );
  }

  if (sentences.length === 0) {
    sentences.push(
      "Research signals are mixed, with enough context to keep the hitter in the pool but not enough to overstate the spot.",
    );
  }

  return sentences.join(" ");
}

function buildModelReadyFeatures(
  scores: MLBResearchScores,
  recentForm: ResearchRecentFormWindow[],
  splits: ResearchSplits,
  matchup: ResearchMatchupProfile,
  environment: ResearchEnvironmentProfile,
): Record<string, number | null> {
  // TODO: Feed these normalized research features into the shared prop model layer
  // once the current HR ranking workflow is ready for parallel model integration.
  const last7 = recentForm.find((window) => window.label === "last7");
  const last14 = recentForm.find((window) => window.label === "last14");
  const splitIsoVsHand =
    matchup.pitcherHand === "L"
      ? (splits.vsLhp?.iso ?? null)
      : (splits.vsRhp?.iso ?? null);

  const values: Record<
    (typeof MODEL_READY_RESEARCH_FEATURE_KEYS)[number],
    number | null
  > = {
    researchHrScore: scores.hrResearchScore,
    researchContactQualityScore: scores.contactQualityScore,
    researchMatchupScore: scores.matchupScore,
    researchEnvironmentScore: scores.environmentScore,
    researchPitchTypeFitScore: scores.pitchTypeFitScore,
    researchTrendStrengthScore: scores.trendStrengthScore,
    recentFormLast7Iso: last7?.iso ?? null,
    recentFormLast14Iso: last14?.iso ?? null,
    splitIsoVsHand,
    pitcherHr9: matchup.pitcherHr9,
    environmentHrScore: environment.hrEnvironmentScore,
    pitchTypeFitScore: scores.pitchTypeFitScore,
  };

  return values;
}

export function buildMlbPlayerResearchProfile(
  params: BuildResearchProfileParams,
): MLBPlayerResearchProfile {
  const recentForm = [
    toRecentFormWindow(
      "last7",
      summarizeBatterGameLogWindow(params.batterGameLogs, 7),
    ),
    toRecentFormWindow(
      "last14",
      summarizeBatterGameLogWindow(params.batterGameLogs, 14),
    ),
    toRecentFormWindow(
      "last30",
      summarizeBatterGameLogWindow(params.batterGameLogs, 30),
    ),
  ];
  const splits = buildResearchSplits(
    params.batter,
    params.pitcher,
    params.batterGameLogs,
  );
  const statcast = buildStatcastProfile(params.batter);
  const matchup = buildMatchupProfile({
    batter: params.batter,
    pitcher: params.pitcher,
    recentPitcherForm: params.recentPitcherForm,
    opponentTeam: params.opponentTeam,
    gameLogs: params.batterGameLogs,
  });
  const pitchMix = buildPitchMixProfile(params.batter, params.pitcher);
  const environment = buildEnvironmentProfile(params.game, params.ballpark);

  const componentScores = {
    contactQualityScore: computeContactQualityScore(statcast),
    matchupScore: computeMatchupScore(matchup, splits),
    environmentScore: computeEnvironmentScore(environment),
    pitchTypeFitScore: computePitchTypeFitScore(pitchMix),
    trendStrengthScore: 50,
  };
  const trendFlags = buildTrendFlags({
    recentForm,
    splits,
    environment,
    matchup,
    pitchMixFitScore: pitchMix.fitScore,
    boardRow: params.boardRow,
  });
  componentScores.trendStrengthScore = computeTrendStrengthScore(
    trendFlags,
    recentForm,
  );

  const scores: MLBResearchScores = {
    ...componentScores,
    hrResearchScore: computeHrResearchScore(componentScores),
  };

  return {
    playerId: params.batter.id,
    playerName: params.batter.name,
    team: params.team?.abbreviation ?? params.batter.teamId,
    opponent: params.opponentTeam?.abbreviation ?? "OPP",
    awayTeam: params.game.awayTeamId,
    homeTeam: params.game.homeTeamId,
    matchupLabel: formatAwayHomeMatchup(
      params.game.awayTeamId,
      params.game.homeTeamId,
    ),
    gameTime: params.game.timeET ?? params.game.time ?? null,
    battingOrder: params.batter.lineupSpot,
    handedness: {
      bats: params.batter.bats ?? null,
      throws: null,
    },
    homeAway: params.isHome ? "home" : "away",
    opponentPitcherName: params.pitcher?.name ?? null,
    opponentPitcherHand: params.pitcher?.throws ?? null,
    venueName: params.ballpark?.name ?? null,
    park: params.ballpark?.name ?? null,
    weather: environment.weather,
    odds: {
      markets: {
        home_runs: {
          market: "home_runs",
          currentAmericanOdds: params.odds?.americanOdds ?? null,
          bestSportsbook: params.odds?.sportsbook ?? null,
          impliedProbability: roundTo(
            params.odds?.impliedProbability ?? null,
            3,
          ),
          openingAmericanOdds: null,
          lineMovementAmerican: null,
          noVigImpliedProbability: null,
        },
      },
    },
    recentForm,
    splits,
    statcast,
    matchup,
    pitchMix,
    environment,
    trendFlags,
    researchSummary: buildResearchSummary({
      environment,
      recentForm,
      matchup,
      splits,
      flags: trendFlags,
      pitchMixFitScore: pitchMix.fitScore,
    }),
    scores,
    modelReadyFeatures: buildModelReadyFeatures(
      scores,
      recentForm,
      splits,
      matchup,
      environment,
    ),
  };
}

export function formatPitchMixLabel(
  pitchGroup: keyof typeof PITCH_GROUP_DISPLAY_NAMES,
): string {
  return PITCH_GROUP_DISPLAY_NAMES[pitchGroup];
}
