import {
  ENEMY_DEFINITIONS,
  type EnemyActionDefinition,
  type EnemyDefinition,
  type EnemyId,
  type EnemyPhaseDefinition,
} from "../data/enemies";
import type {
  CardElement,
  EnemyActionPhase,
  EnemyDefenseMode,
  EnemyMovementMode,
  EnemyState,
  GridPosition,
  PanelTerrain,
  EnemyWarningStage,
} from "../types";
import { createCounterWindow, type CounterWindow } from "./CounterSystem";
import type { ProjectileSpawn } from "./ProjectileSystem";
import { warningProgress, warningStage } from "./WarningSystem";

/**
 * P1-10 GameWorld神クラスの初回分割。
 *
 * 再現手順: 敵の段階判定や行動選択を変更すると、GameWorld内の戦闘更新・
 * カード処理・描画用スナップショットまで同時に確認する必要がある。
 * 期待仕様: 敵の段階・行動選択ルールを独立してテストでき、既存の戦闘結果は変えない。
 * 現状コード位置: これまでは GameWorld.ts の phaseForEnemy / chooseEnemyAction などに集中していた。
 * 修正方針: 敵の段階・行動選択・攻撃準備・警告対象マスを systems/EnemySystem.ts へ移し、
 * GameWorld には盤面参照を渡す配線と、既存の戦闘状態機械・イベント処理を残す。
 * 追加テスト: EnemySystem.test.ts で段階遷移、行動ローテーション、地形優先、
 * 複合行動、攻撃準備の速度補正・予兆・カウンター時刻、行・列・十字・特殊対象マスを固定する。
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

export interface EnemyAttackPreparationContext {
  actions: readonly EnemyActionDefinition[];
  now: number;
  slowExtraMs: number;
  counterEndMarginMs: number;
  playerTerrain?: PanelTerrain | null;
}

export interface EnemyAttackPreparation {
  action: EnemyActionDefinition;
  windupUntil: number;
  counterWindowState: CounterWindow;
  warningAt: number;
}

export interface EnemyAttackStartRuleState extends EnemyRuleState {
  state: EnemyState;
  actionPhase: EnemyActionPhase;
  actionName: string | null;
  pattern: string;
  attackDamage: number;
  windupMs: number;
  cooldownMs: number;
  counterWindowMs: number;
  lockedTargets: GridPosition[];
  windupUntil: number;
  activeUntil: number;
  recoverUntil: number;
  attackStartedAt: number;
  counterWindowState: CounterWindow | null;
  counterStartAt: number | null;
  counterEndAt: number | null;
  warningAt: number;
  warningShown: boolean;
  warningStage: EnemyWarningStage | null;
  warningStartedAt: number;
  rootUntil: number;
}

export interface EnemyAttackStartContext extends EnemyAttackPreparationContext {
  phase?: EnemyPhaseDefinition;
  movePursuit: () => void;
  resolveTargets: (action: EnemyActionDefinition) => readonly GridPosition[];
  definitions?: Readonly<Record<EnemyId, EnemyDefinition>>;
}

export interface EnemyProjectilePlanContext {
  now: number;
  targets: readonly GridPosition[];
  lockedTarget: GridPosition;
  lockedRow: number;
  lockedColumn: number;
  thrownFlightMs: number;
  isInside: (position: GridPosition) => boolean;
}

export interface EnemyProjectileSpawnOptions {
  motion: ProjectileSpawn["motion"];
  position?: GridPosition;
  direction?: GridPosition;
  target?: GridPosition | null;
  continuesAfterHit?: boolean;
  expiresAt?: number;
  speedCellsPerSecond?: number;
  flightMs?: number;
  rowSpan?: boolean;
  stopOnObject?: boolean;
}

export interface EnemyProjectilePlan {
  delayMs: number;
  options: EnemyProjectileSpawnOptions;
}

export interface EnemyActionCompletionRuleState {
  state: EnemyState;
  actionPhase: EnemyActionPhase;
  lockedTargets: GridPosition[];
  activeUntil: number;
  recoverUntil: number;
  warningShown: boolean;
  warningStage: EnemyWarningStage | null;
  warningStartedAt: number;
}

export interface EnemyWarningRuleState {
  warningAt: number;
  windupUntil: number;
  warningShown: boolean;
  warningStartedAt: number;
  warningStage: EnemyWarningStage | null;
}

export interface EnemyWarningUpdate {
  started: boolean;
  stage: EnemyWarningStage | null;
}

export interface EnemyRepositionRuleState {
  grid: GridPosition;
  movement: EnemyMovementMode;
  cycle: number;
}

export interface EnemyRepositionContext {
  player: GridPosition;
  canOccupy: (position: GridPosition) => boolean;
  resolveMovement: (
    start: GridPosition,
    direction: GridPosition,
    flying: boolean
  ) => GridPosition | null;
}

export interface EnemyLifecycleRuleState {
  state: EnemyState;
  actionPhase: EnemyActionPhase;
  stunnedUntil: number;
  windupUntil: number;
  activeUntil: number;
  recoverUntil: number;
  nextAttackAt: number;
}

export interface EnemyLifecycleContext {
  counterWindowOpen: boolean;
  stunnedRecoveryMs?: number;
}

export type EnemyLifecycleBoundary =
  | "none"
  | "execute"
  | "reposition"
  | "prepare";

const OUTER_ROUTE: readonly GridPosition[] = [
  { col: 3, row: 0 },
  { col: 4, row: 0 },
  { col: 5, row: 0 },
  { col: 5, row: 1 },
  { col: 5, row: 2 },
  { col: 4, row: 2 },
  { col: 3, row: 2 },
];

const REPOSITION_DIRECTIONS: readonly GridPosition[] = [
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: -1, row: 0 },
  { col: 1, row: 0 },
];

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

export function prepareEnemyAttack(
  enemy: EnemyRuleState,
  context: EnemyAttackPreparationContext
): EnemyAttackPreparation | undefined {
  const action = chooseEnemyAction(enemy, context.actions, {
    playerTerrain: context.playerTerrain,
  });
  if (!action) return undefined;

  enemy.cycle += 1;
  enemy.actionId = action.id;
  const windupUntil =
    context.now + action.startupMs + Math.max(0, context.slowExtraMs);
  return {
    action,
    windupUntil,
    counterWindowState: createCounterWindow(
      context.now,
      windupUntil,
      action.counterWindowMs,
      context.counterEndMarginMs
    ),
    warningAt: context.now + (action.warningDelayMs ?? 0),
  };
}

/**
 * P1-10 implementation slice: enemy attack preparation state.
 * 再現手順: 敵の攻撃準備で行動情報、移動、対象固定、予兆時刻の更新を別々に変更する。
 * 期待仕様: 行動選択後に既存順序のまま、踏み込み、対象固定、予兆・回復境界を登録する。
 * 現状コード位置: 変更前は GameWorld.ts の prepareAttack() に集中していた。
 * 修正方針: EnemySystem が準備状態の登録を担当し、盤面移動と対象解決だけを注入関数へ委譲する。
 * 追加テスト: slow補正、pursuit移動と対象解決の順序、固定対象、各時刻境界を単体検査する。
 */
