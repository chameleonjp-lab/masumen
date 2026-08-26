import type {
  CardElement,
  CardStatus,
  EnemyDefenseMode,
  EnemyMovementMode,
  FieldObjectKind,
  PanelTerrain,
} from "../types";

export type EnemyPattern =
  | "lane-sweep"
  | "column-scan"
  | "pursuit-dash"
  | "mortar-spread"
  | "pulse-grid"
  | "wave-runner"
  | "boomer-arc"
  | "hopper-bomb"
  | "gaia-hammer"
  | "weather-core"
  | "support-relay"
  | "mirror-node"
  | "bastion-prime"
  | "prism-hunter"
  | "climate-engine"
  | "core-arbiter";

export type EnemyActionTarget =
  | "row"
  | "column"
  | "player"
  | "adjacent"
  | "cross"
  | "spread"
  | "alternating"
  | "mine"
  | "all-rows"
  | "outer"
  | "landing"
  | "support"
  | "mirror"
  | "player-territory";

export interface EnemyActionDefinition {
  id: string;
  name: string;
  pattern: EnemyPattern;
  kind: "projectile" | "melee" | "field" | "support";
  target: EnemyActionTarget;
  damage: number;
  startupMs: number;
  counterWindowMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
  motion?: "straight" | "thrown" | "homing" | "wave" | "orbit";
  projectileCount?: number;
  projectileIntervalMs?: number;
  warningDelayMs?: number;
  hitCount?: number;
  element?: CardElement;
  weaknessElement?: CardElement;
  panelTerrain?: PanelTerrain;
  status?: CardStatus;
  statusDurationMs?: number;
  supportEffect?: "heal" | "barrier";
  supportAmount?: number;
  objectKind?: FieldObjectKind;
  objectHp?: number;
  objectLifetimeMs?: number | null;
  continuesAfterHit?: boolean;
}

export interface EnemyPhaseDefinition {
  phase: number;
  label: string;
  maxHpRatio: number;
  actionIds: readonly string[];
  defense?: EnemyDefenseMode;
  movement?: EnemyMovementMode;
  weaknessElement?: CardElement;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  rank: "normal" | "boss";
  maxHp: number;
  element: CardElement;
  weakness?: CardElement;
  movement: EnemyMovementMode;
  defense: EnemyDefenseMode;
  actions: readonly EnemyActionDefinition[];
  phases?: readonly EnemyPhaseDefinition[];
}

export type EnemyId =
  | "bulwark"
  | "scanner"
  | "razor"
  | "mortar"
  | "sentinel"
  | "wave-runner"
  | "boomer-arc"
  | "hopper-bomb"
  | "gaia-hammer"
  | "weather-core"
  | "support-relay"
  | "mirror-node"
  | "bastion-prime"
  | "prism-hunter"
  | "climate-engine"
  | "core-arbiter";

type ActionInput = Pick<
  EnemyActionDefinition,
  | "id"
  | "name"
  | "pattern"
  | "kind"
  | "target"
  | "damage"
  | "startupMs"
  | "counterWindowMs"
  | "cooldownMs"
> &
  Partial<
    Omit<
      EnemyActionDefinition,
      | "id"
      | "name"
      | "pattern"
      | "kind"
      | "target"
      | "damage"
      | "startupMs"
      | "counterWindowMs"
      | "cooldownMs"
    >
  >;

const action = (input: ActionInput): EnemyActionDefinition => ({
  activeMs: 100,
  recoveryMs: 450,
  ...input,
});

const normal = (
  definition: Omit<EnemyDefinition, "rank">
): EnemyDefinition => ({
  ...definition,
  rank: "normal",
});

