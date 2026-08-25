/** Counter timing is represented in battle time so rendering rate cannot change its boundaries. */
export interface CounterWindow {
  startAt: number;
  endAt: number;
}

export function createCounterWindow(
  attackStartAt: number,
  attackEndAt: number,
  windowMs: number,
  endMarginMs: number
): CounterWindow {
  const startAt = Math.max(attackStartAt, attackEndAt - Math.max(0, windowMs));
  const endAt = Math.max(startAt, attackEndAt - Math.max(0, endMarginMs));
  return { startAt, endAt };
}

export function isCounterWindowOpen(
  nowMs: number,
  window: CounterWindow | null
): boolean {
  return window !== null && nowMs >= window.startAt && nowMs <= window.endAt;
}