export function startEnemyAttack(
  enemy: EnemyAttackStartRuleState,
  context: EnemyAttackStartContext
): EnemyAttackPreparation | undefined {
  const definition = definitionFor(
    enemy.definitionId,
    context.definitions ?? ENEMY_DEFINITIONS
  );
  if (!definition) return undefined;

  const preparation = prepareEnemyAttack(enemy, context);
  if (!preparation) return undefined;

  const { action } = preparation;
  enemy.actionName = action.name;
  enemy.pattern = action.pattern;
  enemy.attackDamage = action.damage;
  enemy.windupMs = action.startupMs;
  enemy.cooldownMs = action.cooldownMs;
  enemy.counterWindowMs = action.counterWindowMs;
  enemy.weaknessElement =
    action.weaknessElement ??
    context.phase?.weaknessElement ??
    definition.weakness ??
    definition.element;

  if (enemy.movement === "pursuit" && context.now >= enemy.rootUntil)
    context.movePursuit();

  enemy.lockedTargets = context.resolveTargets(action).map(target => ({
    ...target,
  }));
  enemy.state = "windup";
  enemy.actionPhase = "startup";
  enemy.windupUntil = preparation.windupUntil;
  enemy.activeUntil = enemy.windupUntil;
  enemy.recoverUntil = 0;
  enemy.attackStartedAt = context.now;
  enemy.counterWindowState = preparation.counterWindowState;
  enemy.counterStartAt = preparation.counterWindowState.startAt;
  enemy.counterEndAt = preparation.counterWindowState.endAt;
  enemy.warningAt = preparation.warningAt;
  enemy.warningShown = false;
  enemy.warningStage = null;
  enemy.warningStartedAt = 0;
  return preparation;
}

