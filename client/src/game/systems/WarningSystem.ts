import type { EnemyWarningStage } from "../types";

export const URGENT_WARNING_PROGRESS = 0.68;

export function warningProgress(
  nowMs: number,
  warningStartMs: number,
  attackAtMs: number
): number {
  const duration = Math.max(1, attackAtMs - warningStartMs);
  return Math.max(0, Math.min(1, (nowMs - warningStartMs) / duration));
}

export function warningStage(progress: number): EnemyWarningStage {
  return progress >= URGENT_WARNING_PROGRESS ? "urgent" : "telegraph";
}

export function warningRemainingMs(nowMs: number, attackAtMs: number): number {
  return Math.max(0, attackAtMs - nowMs);
}
