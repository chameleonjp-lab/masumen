import {
  ENEMY_DEFINITIONS,
  type EnemyActionDefinition,
  type EnemyDefinition,
  type EnemyId,
  type EnemyPhaseDefinition,
} from "../data/enemies";
import type {
  CardElement,
  EnemyDefenseMode,
  EnemyMovementMode,
  GridPosition,
  PanelTerrain,
} from "../types";

/**
 * P1-10 GameWorld神クラスの初回分割。
 *
 * 再現手順: 敵の段階判定や行動選択を変更すると、GameWorld内の戦闘更新・
 * カード処理・描画用スナップショットまで同時に確認する必要がある。
 * 期待仕様: 敵の段階・行動選択ルールを独立してテストでき、既存の戦闘結果は変えない。
 * 現状コード位置: これまでは GameWorld.ts の phaseForEnemy / chooseEnemyAction などに集中していた。
 * 修正方針: 敵の段階・行動選択・警告対象マスを systems/EnemySystem.ts へ移し、
 * GameWorld には盤面参照を渡す配線と、既存の戦闘状態機械・イベント処理を残す。
 * 追加テスト: EnemySystem.test.ts で段階遷移、行動ローテーション、地形優先、
 * 複合行動、行・列・十字・特殊対象マスを固定する。
 */

export interface EnemyRuleState {
  definitionId: EnemyId;
  hp: number;
  maxHp: number;
  actionId: string | null;
  actionIndex: number;
  cycle: number;
  bossPhase: number;
  bossPhaseLabel: string | null;
  defense: EnemyDefenseMode;
  movement: EnemyMovementMode;
  weaknessElement: CardElement;
  baseDefense: EnemyDefenseMode;
  baseMovement: EnemyMovementMode;
}

export interface EnemyPhaseUpdate {
  phase: EnemyPhaseDefinition | undefined;
  changed: boolean;
}

export interface EnemyTargetRuleState {
  grid: GridPosition;
  cycle: number;
}

export interface EnemyTargetContext {
  player: GridPosition;
  playerTiles: readonly GridPosition[];
  isInside: (position: GridPosition) => boolean;
  findSupportTarget: () => GridPosition;
  findHopperLanding: () => GridPosition;
  findObjectPlacement: () => GridPosition;
  findMinePlacement: () => GridPosition;
}