/**
 * P1-10 implementation slice: enemy projectile emission planning.
 * 再現手順: 敵弾の発射行、複数弾の遅延、飛行方式、周回寿命を GameWorld の
 * 行動分岐で個別に変更する。
 * 期待仕様: 予兆で固定した対象を使う敵弾の計画を一箇所で決め、GameWorld は
 * 既存 ProjectileSystem へ発射する配線だけを担当する。
 * 現状コード位置: 変更前は GameWorld.ts の executeEnemyAction() に、敵ごとの
 * 直進・投擲・追尾・波・周回の分岐が混在していた。
 * 修正方針: 副作用を持たない発射オプションと遅延だけを EnemySystem で組み立て、
 * 地形変更・模倣ダメージ・設置物などの固有副作用は既存の GameWorld に残す。
 * 追加テスト: 固定行、三点砲撃の範囲と遅延、周回弾の継続衝突・寿命、複合気象、
 * 模倣射撃のダメージ分岐を固定する。
 */
export function planEnemyProjectiles(
  action: EnemyActionDefinition,
  context: EnemyProjectilePlanContext
): EnemyProjectilePlan[] | undefined {
  const plan = (
    options: EnemyProjectileSpawnOptions,
    delayMs = 0
  ): EnemyProjectilePlan => ({
    delayMs,
    options,
  });

  if (action.id === "mirror-mimic-shot") return undefined;

  if (
    action.id === "bulwark-lane-cannon" ||
    action.id === "bastion-lane-cannon"
  ) {
    return [
      plan({
        motion: "straight",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: context.lockedRow },
      }),
    ];
  }

  if (action.id === "scanner-column-scan") {
    return [
      plan({
        motion: "thrown",
        target: {
          col: context.lockedColumn,
          row: context.lockedTarget.row,
        },
        rowSpan: true,
        flightMs: context.thrownFlightMs,
      }),
    ];
  }

  if (action.id === "scanner-signal-lock") {
    return [
      plan({
        motion: "homing",
        target: { ...context.lockedTarget },
        speedCellsPerSecond: 9,
      }),
    ];
  }

  if (action.id === "mortar-shell") {
    return [
      plan({
        motion: "thrown",
        target: { ...context.lockedTarget },
        flightMs: context.thrownFlightMs,
      }),
    ];
  }

  if (action.id === "mortar-triple-shell") {
    return context.targets
      .filter(context.isInside)
      .slice(0, action.projectileCount ?? 3)
      .map((target, index) =>
        plan(
          {
            motion: "thrown",
            target: { ...target },
            flightMs: context.thrownFlightMs,
          },
          index * (action.projectileIntervalMs ?? 110)
        )
      );
  }

  if (action.id === "sentinel-alternating-pulse") {
    return context.targets.map((target, index) =>
      plan(
        {
          motion: "thrown",
          target: { ...target },
          flightMs: context.thrownFlightMs,
        },
        index * 35
      )
    );
  }

  if (action.id === "sentinel-chain-bolt") {
    return [
      plan({
        motion: "homing",
        target: { ...context.lockedTarget },
        speedCellsPerSecond: 9,
      }),
    ];
  }

  if (
    action.id === "wave-runner-water-wave" ||
    action.id === "wave-runner-frost-surge"
  ) {
    return [
      plan({
        motion: "wave",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: context.lockedRow },
        rowSpan: true,
        stopOnObject: false,
      }),
    ];
  }

  if (
    action.id === "boomer-arc-outbound" ||
    action.id === "boomer-arc-return" ||
    action.id === "arbiter-orbit-mine"
  ) {
    return [
      plan({
        motion: "orbit",
        position: { col: 5, row: 0 },
        direction: { col: -1, row: 0 },
        target: null,
        continuesAfterHit: true,
        stopOnObject: false,
        expiresAt: context.now + 4200,
        speedCellsPerSecond: 8,
      }),
    ];
  }

  if (
    action.pattern === "weather-core" ||
    action.pattern === "climate-engine"
  ) {
    const plans: EnemyProjectilePlan[] = [];
    const count = Math.max(1, action.projectileCount ?? 1);
    for (let index = 0; index < count; index += 1) {
      const delayMs = index * (action.projectileIntervalMs ?? 0);
      if (action.motion === "wave") {
        plans.push(
          plan(
            {
              motion: "wave",
              direction: { col: -1, row: 0 },
              target: { col: 0, row: context.lockedRow },
              rowSpan: true,
              stopOnObject: false,
            },
            delayMs
          )
        );
      } else if (action.motion === "thrown") {
        plans.push(
          plan(
            {
              motion: "thrown",
              target: {
                col: context.lockedColumn,
                row: context.lockedTarget.row,
              },
              rowSpan: true,
              flightMs: context.thrownFlightMs,
            },
            delayMs
          )
        );
      } else if (action.motion === "homing") {
        plans.push(
          plan(
            {
              motion: "homing",
              target: { ...context.lockedTarget },
              speedCellsPerSecond: 8,
            },
            delayMs
          )
        );
      } else {
        plans.push(
          plan(
            {
              motion: "straight",
              direction: { col: -1, row: 0 },
              target: { col: 0, row: context.lockedRow },
            },
            delayMs
          )
        );
      }
    }
    return plans;
  }

  if (action.id === "support-relay-shot") {
    return [
      plan({
        motion: "straight",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: context.lockedRow },
      }),
    ];
  }

  if (action.id === "bastion-open-barrage") {
    const plans: EnemyProjectilePlan[] = [];
    for (let index = 0; index < (action.projectileCount ?? 3); index += 1) {
      plans.push(
        plan(
          {
            motion: "straight",
            direction: { col: -1, row: 0 },
            target: { col: 0, row: context.lockedRow },
          },
          index * (action.projectileIntervalMs ?? 150)
        )
      );
    }
    return plans;
  }

  if (action.id === "arbiter-tracking-shot") {
    return [
      plan({
        motion: "homing",
        target: { ...context.lockedTarget },
        speedCellsPerSecond: 8,
      }),
    ];
  }

  if (action.kind !== "projectile") return undefined;
  return [
    plan({
      motion: action.motion ?? "straight",
      target: { ...context.lockedTarget },
    }),
  ];
}