export const ENEMY_DEFINITIONS: Record<EnemyId, EnemyDefinition> = {
  bulwark: normal({
    id: "bulwark",
    name: "BULWARK-3",
    maxHp: 150,
    element: "none",
    movement: "ground",
    defense: "guard",
    actions: [
      action({
        id: "bulwark-lane-cannon",
        name: "横一列砲撃",
        pattern: "lane-sweep",
        kind: "projectile",
        target: "row",
        damage: 24,
        startupMs: 1080,
        counterWindowMs: 150,
        cooldownMs: 1550,
        motion: "straight",
      }),
      action({
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
      }),
    ],
  }),
  scanner: normal({
    id: "scanner",
    name: "SCANNER-8",
    maxHp: 95,
    element: "none",
    movement: "flying",
    defense: "airborne",
    actions: [
      action({
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
      }),
      action({
        id: "scanner-signal-lock",
        name: "追尾信号弾",
        pattern: "column-scan",
        kind: "projectile",
        target: "player",
        damage: 14,
        startupMs: 720,
        counterWindowMs: 120,
        recoveryMs: 420,
        cooldownMs: 1350,
        motion: "homing",
        warningDelayMs: 300,
      }),
    ],
  }),
  razor: normal({
    id: "razor",
    name: "RAZOR-6",
    maxHp: 100,
    element: "none",
    movement: "pursuit",
    defense: "none",
    actions: [
      action({
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
      }),
      action({
        id: "razor-cross-slash",
        name: "横薙ぎ",
        pattern: "pursuit-dash",
        kind: "melee",
        target: "cross",
        damage: 28,
        startupMs: 780,
        counterWindowMs: 130,
        cooldownMs: 1250,
        recoveryMs: 480,
      }),
    ],
  }),
  mortar: normal({
    id: "mortar",
    name: "MORTAR-NODE",
    maxHp: 160,
    element: "none",
    movement: "stationary",
    defense: "none",
    actions: [
      action({
        id: "mortar-shell",
        name: "山なり砲弾",
        pattern: "mortar-spread",
        kind: "projectile",
        target: "player",
        damage: 25,
        startupMs: 1320,
        counterWindowMs: 180,
        recoveryMs: 520,
        cooldownMs: 1800,
        motion: "thrown",
      }),
      action({
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
      }),
      action({
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
        objectKind: "mine",
        objectHp: 35,
        objectLifetimeMs: 5000,
      }),
    ],
  }),
  sentinel: normal({
    id: "sentinel",
    name: "VOLT-SENTINEL",
    maxHp: 130,
    element: "electric",
    movement: "flying",
    defense: "airborne",
    actions: [
      action({
        id: "sentinel-alternating-pulse",
        name: "交互マス電撃",
        pattern: "pulse-grid",
        kind: "projectile",
        target: "alternating",
        damage: 21,
        startupMs: 980,
        counterWindowMs: 140,
        activeMs: 160,
        cooldownMs: 1040,
        motion: "thrown",
      }),
      action({
        id: "sentinel-chain-bolt",
        name: "連鎖電撃",
        pattern: "pulse-grid",
        kind: "projectile",
        target: "player",
        damage: 16,
        startupMs: 760,
        counterWindowMs: 120,
        recoveryMs: 430,
        cooldownMs: 1350,
        motion: "homing",
        warningDelayMs: 220,
      }),
    ],
  }),
  "wave-runner": normal({
    id: "wave-runner",
    name: "WAVE-RUNNER",
    maxHp: 80,
    element: "water",
    movement: "row-align",
    defense: "none",
    actions: [
      action({
        id: "wave-runner-water-wave",
        name: "三行水波",
        pattern: "wave-runner",
        kind: "projectile",
        target: "all-rows",
        damage: 20,
        startupMs: 900,
        counterWindowMs: 130,
        recoveryMs: 430,
        cooldownMs: 1350,
        motion: "wave",
        panelTerrain: "ice",
      }),
      action({
        id: "wave-runner-frost-surge",
        name: "氷化波",
        pattern: "wave-runner",
        kind: "projectile",
        target: "all-rows",
        damage: 26,
        startupMs: 1100,
        counterWindowMs: 150,
        activeMs: 160,
        recoveryMs: 500,
        cooldownMs: 1700,
        motion: "wave",
        panelTerrain: "ice",
      }),
    ],
  }),
  "boomer-arc": normal({
    id: "boomer-arc",
    name: "BOOMER-ARC",
    maxHp: 90,
    element: "none",
    movement: "outer",
    defense: "none",
    actions: [
      action({
        id: "boomer-arc-outbound",
        name: "周回弾",
        pattern: "boomer-arc",
        kind: "projectile",
        target: "outer",
        damage: 18,
        startupMs: 1000,
        counterWindowMs: 120,
        recoveryMs: 450,
        cooldownMs: 1400,
        motion: "orbit",
        continuesAfterHit: true,
      }),
      action({
        id: "boomer-arc-return",
        name: "折返し周回弾",
        pattern: "boomer-arc",
        kind: "projectile",
        target: "outer",
        damage: 24,
        startupMs: 1100,
        counterWindowMs: 150,
        recoveryMs: 520,
        cooldownMs: 1700,
        motion: "orbit",
        continuesAfterHit: true,
      }),
    ],
  }),
  "hopper-bomb": normal({
    id: "hopper-bomb",
    name: "HOPPER-BOMB",
    maxHp: 110,
    element: "none",
    movement: "ground",
    defense: "none",
    actions: [
      action({
        id: "hopper-jump-land",
        name: "跳躍着地爆発",
        pattern: "hopper-bomb",
        kind: "field",
        target: "landing",
        damage: 34,
        startupMs: 900,
        counterWindowMs: 140,
        cooldownMs: 1500,
        panelTerrain: "cracked",
      }),
      action({
        id: "hopper-bomb-drop",
        name: "爆弾投下",
        pattern: "hopper-bomb",
        kind: "field",
        target: "landing",
        damage: 26,
        startupMs: 800,
        counterWindowMs: 120,
        activeMs: 80,
        recoveryMs: 430,
        cooldownMs: 1300,
        objectKind: "bomb",
        objectHp: 50,
        objectLifetimeMs: 2000,
      }),
    ],
  }),
  "gaia-hammer": normal({
    id: "gaia-hammer",
    name: "GAIA-HAMMER",
    maxHp: 180,
    element: "none",
    movement: "stationary",
    defense: "armor",
    actions: [
      action({
        id: "gaia-hammer-strike",
        name: "装甲槌撃",
        pattern: "gaia-hammer",
        kind: "melee",
        target: "adjacent",
        damage: 36,
        startupMs: 1100,
        counterWindowMs: 160,
        activeMs: 140,
        recoveryMs: 650,
        cooldownMs: 1800,
      }),
      action({
        id: "gaia-earthquake",
        name: "地震",
        pattern: "gaia-hammer",
        kind: "field",
        target: "player",
        damage: 22,
        startupMs: 1300,
        counterWindowMs: 180,
        activeMs: 180,
        recoveryMs: 700,
        cooldownMs: 2200,
        panelTerrain: "cracked",
      }),
    ],
  }),
  "weather-core": normal({
    id: "weather-core",
    name: "WEATHER-CORE",
    maxHp: 140,
    element: "none",
    movement: "stationary",
    defense: "none",
    actions: [
      action({
        id: "weather-firefront",
        name: "炎天候",
        pattern: "weather-core",
        kind: "projectile",
        target: "row",
        damage: 24,
        startupMs: 850,
        counterWindowMs: 130,
        recoveryMs: 420,
        cooldownMs: 1200,
        motion: "straight",
        element: "fire",
        weaknessElement: "wood",
        panelTerrain: "lava",
      }),
      action({
        id: "weather-waterfront",
        name: "水天候",
        pattern: "weather-core",
        kind: "projectile",
        target: "all-rows",
        damage: 22,
        startupMs: 900,
        counterWindowMs: 140,
        recoveryMs: 480,
        cooldownMs: 1400,
        motion: "wave",
        element: "water",
        weaknessElement: "fire",
        panelTerrain: "ice",
      }),
      action({
        id: "weather-electric-pulse",
        name: "電天候",
        pattern: "weather-core",
        kind: "projectile",
        target: "column",
        damage: 28,
        startupMs: 980,
        counterWindowMs: 150,
        recoveryMs: 520,
        cooldownMs: 1600,
        motion: "thrown",
        element: "electric",
        weaknessElement: "water",
        status: "stun",
        statusDurationMs: 450,
      }),
      action({
        id: "weather-wood-root",
        name: "木天候",
        pattern: "weather-core",
        kind: "projectile",
        target: "player",
        damage: 25,
        startupMs: 920,
        counterWindowMs: 130,
        recoveryMs: 460,
        cooldownMs: 1450,
        motion: "homing",
        element: "wood",
        weaknessElement: "electric",
        status: "root",
        statusDurationMs: 900,
      }),
    ],
  }),
  "support-relay": normal({
    id: "support-relay",
    name: "SUPPORT-RELAY",
    maxHp: 85,
    element: "none",
    movement: "ground",
    defense: "none",
    actions: [
      action({
        id: "support-relay-heal",
        name: "味方修復",
        pattern: "support-relay",
        kind: "support",
        target: "support",
        damage: 0,
        startupMs: 900,
        counterWindowMs: 120,
        activeMs: 80,
        recoveryMs: 400,
        cooldownMs: 1500,
        supportEffect: "heal",
        supportAmount: 36,
      }),
      action({
        id: "support-relay-barrier",
        name: "味方障壁",
        pattern: "support-relay",
        kind: "support",
        target: "support",
        damage: 0,
        startupMs: 820,
        counterWindowMs: 130,
        activeMs: 80,
        recoveryMs: 420,
        cooldownMs: 1650,
        supportEffect: "barrier",
        supportAmount: 70,
      }),
      action({
        id: "support-relay-shot",
        name: "支援射撃",
        pattern: "support-relay",
        kind: "projectile",
        target: "player",
        damage: 12,
        startupMs: 720,
        counterWindowMs: 110,
        recoveryMs: 380,
        cooldownMs: 1200,
        motion: "straight",
      }),
    ],
  }),
  "mirror-node": normal({
    id: "mirror-node",
    name: "MIRROR-NODE",
    maxHp: 120,
    element: "none",
    movement: "stationary",
    defense: "reflect",
    actions: [
      action({
        id: "mirror-reflect-stance",
        name: "反射姿勢",
        pattern: "mirror-node",
        kind: "field",
        target: "mirror",
        damage: 0,
        startupMs: 700,
        counterWindowMs: 120,
        cooldownMs: 1200,
      }),
      action({
        id: "mirror-mimic-shot",
        name: "模倣射撃",
        pattern: "mirror-node",
        kind: "projectile",
        target: "player",
        damage: 20,
        startupMs: 950,
        counterWindowMs: 150,
        recoveryMs: 450,
        cooldownMs: 1600,
        motion: "straight",
      }),
    ],
  }),
  "bastion-prime": {
    id: "bastion-prime",
    name: "BASTION PRIME",
    rank: "boss",
    maxHp: 420,
    element: "none",
    movement: "stationary",
    defense: "guard",
    actions: [
      action({
        id: "bastion-lane-cannon",
        name: "横一列砲撃",
        pattern: "bastion-prime",
        kind: "projectile",
        target: "row",
        damage: 30,
        startupMs: 1080,
        counterWindowMs: 150,
        recoveryMs: 520,
        cooldownMs: 1500,
        motion: "straight",
      }),
      action({
        id: "bastion-shield-bash",
        name: "盾打ち",
        pattern: "bastion-prime",
        kind: "melee",
        target: "adjacent",
        damage: 42,
        startupMs: 820,
        counterWindowMs: 130,
        recoveryMs: 580,
        cooldownMs: 1700,
      }),
      action({
        id: "bastion-obstacle-deploy",
        name: "障害物展開",
        pattern: "bastion-prime",
        kind: "field",
        target: "player",
        damage: 0,
        startupMs: 900,
        counterWindowMs: 120,
        recoveryMs: 500,
        cooldownMs: 1500,
        objectKind: "cube",
        objectHp: 100,
        objectLifetimeMs: null,
      }),
      action({
        id: "bastion-territory-siege",
        name: "陣地奪取砲",
        pattern: "bastion-prime",
        kind: "field",
        target: "player-territory",
        damage: 18,
        startupMs: 1150,
        counterWindowMs: 150,
        recoveryMs: 600,
        cooldownMs: 1900,
        objectKind: "field-device",
        objectLifetimeMs: 10000,
      }),
      action({
        id: "bastion-open-barrage",
        name: "連続砲撃",
        pattern: "bastion-prime",
        kind: "projectile",
        target: "row",
        damage: 26,
        startupMs: 1000,
        counterWindowMs: 180,
        recoveryMs: 700,
        cooldownMs: 1700,
        motion: "straight",
        projectileCount: 3,
        projectileIntervalMs: 150,
      }),
    ],
    phases: [
      {
        phase: 1,
        label: "盾砲段階",
        maxHpRatio: 1,
        actionIds: ["bastion-lane-cannon", "bastion-shield-bash"],
        defense: "guard",
      },
      {
        phase: 2,
        label: "要塞展開",
        maxHpRatio: 0.7,
        actionIds: ["bastion-obstacle-deploy", "bastion-territory-siege"],
        defense: "guard",
      },
      {
        phase: 3,
        label: "盾開放砲撃",
        maxHpRatio: 0.4,
        actionIds: ["bastion-open-barrage", "bastion-territory-siege"],
        defense: "guard",
      },
    ],
  },
  "prism-hunter": {
    id: "prism-hunter",
    name: "PRISM HUNTER",
    rank: "boss",
    maxHp: 380,
    element: "none",
    movement: "pursuit",
    defense: "none",
    actions: [
      action({
        id: "prism-teleport-cut",
        name: "転送斬",
        pattern: "prism-hunter",
        kind: "melee",
        target: "adjacent",
        damage: 38,
        startupMs: 760,
        counterWindowMs: 120,
        recoveryMs: 460,
        cooldownMs: 1100,
      }),
      action({
        id: "prism-front-cut",
        name: "前方二マス斬り",
        pattern: "prism-hunter",
        kind: "melee",
        target: "adjacent",
        damage: 32,
        startupMs: 620,
        counterWindowMs: 110,
        recoveryMs: 420,
        cooldownMs: 950,
      }),
      action({
        id: "prism-cross-cut",
        name: "十字斬",
        pattern: "prism-hunter",
        kind: "melee",
        target: "cross",
        damage: 28,
        startupMs: 850,
        counterWindowMs: 140,
        recoveryMs: 500,
        cooldownMs: 1250,
      }),
      action({
        id: "prism-triple-cut",
        name: "三段斬り",
        pattern: "prism-hunter",
        kind: "melee",
        target: "cross",
        damage: 24,
        startupMs: 980,
        counterWindowMs: 160,
        activeMs: 180,
        recoveryMs: 650,
        cooldownMs: 1650,
        hitCount: 3,
      }),
    ],
    phases: [
      {
        phase: 1,
        label: "高速転送段階",
        maxHpRatio: 1,
        actionIds: ["prism-teleport-cut", "prism-front-cut", "prism-cross-cut"],
      },
      {
        phase: 2,
        label: "三段攻撃段階",
        maxHpRatio: 0.4,
        actionIds: ["prism-triple-cut", "prism-front-cut", "prism-cross-cut"],
      },
    ],
  },
  "climate-engine": {
    id: "climate-engine",
    name: "CLIMATE ENGINE",
    rank: "boss",
    maxHp: 400,
    element: "none",
    movement: "stationary",
    defense: "none",
    weakness: "water",
    actions: [
      action({
        id: "climate-firefront",
        name: "炎気流",
        pattern: "climate-engine",
        kind: "projectile",
        target: "row",
        damage: 28,
        startupMs: 850,
        counterWindowMs: 130,
        recoveryMs: 450,
        cooldownMs: 1200,
        motion: "straight",
        element: "fire",
        weaknessElement: "wood",
        panelTerrain: "lava",
      }),
      action({
        id: "climate-waterfront",
        name: "氷水流",
        pattern: "climate-engine",
        kind: "projectile",
        target: "all-rows",
        damage: 25,
        startupMs: 900,
        counterWindowMs: 140,
        recoveryMs: 500,
        cooldownMs: 1350,
        motion: "wave",
        element: "water",
        weaknessElement: "fire",
        panelTerrain: "ice",
      }),
      action({
        id: "climate-electric-pulse",
        name: "電磁列",
        pattern: "climate-engine",
        kind: "projectile",
        target: "column",
        damage: 30,
        startupMs: 960,
        counterWindowMs: 150,
        recoveryMs: 520,
        cooldownMs: 1450,
        motion: "thrown",
        element: "electric",
        weaknessElement: "water",
        status: "stun",
        statusDurationMs: 500,
      }),
      action({
        id: "climate-wood-root",
        name: "根の奔流",
        pattern: "climate-engine",
        kind: "projectile",
        target: "player",
        damage: 28,
        startupMs: 920,
        counterWindowMs: 130,
        recoveryMs: 460,
        cooldownMs: 1400,
        motion: "homing",
        element: "wood",
        weaknessElement: "electric",
        status: "root",
        statusDurationMs: 900,
      }),
      action({
        id: "climate-dual-storm",
        name: "複合気象",
        pattern: "climate-engine",
        kind: "projectile",
        target: "all-rows",
        damage: 22,
        startupMs: 1200,
        counterWindowMs: 180,
        activeMs: 180,
        recoveryMs: 680,
        cooldownMs: 1900,
        motion: "wave",
        element: "electric",
        weaknessElement: "water",
        panelTerrain: "ice",
        projectileCount: 2,
        projectileIntervalMs: 180,
      }),
    ],
    phases: [
      {
        phase: 1,
        label: "単一気象段階",
        maxHpRatio: 1,
        actionIds: [
          "climate-firefront",
          "climate-waterfront",
          "climate-electric-pulse",
          "climate-wood-root",
        ],
        weaknessElement: "water",
      },
      {
        phase: 2,
        label: "複合気象段階",
        maxHpRatio: 0.5,
        actionIds: [
          "climate-firefront",
          "climate-waterfront",
          "climate-electric-pulse",
          "climate-wood-root",
          "climate-dual-storm",
        ],
        weaknessElement: "electric",
      },
    ],
  },
  "core-arbiter": {
    id: "core-arbiter",
    name: "CORE ARBITER",
    rank: "boss",
    maxHp: 480,
    element: "none",
    movement: "pursuit",
    defense: "none",
    actions: [
      action({
        id: "arbiter-tracking-shot",
        name: "追尾裁定弾",
        pattern: "core-arbiter",
        kind: "projectile",
        target: "player",
        damage: 22,
        startupMs: 850,
        counterWindowMs: 130,
        recoveryMs: 430,
        cooldownMs: 1200,
        motion: "homing",
      }),
      action({
        id: "arbiter-stake-field",
        name: "拘束フィールド",
        pattern: "core-arbiter",
        kind: "field",
        target: "landing",
        damage: 26,
        startupMs: 900,
        counterWindowMs: 140,
        recoveryMs: 500,
        cooldownMs: 1450,
        objectKind: "mine",
        objectHp: 40,
        objectLifetimeMs: 4500,
      }),
      action({
        id: "arbiter-close-cut",
        name: "接近断",
        pattern: "core-arbiter",
        kind: "melee",
        target: "adjacent",
        damage: 38,
        startupMs: 780,
        counterWindowMs: 120,
        recoveryMs: 500,
        cooldownMs: 1300,
      }),
      action({
        id: "arbiter-territory-take",
        name: "区画裁定",
        pattern: "core-arbiter",
        kind: "field",
        target: "player-territory",
        damage: 16,
        startupMs: 1050,
        counterWindowMs: 150,
        recoveryMs: 560,
        cooldownMs: 1700,
        objectKind: "field-device",
        objectLifetimeMs: 7000,
      }),
      action({
        id: "arbiter-orbit-mine",
        name: "周回追尾弾",
        pattern: "core-arbiter",
        kind: "projectile",
        target: "outer",
        damage: 20,
        startupMs: 1000,
        counterWindowMs: 160,
        recoveryMs: 580,
        cooldownMs: 1600,
        motion: "orbit",
        continuesAfterHit: true,
      }),
    ],
    phases: [
      {
        phase: 1,
        label: "追尾裁定段階",
        maxHpRatio: 1,
        actionIds: ["arbiter-tracking-shot", "arbiter-stake-field"],
      },
      {
        phase: 2,
        label: "接近裁定段階",
        maxHpRatio: 0.7,
        actionIds: [
          "arbiter-tracking-shot",
          "arbiter-close-cut",
          "arbiter-territory-take",
        ],
      },
      {
        phase: 3,
        label: "複合裁定段階",
        maxHpRatio: 0.4,
        actionIds: [
          "arbiter-orbit-mine",
          "arbiter-close-cut",
          "arbiter-territory-take",
        ],
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

export const PR11_NORMAL_ENEMY_IDS: readonly EnemyId[] = [
  "wave-runner",
  "boomer-arc",
  "hopper-bomb",
  "gaia-hammer",
  "weather-core",
  "support-relay",
  "mirror-node",
];

export const BOSS_ENEMY_IDS: readonly EnemyId[] = [
  "bastion-prime",
  "prism-hunter",
  "climate-engine",
  "core-arbiter",
];

export const ALL_ENEMY_IDS: readonly EnemyId[] = [
  ...PR10_ENEMY_IDS,
  ...PR11_NORMAL_ENEMY_IDS,
  ...BOSS_ENEMY_IDS,
];

export function getEnemyDefinition(id: string): EnemyDefinition | undefined {
  if (!Object.prototype.hasOwnProperty.call(ENEMY_DEFINITIONS, id)) return undefined;
  return ENEMY_DEFINITIONS[id as EnemyId];
}

export function isBossEnemy(id: string): boolean {
  return BOSS_ENEMY_IDS.includes(id as (typeof BOSS_ENEMY_IDS)[number]);
}
