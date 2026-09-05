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
  PanelTerrain,
} from "../types";

/**
 * P1-10 GameWorld神クラスの初回分割。
 *
 * 再現手順: 敵の段階判定や行動選択を変更すると、GameWorld内の戦闘更新・
 * カード処理・描画用スナップショットまで同時に確認する必要がある。
 * 期待仕様: 敵の段階・行動選択ルールを独立してテストでき、既存の戦闘結果は変えない。
 * 現状コード位置: これまでは GameWorld.ts の phaseForEnemy / chooseEnemyAction などに集中していた。
 * 修正方針: まず純粋な敵ルールと状態更新だけを systems/EnemySystem.ts へ移し、
 * GameWorld には既存の戦闘状態機械とイベント配線を残す。
 * 追加テスト: EnemySystem.test.ts で段階遷移、行動ローテーション、地形優先、複合行動を固定する。
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
  return [...phases]
    .sort((a, b) => a.maxHpRatio - b.maxHpRatio)
    .find(phase => ratio <= phase.maxHpRatio) ?? phases[0];
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
    .map(actionId =>
      definition.actions.find(action => action.id === actionId)
    )
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