/**
 * P1-10 implementation slice: enemy action completion transition.
 * 再現手順: 敵弾の発射や近接判定を終えた後の発動時間、回復時間、予兆解除を
 * GameWorld の状態更新と個別に変更する。
 * 期待仕様: どの敵行動でも同じ順序で対象と予兆を解除し、発動時間から回復へ遷移する。
 * 現状コード位置: 変更前は GameWorld.ts の updateEnemy() に、行動実行直後の状態遷移があった。
 * 修正方針: 行動定義の activeMs / recoveryMs と現在時刻から、敵の回復境界を EnemySystem で登録する。
 * 追加テスト: 定義された発動・回復時間、既定時間、対象解除、予兆解除を単体検査する。
 */
export function completeEnemyAction(
  enemy: EnemyActionCompletionRuleState,
  action: Pick<EnemyActionDefinition, "activeMs" | "recoveryMs"> | undefined,
  now: number
): void {
  enemy.lockedTargets = [];
  enemy.state = "recover";
  enemy.actionPhase = "active";
  enemy.activeUntil = now + (action?.activeMs ?? 100);
  enemy.recoverUntil = enemy.activeUntil + (action?.recoveryMs ?? 430);
  enemy.warningShown = false;
  enemy.warningStage = null;
  enemy.warningStartedAt = 0;
}

export function updateEnemyWarning(
  enemy: EnemyWarningRuleState,
  now: number
): EnemyWarningUpdate {
  let started = false;
  if (
    !enemy.warningShown &&
    now >= enemy.warningAt &&
    now < enemy.windupUntil
  ) {
    enemy.warningShown = true;
    enemy.warningStartedAt = now;
    enemy.warningStage = "telegraph";
    started = true;
  }
  if (enemy.warningShown) {
    enemy.warningStage = warningStage(
      warningProgress(now, enemy.warningStartedAt, enemy.windupUntil)
    );
  }
  return { started, stage: enemy.warningStage };
}

