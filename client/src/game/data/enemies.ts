import type {
  CardElement,
  EnemyDefenseMode,
  EnemyMovementMode,
} from "../types";

export type EnemyPattern =
  | "lane-sweep"
  | "column-scan"
  | "pursuit-dash"
  | "mortar-spread"
  | "pulse-grid";

export type EnemyActionTarget =
  | "row"
  | "column"
  | "player"
  | "adjacent"
  | "cross"
  | "spread"
  | "alternating"
  | "mine";

export interface EnemyActionDefinition {
  id: string;
  name: string;
  pattern: EnemyPattern;
  kind: "projectile" | "melee" | "field";
  target: EnemyActionTarget;
  damage: number;
  startupMs: number;
  counterWindowMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
  motion?: "straight" | "thrown" | "homing";
  projectileCount?: number;
  projectileIntervalMs?: number;
  warningDelayMs?: number;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  maxHp: number;
  element: CardElement;
  movement: EnemyMovementMode;
  defense: EnemyDefenseMode;
  actions: readonly EnemyActionDefinition[];
}

export type EnemyId =
  | "bulwark"
  | "scanner"
  | "razor"
  | "mortar"
  | "sentinel";

export const ENEMY_DEFINITIONS: Record<EnemyId, EnemyDefinition> = {
  bulwark: {
    id: "bulwark",
    name: "BULWARK-3",
    maxHp: 150,
    element: "none",
    movement: "ground",
    defense: "guard",
    actions: [
      {
        id: "bulwark-lane-cannon",
        name: "横一列砲撃",
        pattern: "lane-sweep",
        kind: "projectile",
        target: "row",
        damage: 24,
        startupMs: 1080,
        counterWindowMs: 150,
        activeMs: 100,
        recoveryMs: 460,
        cooldownMs: 1550,
        motion: "straight",
      },
      {
        id: "bulwark-shield-bash",
        name: "近距離盾打ち",
        pattern: "lane-sweep",
        kind: "melee",
        target: "adjacent",
        damage: 32,
        startupMs: 760,
        counterWindowMs: 120,
        activeMs: 120,
        recoveryMs: 540,
        cooldownMs: 1800,
      },
    ],
  },
  scanner: {
    id: "scanner",
    name: "SCANNER-8",
    maxHp: 95,
    element: "none",
    movement: "flying",
    defense: "airborne",
    actions: [
      {
        id: "scanner-column-scan",
        name: "縦列走査",
        pattern: "column-scan",
        kind: "projectile",
        target: "column",
        damage: 18,
        startupMs: 820,
        counterWindowMs: 150,
        activeMs: 120,
        recoveryMs: 430,
        cooldownMs: 1150,
        motion: "thrown",
      },
      {
        id: "scanner-signal-lock",
        name: "追尾信号弾",
        pattern: "column-scan",
        kind: "projectile",
        target: "player",
        damage: 14,
        startupMs: 720,
        counterWindowMs: 120,
        activeMs: 100,
        recoveryMs: 420,
        cooldownMs: 1350,
        motion: "homing",
        warningDelayMs: 300,
      },
    ],
  },
  razor: {
    id: "razor",
    name: "RAZOR-6",
    maxHp: 100,
    element: "none",
    movement: "pursuit",
    defense: "none",
    actions: [
      {
        id: "razor-dash-cut",
        name: "踏み込み斬り",
        pattern: "pursuit-dash",
        kind: "melee",
        target: "adjacent",
        damage: 22,
        startupMs: 600,
        counterWindowMs: 110,
        activeMs: 120,
        recoveryMs: 400,
        cooldownMs: 850,
      },
      {
        id: "razor-cross-slash",
        name: "横薙ぎ",
        pattern: "pursuit-dash",
        kind: "melee",
        target: "cross",
        damage: 28,
        startupMs: 780,
        counterWindowMs: 130,
        activeMs: 100,
        recoveryMs: 480,
        cooldownMs: 1250,
      },
    ],
  },
  mortar: {
    id: "mortar",
    name: "MORTAR-NODE",
    maxHp: 160,
    element: "none",
    movement: "stationary",
    defense: "none",
    actions: [
      {
        id: "mortar-shell",
        name: "山なり砲弾",
        pattern: "mortar-spread",
        kind: "projectile",
        target: "player",
        damage: 25,
        startupMs: 1320,
        counterWindowMs: 180,
        activeMs: 120,
        recoveryMs: 520,
        cooldownMs: 1800,
        motion: "thrown",
      },
      {
        id: "mortar-triple-shell",
        name: "三点砲撃",
        pattern: "mortar-spread",
        kind: "projectile",
        target: "spread",
        damage: 18,
        startupMs: 1120,
        counterWindowMs: 160,
        activeMs: 160,
        recoveryMs: 600,
        cooldownMs: 2100,
        motion: "thrown",
        projectileCount: 3,
        projectileIntervalMs: 110,
      },
      {
        id: "mortar-mine-drop",
        name: "破壊可能な地雷",
        pattern: "mortar-spread",
        kind: "field",
        target: "mine",
        damage: 28,
        startupMs: 900,
        counterWindowMs: 130,
        activeMs: 80,
        recoveryMs: 400,
        cooldownMs: 1600,
      },
    ],
  },
  sentinel: {
    id: "sentinel",
    name: "VOLT-SENTINEL",
    maxHp: 130,
    element: "electric",
    movement: "flying",
    defense: "airborne",
    actions: [
      {
        id: "sentinel-alternating-pulse",
        name: "交互マス電撃",
        pattern: "pulse-grid",
        kind: "projectile",
        target: "alternating",
        damage: 21,
        startupMs: 980,
        counterWindowMs: 140,
        activeMs: 160,
        recoveryMs: 450,
        cooldownMs: 1040,
        motion: "thrown",
      },
      {
        id: "sentinel-chain-bolt",
        name: "連鎖電撃",
        pattern: "pulse-grid",
        kind: "projectile",
        target: "player",
        damage: 16,
        startupMs: 760,
        counterWindowMs: 120,
        activeMs: 100,
        recoveryMs: 430,
        cooldownMs: 1350,
        motion: "homing",
        warningDelayMs: 220,
      },
    ],
  },
};

export const PR10_ENEMY_IDS: readonly EnemyId[] = [
  "bulwark",
  "scanner",
  "razor",
  "mortar",
  "sentinel",
];

export function getEnemyDefinition(id: string): EnemyDefinition | undefined {
  if (!Object.prototype.hasOwnProperty.call(ENEMY_DEFINITIONS, id)) return undefined;
  return ENEMY_DEFINITIONS[id as EnemyId];
}
