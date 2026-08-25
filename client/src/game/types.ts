/** Signal Relay Tactical game vocabulary: state is explicit so the terminal HUD mirrors the arena without hidden rules. */
export type BattleMode = "custom" | "battle" | "intermission" | "result";
export type EnemyState = "idle" | "windup" | "recover" | "stunned" | "deleted";
export type CardTier = "standard" | "mega";
export type ConnectionCode =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "*"
  | "M"
  | "S"
  | "X";
export type FolderCardClass = "standard" | "upper" | "trump" | "overload";
export type CardFamily =
  | "射撃"
  | "範囲"
  | "属性"
  | "近接"
  | "設置"
  | "地形"
  | "防御"
  | "反撃"
  | "回復"
  | "補助"
  | "高出力";
export type TargetShape =
  | "front"
  | "near"
  | "row"
  | "column"
  | "cross"
  | "enemy-field"
  | "self";
export type CardStatus =
  | "burn"
  | "stun"
  | "root"
  | "slow"
  | "barrier"
  | "invincible"
  | "recover"
  | "boost"
  | "gauge"
  | "counter";
export type ProjectileMotion =
  | "straight"
  | "piercing"
  | "wave"
  | "thrown"
  | "homing"
  | "reflect"
  | "orbit";
export interface AttackTiming {
  startupMs: number;
  counterStartMs: number | null;
  counterEndMs: number | null;
  activeMs: number;
  recoveryMs: number;
}
export interface GridPosition {
  col: number;
  row: number;
}
export type PanelOwner = "player" | "enemy" | "neutral";
export type PanelTerrain =
  | "normal"
  | "cracked"
  | "hole"
  | "grass"
  | "ice"
  | "lava"
  | "poison"
  | "holy";
export interface PanelState {
  col: number;
  row: number;
  owner: PanelOwner;
  terrain: PanelTerrain;
  occupantId: string | null;
  objectId: string | null;
  expiresAt: number | null;
}
export type FieldObjectKind =
  | "bomb"
  | "mine"
  | "turret"
  | "cube"
  | "stake"
  | "field-device";
export type ObjectTrigger =
  | "timer"
  | "contact"
  | "enemy-contact"
  | "damage"
  | "none";
export interface FieldObject {
  id: string;
  owner: "player" | "enemy";
  kind: FieldObjectKind;
  panel: GridPosition;
  hp: number;
  expiresAt: number | null;
  collision: "solid" | "passable";
  trigger: ObjectTrigger;
}
export interface ProjectileState {
  id: string;
  owner: "player" | "enemy";
  motion: ProjectileMotion;
  position: GridPosition;
  direction: GridPosition;
  origin: GridPosition;
  target: GridPosition | null;
  damage: number;
  sourceId: string | null;
  sourceCardId: string | null;
  charged: boolean;
  activeAt: number;
  expiresAt: number;
  speedCellsPerSecond: number;
  travelProgress: number;
  flightMs: number;
  bouncesRemaining: number;
  rowSpan: boolean;
  splashRadius: number;
  stopOnObject: boolean;
  hitTargets: string[];
  hitObjects: string[];
}
export interface Card {
  id: string;
  name: string;
  code: string;
  tier: CardTier;
  folderClass?: FolderCardClass;
  allowedCodes?: ConnectionCode[];
  instanceId?: string;
  selectedCode?: ConnectionCode;
  family: CardFamily;
  target: TargetShape;
  power: number;
  description: string;
  status?: CardStatus;
  effectValue?: number;
  durationMs?: number;
}
export interface EnemySnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  grid: GridPosition;
  state: EnemyState;
  pattern: string;
}
export interface BattleSnapshot {
  mode: BattleMode;
  playerHp: number;
  playerMaxHp: number;
  playerGrid: GridPosition;
  gauge: number;
  sync: boolean;
  charging: number;
  barrier: number;
  invincible: boolean;
  invincibleRemaining: number;
  customHand: Card[];
  selected: number[];
  focusedCard: number | null;
  selectionError: string | null;
  queue: Card[];
  enemies: EnemySnapshot[];
  panels: PanelState[];
  objects: FieldObject[];
  projectiles: ProjectileState[];
  message: string;
  elapsed: number;
  counters: number;
  rank: string;
  wave: number;
  score: number;
  highScore: number;
  bestWave: number;
  paused: boolean;
  customRemaining: number;
}
export type BattleEvent =
  | { type: "attack"; charged: boolean }
  | {
      type: "projectile";
      from: GridPosition;
      to: GridPosition;
      side: "player" | "enemy";
      charged?: boolean;
      id?: string;
      motion?: ProjectileMotion;
    }
  | {
      type: "card";
      cardId: string;
      at: GridPosition;
      tiles: GridPosition[];
      family: CardFamily;
      tier: CardTier;
      target: TargetShape;
      status?: CardStatus;
    }
  | { type: "hitstop"; duration: number; tier: CardTier }
  | { type: "warning"; at: GridPosition; enabled: boolean }
  | { type: "counter"; at: GridPosition }
  | {
      type: "impact";
      at: GridPosition;
      side: "player" | "enemy";
      enemyId?: string;
      cardId?: string;
      damage?: number;
      status?: CardStatus;
      charged?: boolean;
      counter?: boolean;
    }
  | {
      type: "player-reaction";
      at: GridPosition;
      kind: "damage" | "barrier" | "phase" | "counter" | "dodge";
      enemyId?: string;
      damage?: number;
    }
  | { type: "deleted"; id: string; at: GridPosition };
export interface GameController {
  move: (dx: number, dy: number) => void;
  fire: () => void;
  startCharge: () => void;
  releaseCharge: () => void;
  useSkill: () => void;
  cancelCharge: () => void;
  openCustom: () => void;
  toggleCard: (index: number) => void;
  confirmCustom: () => void;
  reloadFolder?: () => void;
  nextWave: () => void;
  restart: () => void;
  togglePause: () => void;
  setSoundEnabled?: (enabled: boolean) => void;
  setSoundVolume?: (volume: number) => void;
  setVibrationEnabled?: (enabled: boolean) => void;
}
export interface GameHandle {
  scene: import("@babylonjs/core/scene").Scene;
  controller: GameController;
  dispose: () => void;
}