/**
 * P1-10 implementation slice: enemy reposition rules.
 * 再現手順: 敵の回復後に移動モード、進行ルート、占有状態をまたいで変更する。
 * 期待仕様: stationary / outer / row-align / pursuit / ground / flying の移動先を
 * 既存順序で選び、盤面への反映は GameWorld が担当する。
 * 現状コード位置: 変更前は GameWorld.ts の reposition() と補助メソッドに分散。
 * 修正方針: 移動先選択だけを EnemySystem に移し、PanelSystem と占有判定は呼び出し側から注入する。
 * 追加テスト: 各移動モード、外周ルートのブロック、cycle 行選択、飛行フラグを固定する。
 */
export function chooseEnemyReposition(
  enemy: EnemyRepositionRuleState,
  context: EnemyRepositionContext
): GridPosition | null {
  if (enemy.movement === "stationary") return null;

  if (enemy.movement === "outer") {
    let index = OUTER_ROUTE.findIndex(tile => sameTile(tile, enemy.grid));
    if (index < 0) index = 0;
    for (let offset = 1; offset <= OUTER_ROUTE.length; offset += 1) {
      const destination = OUTER_ROUTE[(index + offset) % OUTER_ROUTE.length];
      if (destination && context.canOccupy(destination))
        return { ...destination };
    }
    return null;
  }

  if (enemy.movement === "row-align") {
    const destination = { col: enemy.grid.col, row: context.player.row };
    return context.canOccupy(destination) ? destination : null;
  }

  if (enemy.movement === "pursuit") {
    const destination = {
      col: 3,
      row: (context.player.row + enemy.cycle + 1) % 3,
    };
    return context.canOccupy(destination) ? destination : null;
  }

  const flying = enemy.movement === "flying";
  for (const direction of REPOSITION_DIRECTIONS) {
    const destination = context.resolveMovement(enemy.grid, direction, flying);
    if (destination && !sameTile(destination, enemy.grid))
      return { ...destination };
  }
  return null;
}

/**
 * P1-10 implementation slice: enemy lifecycle boundaries.
 * 再現手順: 待機・予兆・攻撃後・スタンの時刻境界を変更すると、GameWorldの
 * 状態更新、攻撃実行、再配置、次攻撃準備をまとめて確認する必要がある。
 * 期待仕様: 各状態の表示段階と境界だけを既存順序で判定し、副作用はGameWorldが行う。
 * 現状コード位置: 変更前は GameWorld.ts の updateEnemy() に集中していた。
 * 修正方針: 状態と時刻から次の境界を EnemySystem で判定し、GameWorld には実行配線を残す。
 * 追加テスト: 削除・スタン復帰、予兆中の反撃窓、攻撃実行、攻撃後の再配置、次攻撃準備を固定する。
 */
export function updateEnemyLifecycle(
  enemy: EnemyLifecycleRuleState,
  now: number,
  context: EnemyLifecycleContext
): EnemyLifecycleBoundary {
  if (enemy.state === "deleted") {
    enemy.actionPhase = "deleted";
    return "none";
  }

  if (enemy.state === "stunned") {
    enemy.actionPhase = "stunned";
    if (now >= enemy.stunnedUntil) {
      enemy.state = "recover";
      enemy.actionPhase = "recovery";
      enemy.activeUntil = now;
      enemy.recoverUntil = now + (context.stunnedRecoveryMs ?? 430);
    }
    return "none";
  }

  if (enemy.state === "windup") {
    enemy.actionPhase = context.counterWindowOpen
      ? "counter-window"
      : "startup";
    return now >= enemy.windupUntil ? "execute" : "none";
  }

  if (enemy.state === "recover") {
    if (now < enemy.activeUntil) {
      enemy.actionPhase = "active";
      return "none";
    }
    if (now < enemy.recoverUntil) {
      enemy.actionPhase = "recovery";
      return "none";
    }
    return "reposition";
  }

  enemy.actionPhase = "idle";
  return now >= enemy.nextAttackAt ? "prepare" : "none";
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