function sameTile(a: GridPosition, b: GridPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

function uniqueTiles(tiles: GridPosition[]): GridPosition[] {
  return tiles.filter(
    (tile, index) => tiles.findIndex(other => sameTile(other, tile)) === index
  );
}

function definitionFor(
  definitionId: EnemyId,
  definitions: Readonly<Record<EnemyId, EnemyDefinition>>
): EnemyDefinition | undefined {
  return definitions[definitionId];
}

export function currentEnemyAction(
  enemy: Pick<EnemyRuleState, "definitionId" | "actionId">,
  definitions: Readonly<Record<EnemyId, EnemyDefinition>> = ENEMY_DEFINITIONS
): EnemyActionDefinition | undefined {
  return definitionFor(enemy.definitionId, definitions)?.actions.find(
    action => action.id === enemy.actionId
  );
}

export function enemyPhaseFor(
  enemy: Pick<EnemyRuleState, "definitionId" | "hp" | "maxHp">,
  definitions: Readonly<Record<EnemyId, EnemyDefinition>> = ENEMY_DEFINITIONS
): EnemyPhaseDefinition | undefined {
  const phases = definitionFor(enemy.definitionId, definitions)?.phases;
  if (!phases || phases.length === 0) return undefined;
  const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
  return (
    [...phases]
      .sort((a, b) => a.maxHpRatio - b.maxHpRatio)
      .find(phase => ratio <= phase.maxHpRatio) ?? phases[0]
  );
}

export function applyEnemyPhase(
  enemy: EnemyRuleState,
  definitions: Readonly<Record<EnemyId, EnemyDefinition>> = ENEMY_DEFINITIONS
): EnemyPhaseUpdate {
  const definition = definitionFor(enemy.definitionId, definitions);
  const phase = enemyPhaseFor(enemy, definitions);
  if (!definition || !phase) {
    enemy.bossPhase = 0;
    enemy.bossPhaseLabel = null;
    enemy.defense = enemy.baseDefense;
    enemy.movement = enemy.baseMovement;
    enemy.weaknessElement =
      definition?.weakness ?? definition?.element ?? "none";
    return { phase: undefined, changed: false };
  }

  const changed = enemy.bossPhase !== phase.phase;
  enemy.bossPhase = phase.phase;
  enemy.bossPhaseLabel = phase.label;
  enemy.defense = phase.defense ?? enemy.baseDefense;
  enemy.movement = phase.movement ?? enemy.baseMovement;
  enemy.weaknessElement =
    phase.weaknessElement ?? definition.weakness ?? definition.element;
  if (changed) enemy.actionIndex = 0;
  return { phase, changed };
}

export function availableEnemyActions(
  enemy: Pick<EnemyRuleState, "definitionId" | "hp" | "maxHp">,
  definitions: Readonly<Record<EnemyId, EnemyDefinition>> = ENEMY_DEFINITIONS
): EnemyActionDefinition[] {
  const definition = definitionFor(enemy.definitionId, definitions);
  if (!definition) return [];
  const phase = enemyPhaseFor(enemy, definitions);
  if (!phase) return [...definition.actions];
  const actions = phase.actionIds
    .map(actionId => definition.actions.find(action => action.id === actionId))
    .filter((action): action is EnemyActionDefinition => Boolean(action));
  return actions.length > 0 ? actions : [...definition.actions];
}

export function chooseEnemyAction(
  enemy: EnemyRuleState,
  actions: readonly EnemyActionDefinition[],
  context: { playerTerrain?: PanelTerrain | null } = {}
): EnemyActionDefinition | undefined {
  if (actions.length === 0) return undefined;
  const phase = enemyPhaseFor(enemy);
  let action = actions[enemy.actionIndex % actions.length] ?? actions[0];
  const preferredElement =
    context.playerTerrain === "grass"
      ? "fire"
      : context.playerTerrain === "ice"
        ? "electric"
        : null;

  if (
    (enemy.definitionId === "weather-core" ||
      enemy.definitionId === "climate-engine") &&
    preferredElement
  ) {
    action =
      actions.find(candidate => candidate.element === preferredElement) ??
      action;
  }
  if (
    enemy.definitionId === "climate-engine" &&
    phase?.phase === 2 &&
    (enemy.cycle + 1) % 3 === 0
  ) {
    action =
      actions.find(candidate => candidate.id === "climate-dual-storm") ??
      action;
  }
  if (actions.length > 1 && action.id === enemy.actionId) {
    const nextIndex = (actions.indexOf(action) + 1) % actions.length;
    action = actions[nextIndex] ?? action;
  }
  const selectedIndex = Math.max(0, actions.indexOf(action));
  enemy.actionIndex = (selectedIndex + 1) % actions.length;
  return action;
}

export function resolveEnemyTargets(
  enemy: EnemyTargetRuleState,
  action: Pick<EnemyActionDefinition, "id" | "target">,
  context: EnemyTargetContext
): GridPosition[] {
  const player = { ...context.player };
  if (action.target === "support") {
    return [{ ...context.findSupportTarget() }];
  }
  if (action.id === "hopper-jump-land") {
    return [{ ...context.findHopperLanding() }];
  }
  if (
    action.id === "hopper-bomb-drop" ||
    action.id === "bastion-obstacle-deploy" ||
    action.id === "arbiter-stake-field"
  ) {
    return [{ ...context.findObjectPlacement() }];
  }
  switch (action.target) {
    case "row":
      return [0, 1, 2].map(col => ({ col, row: player.row }));
    case "column":
      return [0, 1, 2].map(row => ({ col: player.col, row }));
    case "player":
    case "adjacent":
    case "mine":
      return [
        action.target === "mine" ? { ...context.findMinePlacement() } : player,
      ];
    case "cross":
      return uniqueTiles([
        player,
        { col: player.col - 1, row: player.row },
        { col: player.col + 1, row: player.row },
        { col: player.col, row: player.row - 1 },
        { col: player.col, row: player.row + 1 },
      ]).filter(tile => context.isInside(tile));
    case "spread":
      return uniqueTiles([
        player,
        { col: player.col, row: player.row - 1 },
        { col: player.col, row: player.row + 1 },
      ]).filter(tile => context.isInside(tile));
    case "alternating":
      return context.playerTiles
        .filter(tile => (tile.col + tile.row + enemy.cycle) % 2 === 0)
        .map(tile => ({ ...tile }));
    case "all-rows":
      return context.playerTiles
        .map(tile => ({ ...tile }))
        .concat([3, 4, 5].flatMap(col => [0, 1, 2].map(row => ({ col, row }))));
    case "outer":
      return [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 2, row: 0 },
        { col: 3, row: 0 },
        { col: 4, row: 0 },
        { col: 5, row: 0 },
        { col: 5, row: 1 },
        { col: 5, row: 2 },
        { col: 4, row: 2 },
        { col: 3, row: 2 },
        { col: 2, row: 2 },
        { col: 1, row: 2 },
        { col: 0, row: 2 },
        { col: 0, row: 1 },
      ];
    case "landing":
      return [player];
    case "mirror":
      return [{ ...enemy.grid }];
    case "player-territory":
      return [0, 1, 2].flatMap(col => [0, 1, 2].map(row => ({ col, row })));
    default:
      return [player];
  }
}
