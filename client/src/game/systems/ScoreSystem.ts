import { COMBAT_BALANCE } from "../data/balance";
import type { EnemyId } from "../data/enemies";
import type {
  ScoreBreakdown,
  WaveScoreSummary,
} from "../types";

export type ScoreComponent = Exclude<keyof ScoreBreakdown, "total">;

export function createScoreBreakdown(): ScoreBreakdown {
  return {
    enemyDefeatPoints: 0,
    waveClearPoints: 0,
    timePoints: 0,
    counterPoints: 0,
    simultaneousPoints: 0,
    noDamagePoints: 0,
    damagePenalty: 0,
    overloadPenalty: 0,
    total: 0,
  };
}

export function calculateScoreTotal(
  breakdown: Omit<ScoreBreakdown, "total"> | ScoreBreakdown
): number {
  return Math.max(
    0,
    breakdown.enemyDefeatPoints +
      breakdown.waveClearPoints +
      breakdown.timePoints +
      breakdown.counterPoints +
      breakdown.simultaneousPoints +
      breakdown.noDamagePoints -
      breakdown.damagePenalty -
      breakdown.overloadPenalty
  );
}

export function addScoreComponent(
  breakdown: ScoreBreakdown,
  component: ScoreComponent,
  amount: number
): ScoreBreakdown {
  const next = { ...breakdown };
  next[component] = Math.max(0, next[component] + amount);
  next.total = calculateScoreTotal(next);
  return next;
}

export function enemyDefeatScore(enemyId: EnemyId): number {
  return COMBAT_BALANCE.score.enemyDefeatPoints[enemyId] ?? 100;
}

export function scoreWaveCompletion(input: {
  wave: number;
  elapsedSeconds: number;
  damageTaken: number;
}): WaveScoreSummary {
  const baseline =
    COMBAT_BALANCE.score.baselineWaveSeconds[
      Math.max(1, Math.min(4, input.wave)) as 1 | 2 | 3 | 4
    ];
  const timePoints = Math.max(
    0,
    Math.floor(baseline - Math.max(0, input.elapsedSeconds)) *
      COMBAT_BALANCE.score.timeBonusPerSecond
  );
  const waveClearPoints =
    Math.max(1, input.wave) * COMBAT_BALANCE.score.waveClearPerWave;
  const noDamagePoints =
    input.damageTaken === 0 ? COMBAT_BALANCE.score.noDamageWavePoints : 0;

  return {
    wave: input.wave,
    elapsedSeconds: Math.max(0, input.elapsedSeconds),
    damageTaken: Math.max(0, Math.round(input.damageTaken)),
    waveClearPoints,
    timePoints,
    noDamagePoints,
    total: waveClearPoints + timePoints + noDamagePoints,
  };
}

export function scoreRate(
  score: number,
  benchmark = COMBAT_BALANCE.score.runBenchmark
): number {
  if (benchmark <= 0) return 0;
  return Math.max(0, score) / benchmark;
}

export function rankForScore(
  score: number,
  benchmark = COMBAT_BALANCE.score.runBenchmark
): "S" | "A" | "B" | "C" | "D" {
  const rate = scoreRate(score, benchmark);
  if (rate >= COMBAT_BALANCE.score.rankThresholds.S) return "S";
  if (rate >= COMBAT_BALANCE.score.rankThresholds.A) return "A";
  if (rate >= COMBAT_BALANCE.score.rankThresholds.B) return "B";
  if (rate >= COMBAT_BALANCE.score.rankThresholds.C) return "C";
  return "D";
}
