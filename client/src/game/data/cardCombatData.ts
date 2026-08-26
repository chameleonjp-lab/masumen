import type {
  AttackProperty,
  Card,
  CardElement,
  GridPosition,
  PanelTerrain,
} from "../types";

export interface CardCombatProfile {
  element: CardElement;
  properties: readonly AttackProperty[];
  actionId: string;
  powerPerHit: number;
  hitCount: number;
  rangePreviewId: string;
}

export const PR7_CARD_IDS = [
  "rapid", "lance", "seeker", "triplet", "wide", "column", "cross", "fan",
  "ember", "fireline", "frost", "icewall", "volt", "thunderline", "root", "web",
  "slash", "sweep", "dashslash", "gridcut", "moonblade",
] as const;

export const CARD_COMBAT_PROFILES: Readonly<Record<string, CardCombatProfile>> = {
  rapid: { element: "none", properties: ["射撃"], actionId: "rapid", powerPerHit: 12, hitCount: 3, rangePreviewId: "rapid-line" },
  lance: { element: "none", properties: ["射撃"], actionId: "lance", powerPerHit: 60, hitCount: 1, rangePreviewId: "piercing-line" },
  seeker: { element: "none", properties: ["射撃"], actionId: "seeker", powerPerHit: 45, hitCount: 1, rangePreviewId: "direct-line" },
  triplet: { element: "none", properties: ["射撃"], actionId: "triplet", powerPerHit: 20, hitCount: 3, rangePreviewId: "triplet-line" },
  wide: { element: "none", properties: ["射撃"], actionId: "wide", powerPerHit: 40, hitCount: 1, rangePreviewId: "wide-wave" },
  column: { element: "none", properties: ["射撃"], actionId: "column", powerPerHit: 55, hitCount: 1, rangePreviewId: "target-column" },
  cross: { element: "none", properties: ["射撃"], actionId: "cross", powerPerHit: 40, hitCount: 2, rangePreviewId: "impact-cross" },
  fan: { element: "none", properties: ["射撃"], actionId: "fan", powerPerHit: 30, hitCount: 3, rangePreviewId: "fan-lines" },
  ember: { element: "fire", properties: ["射撃"], actionId: "ember", powerPerHit: 50, hitCount: 1, rangePreviewId: "fire-line" },
  fireline: { element: "fire", properties: ["射撃", "地形"], actionId: "fireline", powerPerHit: 40, hitCount: 1, rangePreviewId: "fire-column" },
  frost: { element: "water", properties: ["射撃", "地形"], actionId: "frost", powerPerHit: 35, hitCount: 1, rangePreviewId: "frost-wave" },
  icewall: { element: "water", properties: ["射撃", "地形"], actionId: "icewall", powerPerHit: 40, hitCount: 1, rangePreviewId: "ice-block" },
  volt: { element: "electric", properties: ["射撃"], actionId: "volt", powerPerHit: 45, hitCount: 1, rangePreviewId: "homing-chain" },
  thunderline: { element: "electric", properties: ["射撃"], actionId: "thunderline", powerPerHit: 40, hitCount: 1, rangePreviewId: "target-column" },
  root: { element: "wood", properties: ["射撃"], actionId: "root", powerPerHit: 45, hitCount: 1, rangePreviewId: "root-line" },
  web: { element: "wood", properties: ["射撃"], actionId: "web", powerPerHit: 25, hitCount: 1, rangePreviewId: "wood-net" },
  slash: { element: "none", properties: ["剣"], actionId: "slash", powerPerHit: 80, hitCount: 1, rangePreviewId: "front-tile" },
  sweep: { element: "none", properties: ["剣"], actionId: "sweep", powerPerHit: 70, hitCount: 1, rangePreviewId: "front-column" },
  dashslash: { element: "none", properties: ["剣"], actionId: "dashslash", powerPerHit: 100, hitCount: 1, rangePreviewId: "dash-target" },
  gridcut: { element: "none", properties: ["剣"], actionId: "gridcut", powerPerHit: 50, hitCount: 2, rangePreviewId: "grid-cross" },
  moonblade: { element: "none", properties: ["剣"], actionId: "moonblade", powerPerHit: 140, hitCount: 1, rangePreviewId: "long-line" },
};

function inside(position: GridPosition): boolean {
  return position.col >= 0 && position.col < 6 && position.row >= 0 && position.row < 3;
}

function unique(tiles: GridPosition[]): GridPosition[] {
  return tiles.filter((tile, index) =>
    tiles.findIndex(candidate => candidate.col === tile.col && candidate.row === tile.row) === index
  );
}

function nearestEnemy(origin: GridPosition, enemies: readonly GridPosition[]): GridPosition | null {
  return [...enemies].sort((a, b) =>
    Math.abs(a.col - origin.col) + Math.abs(a.row - origin.row) -
    (Math.abs(b.col - origin.col) + Math.abs(b.row - origin.row)) ||
    a.col - b.col || a.row - b.row
  )[0] ?? null;
}

function pathToFront(origin: GridPosition): GridPosition[] {
  return Array.from({ length: Math.max(0, 5 - origin.col) }, (_, index) => ({
    col: origin.col + index + 1,
    row: origin.row,
  }));
}

function enemyField(origin: GridPosition): GridPosition[] {
  return Array.from({ length: Math.max(0, 5 - origin.col) }, (_, index) =>
    [0, 1, 2].map(row => ({ col: origin.col + index + 1, row }))
  ).flat();
}

