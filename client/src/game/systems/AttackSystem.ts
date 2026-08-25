import type { AttackTiming, Card, GridPosition } from "../types";

export const DEFAULT_CARD_ATTACK_TIMING: AttackTiming = {
  startupMs: 90,
  counterStartMs: null,
  counterEndMs: null,
  activeMs: 100,
  recoveryMs: 140,
};

export interface MeleePlan {
  origin: GridPosition;
  direction: GridPosition;
  tiles: GridPosition[];
  timing: AttackTiming;
  damage: number;
  dashFrom: GridPosition | null;
  dashTo: GridPosition | null;
  returnTo: GridPosition | null;
}

export interface DashPositionResolver {
  (position: GridPosition): boolean;
}

function sameTile(a: GridPosition, b: GridPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

function clone(position: GridPosition): GridPosition {
  return { col: position.col, row: position.row };
}

function inside(position: GridPosition): boolean {
  return (
    position.col >= 0 &&
    position.col < 6 &&
    position.row >= 0 &&
    position.row < 3
  );
}

function normaliseDirection(direction: GridPosition): GridPosition {
  if (Math.abs(direction.col) >= Math.abs(direction.row))
    return { col: Math.sign(direction.col) || 1, row: 0 };
  return { col: 0, row: Math.sign(direction.row) || 1 };
}

export function attackTiming(
  overrides: Partial<AttackTiming> = {}
): AttackTiming {
  return { ...DEFAULT_CARD_ATTACK_TIMING, ...overrides };
}

export function isCounterWindow(
  elapsedMs: number,
  timing: AttackTiming
): boolean {
  const start = timing.counterStartMs;
  const end = timing.counterEndMs;
  return (
    start !== null && end !== null && elapsedMs >= start && elapsedMs <= end
  );
}

export function meleeTiles(
  origin: GridPosition,
  direction: GridPosition,
  range: number
): GridPosition[] {
  const step = normaliseDirection(direction);
  return Array.from({ length: Math.max(0, range) }, (_, index) => ({
    col: origin.col + step.col * (index + 1),
    row: origin.row + step.row * (index + 1),
  })).filter(inside);
}

export function crossMeleeTiles(
  origin: GridPosition,
  direction: GridPosition
): GridPosition[] {
  const step = normaliseDirection(direction);
  const forward = { col: origin.col + step.col, row: origin.row + step.row };
  const tiles = [
    ...meleeTiles(origin, step, 1),
    { col: forward.col, row: forward.row - 1 },
    { col: forward.col, row: forward.row + 1 },
  ];
  return tiles
    .filter(position => inside(position))
    .filter(
      (tile, index, all) =>
        all.findIndex(candidate => sameTile(candidate, tile)) === index
    );
}

function closestDashLanding(
  origin: GridPosition,
  target: GridPosition,
  canEnter: DashPositionResolver
): GridPosition | null {
  const direction = normaliseDirection({
    col: target.col - origin.col,
    row: target.row - origin.row,
  });
  const candidates = [
    { col: target.col - direction.col, row: target.row - direction.row },
    { col: origin.col + direction.col, row: origin.row + direction.row },
    clone(origin),
  ];
  return (
    candidates.find(
      position =>
        inside(position) && (sameTile(position, origin) || canEnter(position))
    ) ?? null
  );
}

export function createMeleePlan(
  origin: GridPosition,
  target: GridPosition | null,
  damage: number,
  range: number,
  options: {
    timing?: Partial<AttackTiming>;
    dash?: boolean;
    canEnter?: DashPositionResolver;
    cross?: boolean;
  } = {}
): MeleePlan {
  const direction = target
    ? normaliseDirection({
        col: target.col - origin.col,
        row: target.row - origin.row,
      })
    : { col: 1, row: 0 };
  const dashFrom = options.dash && target ? clone(origin) : null;
  const dashTo =
    options.dash && target && options.canEnter
      ? closestDashLanding(origin, target, options.canEnter)
      : null;
  const attackOrigin = dashTo ?? origin;
  const tiles = options.cross
    ? crossMeleeTiles(attackOrigin, direction)
    : meleeTiles(attackOrigin, direction, range);
  return {
    origin: clone(attackOrigin),
    direction,
    tiles,
    timing: attackTiming(options.timing),
    damage,
    dashFrom,
    dashTo,
    returnTo: dashTo ? clone(origin) : null,
  };
}

export function getMeleeRange(card: Card): number {
  if (card.id === "sweep") return 3;
  if (card.id === "moonblade") return 2;
  if (card.id === "gridcut") return 1;
  return 1;
}