function columnAt(column: number): GridPosition[] {
  return [0, 1, 2].map(row => ({ col: Math.max(0, Math.min(5, column)), row }));
}

function impactCross(origin: GridPosition, enemies: readonly GridPosition[]): GridPosition[] {
  const sameRowTarget = [...enemies]
    .filter(enemy => enemy.row === origin.row && enemy.col > origin.col)
    .sort((a, b) => a.col - b.col)[0] ?? null;
  const impact = sameRowTarget ?? { col: Math.min(5, origin.col + 3), row: origin.row };
  return unique([
    ...pathToFront(origin).filter(tile => tile.col <= impact.col),
    impact,
    { col: impact.col - 1, row: impact.row },
    { col: impact.col + 1, row: impact.row },
    { col: impact.col, row: impact.row - 1 },
    { col: impact.col, row: impact.row + 1 },
  ].filter(inside));
}

function fanLines(origin: GridPosition): GridPosition[] {
  const result: GridPosition[] = [];
  for (const direction of [{ col: 1, row: 0 }, { col: 1, row: -1 }, { col: 1, row: 1 }]) {
    let current = { col: origin.col + direction.col, row: origin.row + direction.row };
    while (inside(current)) {
      result.push({ ...current });
      current = { col: current.col + direction.col, row: current.row + direction.row };
    }
  }
  return unique(result);
}

function pointTarget(origin: GridPosition, enemies: readonly GridPosition[]): GridPosition {
  const target = nearestEnemy(origin, enemies);
  return target ? { ...target } : { col: Math.min(5, Math.max(3, origin.col + 2)), row: origin.row };
}

function twoByTwo(point: GridPosition): GridPosition[] {
  const topLeft = { col: Math.max(0, Math.min(4, point.col)), row: Math.max(0, Math.min(1, point.row)) };
  return unique([
    topLeft,
    { col: topLeft.col + 1, row: topLeft.row },
    { col: topLeft.col, row: topLeft.row + 1 },
    { col: topLeft.col + 1, row: topLeft.row + 1 },
  ].filter(inside));
}

function targetColumn(origin: GridPosition, enemies: readonly GridPosition[]): number {
  return nearestEnemy(origin, enemies)?.col ?? Math.min(5, origin.col + 2);
}

export function getCardCombatProfile(id: string): CardCombatProfile {
  return CARD_COMBAT_PROFILES[id] ?? {
    element: "none",
    properties: [],
    actionId: id,
    powerPerHit: 0,
    hitCount: 1,
    rangePreviewId: "shape-default",
  };
}

export function enrichCard(card: Card): Card {
  const profile = getCardCombatProfile(card.id);
  return {
    ...card,
    ...profile,
    powerPerHit: profile.powerPerHit || card.power,
    hitCount: profile.hitCount || 1,
    rangePreviewId: profile.rangePreviewId || "shape-default",
    vfxId: card.vfxId ?? card.id,
    audioId: card.audioId ?? card.id,
  };
}

export function cardPreviewTiles(card: Card | undefined, origin: GridPosition, enemies: readonly GridPosition[] = []): GridPosition[] {
  if (!card) return [];
  const action = getCardCombatProfile(card.id).actionId;
  if (["rapid", "lance", "seeker", "triplet", "ember", "root"].includes(action)) return pathToFront(origin);
  if (action === "wide" || action === "frost") return enemyField(origin);
  if (action === "column" || action === "thunderline") return columnAt(targetColumn(origin, enemies));
  if (action === "fireline") return columnAt(Math.min(5, origin.col + 2));
  if (action === "cross") return impactCross(origin, enemies);
  if (action === "fan") return fanLines(origin);
  if (action === "icewall") return [pointTarget(origin, enemies)];
  if (action === "volt") return unique([...pathToFront(origin), ...(nearestEnemy(origin, enemies) ? [nearestEnemy(origin, enemies) as GridPosition] : [])]);
  if (action === "root") return pathToFront(origin);
  if (action === "web") return twoByTwo(pointTarget(origin, enemies));
  if (action === "slash") return [{ col: origin.col + 1, row: origin.row }].filter(inside);
  if (action === "sweep") return columnAt(origin.col + 1).filter(tile => tile.col > origin.col);
  if (action === "dashslash") {
    const target = nearestEnemy(origin, enemies);
    return target ? [target] : pathToFront(origin).slice(0, 1);
  }
  if (action === "gridcut") {
    const target = pointTarget(origin, enemies);
    return unique([
      ...Array.from({ length: 3 }, (_, index) => ({ col: target.col - 1 + index, row: target.row })),
      ...columnAt(target.col),
    ].filter(inside));
  }
  if (action === "moonblade") return pathToFront(origin).slice(0, 2);
  if (card.target === "self") return [{ ...origin }];
  if (card.target === "column") return columnAt(origin.col + 2);
  if (card.target === "enemy-field") return enemyField(origin);
  return pathToFront(origin);
}

export function getElementalMultiplier(attack: CardElement, defender: CardElement, terrain: PanelTerrain): number {
  const weakness: Partial<Record<CardElement, CardElement>> = {
    fire: "wood",
    water: "fire",
    electric: "water",
    wood: "electric",
  };
  let multiplier = weakness[attack] === defender ? 2 : 1;
  if (attack === "fire" && terrain === "grass") multiplier *= 2;
  if (attack === "electric" && terrain === "ice") multiplier *= 2;
  return Math.min(4, multiplier);
}
