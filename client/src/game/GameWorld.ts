/** Signal Relay Tactical core: Japanese battle-chip cards resolve through shared target shapes, status effects, and counter windows. */
import { validateSelection, CARD_CATALOG } from "./deck";
import { FixedStepClock } from "./core/FixedStepClock";
import { Random } from "./core/Random";
import { COMBAT_BALANCE } from "./data/balance";
import { OVERLOAD_CARDS } from "./data/overloadCards";
import {
  createChainCard,
  findChainTechnique,
  CHAIN_TECHNIQUES,
} from "./data/chainTechniques";
import {
  cardPlacementTarget,
  cardPreviewTiles,
  cardTransferTarget,
  getCardCombatProfile,
  getElementalMultiplier,
  nearestEnemyPosition,
} from "./data/cardCombatData";
import {
  activeFolder as getActiveFolder,
  BattleDeck,
  loadSaveData,
  saveSaveData,
  type SavedFolder,
} from "./folder";
import { ObjectSystem } from "./systems/ObjectSystem";
import { PanelSystem } from "./systems/PanelSystem";
import { createMeleePlan, getMeleeRange } from "./systems/AttackSystem";
import {
  createCounterWindow,
  isCounterWindowOpen,
  type CounterWindow,
} from "./systems/CounterSystem";
import { CustomSystem } from "./systems/CustomSystem";
import { EmotionSystem } from "./systems/EmotionSystem";
import { ProjectileSystem } from "./systems/ProjectileSystem";
import {
  warningProgress as getWarningProgress,
  warningRemainingMs as getWarningRemainingMs,
  warningStage as getWarningStage,
} from "./systems/WarningSystem";
import {
  calculateScoreTotal,
  createScoreBreakdown,
  enemyDefeatScore,
  rankForScore,
  scoreWaveCompletion,
} from "./systems/ScoreSystem";
import { getPracticeStage, PRACTICE_STAGES } from "./data/practice";
import {
  BOSS_ENEMY_IDS,
  ENEMY_DEFINITIONS,
  getEnemyDefinition,
  isBossEnemy,
  type EnemyActionDefinition,
  type EnemyId,
  type EnemyPattern,
  type EnemyPhaseDefinition,
} from "./data/enemies";
import {
  BOSS_SUPPORT_SPAWN,
  encounterHasSafeStart,
  getEncounterTemplates,
  type EncounterSpawn,
} from "./data/encounters";
import type {
  BattleEvent,
  BattleSnapshot,
  Card,
  CardElement,
  RunOutcome,
  ScoreBreakdown,
  WaveScoreSummary,
  CardStatus,
  EnemySnapshot,
  EnemyState,
  FieldObject,
  FieldObjectKind,
  GameController,
  GridPosition,
  ProjectileState,
  TargetShape,
} from "./types";

type Pattern = EnemyPattern;
interface Enemy extends EnemySnapshot {
  windupUntil: number;
  recoverUntil: number;
  stunnedUntil: number;
  nextAttackAt: number;
  attackDamage: number;
  windupMs: number;
  cooldownMs: number;
  lockedTargets: GridPosition[];
  cycle: number;
  burnUntil: number;
  nextBurnAt: number;
  slowUntil: number;
  rootUntil: number;
  attackStartedAt: number;
  counterStartAt: number | null;
  counterEndAt: number | null;
  counterWindowMs: number;
  counterWindowState: CounterWindow | null;
  nextTerrainDamageAt: number;
  definitionId: EnemyId;
  actionIndex: number;
  actionId: string | null;
  actionName: string | null;
  actionPhase: import("./types").EnemyActionPhase;
  activeUntil: number;
  warningAt: number;
  warningShown: boolean;
  warningStage: import("./types").EnemyWarningStage | null;
  warningStartedAt: number;
  defense: import("./types").EnemyDefenseMode;
  movement: import("./types").EnemyMovementMode;
  isBoss: boolean;
  bossPhase: number;
  bossPhaseLabel: string | null;
  weaknessElement: CardElement;
  barrier: number;
  baseDefense: import("./types").EnemyDefenseMode;
  baseMovement: import("./types").EnemyMovementMode;
  lastMirrorCardId: string | null;
}
interface PendingMeleeStage {
  activeAt: number;
  tiles: GridPosition[];
  damage: number;
  resolved: boolean;
  card?: Card;
}
interface PendingMelee {
  card: Card;
  stages: PendingMeleeStage[];
  dashTo: GridPosition | null;
  returnTo: GridPosition | null;
  recoveryAt: number;
  dashApplied: boolean;
}
interface PendingRepair {
  readyAt: number;
  amount: number;
}
interface PendingChainEffect {
  at: number;
  kind: "place-bomb" | "tree-prison";
  panel?: GridPosition;
  enemyIds?: string[];
  sourceCardId: string;
  damage: number;
}
interface OverdrivePrompt {
  enemyId: string | null;
  target: GridPosition;
  step: number;
  expiresAt: number;
  damageMultiplier: number;
}
interface FieldObjectOptions {
  effectId?: FieldObject["effectId"];
  damage?: number;
  sourceCardId?: string;
  sourceId?: string;
  owner?: "player" | "enemy";
  hidden?: boolean;
  pushable?: boolean;
  collision?: "solid" | "passable";
  firstTriggerDelayMs?: number;
  fallback?: boolean;
}
interface StoredRecords {
  highScore: number;
  bestWave: number;
}

const PLAYER_MAX_HP = 220;
const FINAL_WAVE = 4;
const CUSTOM_INTERVAL_SECONDS = COMBAT_BALANCE.custom.intervalMs / 1000;
const TERRITORY_EXPANSION_DURATION_MS = 10000;
const STORAGE_KEY = "grid-signal-arena-records-v2";
const PATTERN_LABEL: Record<Pattern, string> = {
  "lane-sweep": "横一列砲撃",
  "column-scan": "縦列走査",
  "pursuit-dash": "踏み込み斬り",
  "mortar-spread": "砲撃準備",
  "pulse-grid": "電撃準備",
  "wave-runner": "水波準備",
  "boomer-arc": "周回弾準備",
  "hopper-bomb": "爆弾準備",
  "gaia-hammer": "槌撃準備",
  "weather-core": "天候攻撃準備",
  "support-relay": "支援行動準備",
  "mirror-node": "反射行動準備",
  "bastion-prime": "要塞行動準備",
  "prism-hunter": "転送斬準備",
  "climate-engine": "気象攻撃準備",
  "core-arbiter": "裁定攻撃準備",
};
const playerTiles = () =>
  Array.from({ length: 3 }, (_, col) =>
    Array.from({ length: 3 }, (_, row) => ({ col, row }))
  ).flat();
const sameTile = (a: GridPosition, b: GridPosition) =>
  a.col === b.col && a.row === b.row;
const uniqueTiles = (tiles: GridPosition[]) =>
  tiles.filter(
    (tile, index) => tiles.findIndex(other => sameTile(other, tile)) === index
  );
const columnAtPreview = (column: number): GridPosition[] =>
  [0, 1, 2].map(row => ({
    col: Math.max(0, Math.min(5, column)),
    row,
  }));
function loadRecords(): StoredRecords {
  if (typeof window === "undefined") return { highScore: 0, bestWave: 0 };
  try {
    const saved = loadSaveData().records;
    const legacy = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}"
    ) as { highScore?: unknown; bestWave?: unknown };
    const legacyHighScore =
      typeof legacy.highScore === "number" && Number.isFinite(legacy.highScore)
        ? legacy.highScore
        : 0;
    const legacyBestWave =
      typeof legacy.bestWave === "number" && Number.isFinite(legacy.bestWave)
        ? legacy.bestWave
        : 0;
    return {
      highScore: Math.max(saved.highScore, legacyHighScore, 0),
      bestWave: Math.max(saved.bestWave, legacyBestWave, 0),
    };
  } catch {
    return { highScore: 0, bestWave: 0 };
  }
}

function saveRecords(records: StoredRecords): void {
  if (typeof window === "undefined") return;
  try {
    const saveData = loadSaveData();
    saveSaveData({
      ...saveData,
      records: {
        highScore: Math.max(0, Math.round(records.highScore)),
        bestWave: Math.max(0, Math.round(records.bestWave)),
      },
    });
    // Keep the old key as a migration path for already-played local runs.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    /* Private browser modes can disallow storage. */
  }
}

const BOSS_HISTORY_STORAGE_KEY = "grid-signal-arena-boss-history-v1";

function loadBossHistory(): EnemyId[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(BOSS_HISTORY_STORAGE_KEY) ?? "[]"
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is EnemyId =>
        typeof value === "string" && isBossEnemy(value)
      )
      .slice(-2);
  } catch {
    return [];
  }
}

function saveBossHistory(history: readonly EnemyId[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BOSS_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(-2))
    );
  } catch {
    /* Private browser modes can disallow storage. */
  }
}

export class GameWorld {
  private readonly clock = new FixedStepClock();
  private readonly panelSystem = new PanelSystem();
  private readonly objectSystem = new ObjectSystem();
  private readonly projectileSystem = new ProjectileSystem();
  private readonly objectNextTriggerAt = new Map<string, number>();
  private readonly objectTriggerCount = new Map<string, number>();
  private objectSequence = 0;
  private pendingMelee: PendingMelee[] = [];
  private pendingChainEffects: PendingChainEffect[] = [];
  private dreamAuraUntil = 0;
  private overdrivePrompt: OverdrivePrompt | null = null;
  private usedChainTechniques: string[] = [];
  private gameTimeMs = 0;
  private hitstopRemainingMs = 0;
  private mode: BattleSnapshot["mode"] = "custom";
  private playerHp = PLAYER_MAX_HP;
  private playerMaxHp = PLAYER_MAX_HP;
  private playerGrid: GridPosition = { col: 1, row: 1 };
  private readonly customSystem = new CustomSystem(
    COMBAT_BALANCE.custom.intervalMs,
    COMBAT_BALANCE.custom.max,
    COMBAT_BALANCE.custom.baseMultiplier
  );
  private readonly emotionSystem = new EmotionSystem();
  private sync = false;
  private charging = 0;
  private isCharging = false;
  private barrier = 0;
  private invincibleUntil = 0;
  private playerControlLockedUntil = 0;
  private playerDamageInvulnerableUntil = 0;
  private playerStunnedUntil = 0;
  private playerBlindUntil = 0;
  private phaseUntil = 0;
  private pendingDefense: "return" | "substitute" | "premonition" | null = null;
  private pendingDefenseUntil = 0;
  private electromagneticBarrierActive = false;
  private pendingRepair: PendingRepair | null = null;
  private nextSwordMultiplier = 1;
  private outputMarkRemaining = 0;
  private normalShotDamageMultiplier = 1;
  private contaminationActive = false;
  private forcedRepairDrainActive = false;
  private nextForcedRepairDrainAt = 0;
  private nextPlayerTerrainDamageAt = 0;
  private handSizeReduction = 0;
  private overloadRandom = new Random(0x51a7c0de);
  private activeFolder: SavedFolder = getActiveFolder(loadSaveData());
  private battleDeck = new BattleDeck(this.activeFolder, 1009);
  private customHand: Card[] = [];
  private selected: number[] = [];
  private focusedCard: number | null = null;
  private selectionError: string | null = null;
  private queue: Card[] = [];
  private wave = 1;
  private score = 0;
  private scoreBreakdown: ScoreBreakdown = createScoreBreakdown();
  private waveResults: WaveScoreSummary[] = [];
  private lastWaveScore: WaveScoreSummary | null = null;
  private lastWaveRecovery = 0;
  private waveStartedElapsed = 0;
  private waveDamageTaken = 0;
  private totalDamageTaken = 0;
  private simultaneousDefeats = 0;
  private cardsUsed = 0;
  private overloadCardsUsed = 0;
  private lastDefeatAt: number | null = null;
  private outcome: RunOutcome | null = null;
  private personalBestDelta = 0;
  private practiceStage = 1;
  private records = loadRecords();
  private bossHistory: EnemyId[] = loadBossHistory();
  private lastAttackCard: Card | null = null;
  private enemies: Enemy[] = [];
  private message = "カードを選択してください";
  private elapsed = 0;
  private counters = 0;
  private rank = "—";
  private notifyTimer = 0;
  private paused = false;
  private customRemaining = CUSTOM_INTERVAL_SECONDS;
  private nextFireAt = 0;
  private onSnapshot: (snapshot: BattleSnapshot) => void;
  private onEvent: (event: BattleEvent) => void;

  constructor(
    onSnapshot: (snapshot: BattleSnapshot) => void,
    onEvent: (event: BattleEvent) => void,
    startWave = 1
  ) {
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    if (startWave > 1 && startWave <= FINAL_WAVE) {
      this.wave = startWave;
      this.message = `ウェーブ 0${this.wave} デモ — カードを選択`;
    }
    this.resetBattleDeck();
    this.resetBoard();
    if (new URLSearchParams(window.location.search).has("panic")) {
      this.playerHp = 28;
      this.message = "ピンチ状態デモ — 回避または回復してください";
    }
    this.notify();
  }
  public readonly controller: GameController = {
    move: (dx, dy) => this.move(dx, dy),
    fire: () => this.fire(),
    startCharge: () => this.startCharge(),
    releaseCharge: () => this.releaseCharge(),
    cancelCharge: () => this.cancelCharge(),
    useSkill: () => this.useSkill(),
    openCustom: () => this.openCustom(),
    toggleCard: i => this.toggleCard(i),
    confirmCustom: () => this.confirmCustom(),
    reloadFolder: () => this.reloadFolder(),
    nextWave: () => this.nextWave(),
    restart: () => this.restart(),
    togglePause: () => this.togglePause(),
    startPractice: () => this.startPractice(),
    nextPracticeStage: () => this.nextPracticeStage(),
    exitPractice: () => this.exitPractice(),
  };

  private startPractice(): void {
    if (this.mode !== "custom" || this.wave !== 1 || this.elapsed !== 0) return;
    this.clock.discardPendingTime();
    this.cancelCharge();
    this.paused = false;
    this.mode = "practice";
    this.practiceStage = 1;
    this.message = "練習モード — " + getPracticeStage(this.practiceStage).title;
    this.notify();
  }

  private nextPracticeStage(): void {
    if (this.mode !== "practice") return;
    if (this.practiceStage < PRACTICE_STAGES.length) {
      this.practiceStage += 1;
      this.message =
        "練習モード — " + getPracticeStage(this.practiceStage).title;
    } else {
      this.message = "練習を完了しました — 通常モードへ戻れます";
    }
    this.notify();
  }

  private exitPractice(): void {
    if (this.mode !== "practice") return;
    this.restart();
    this.message = "練習モードを終了 — カードを選択してください";
    this.notify();
  }

  public update(realDeltaSeconds: number): void {
    if (this.mode !== "battle" || this.paused) {
      this.clock.discardPendingTime();
      return;
    }
    this.clock.advance(realDeltaSeconds, stepSeconds => this.step(stepSeconds));
  }

  public onVisibilityChange(visible: boolean): void {
    if (!visible) {
      this.clock.discardPendingTime();
      this.cancelCharge();
    }
  }

  private step(delta: number): void {
    if (this.mode !== "battle" || this.paused) return;
    const deltaMs = delta * 1000;
    if (this.hitstopRemainingMs > 0) {
      this.hitstopRemainingMs = Math.max(0, this.hitstopRemainingMs - deltaMs);
      return;
    }

    this.gameTimeMs += deltaMs;
    this.elapsed += delta;
    this.customSystem.advance(delta, this.gameTimeMs);
    this.syncCustomRemaining();
    if (this.isCharging)
      this.charging = Math.min(
        1,
        this.charging + deltaMs / COMBAT_BALANCE.chargeShot.fullChargeMs
      );
    const now = this.gameTimeMs;
    const panelUpdate = this.panelSystem.update(now);
    this.syncBoardOccupancy();
    if (panelUpdate.restoredTerritoryColumns.length > 0)
      this.returnPlayerToSafeTerritory();
    const projectileResolutions = this.projectileSystem.advance(now, deltaMs, {
      collision: (projectile, positions) =>
        this.resolveProjectileCollision(projectile, positions),
      findHomingTarget: projectile => this.findHomingTarget(projectile),
    });
    projectileResolutions
      .sort(
        (a, b) =>
          (a.projectile.owner === "enemy" ? -1 : 1) -
          (b.projectile.owner === "enemy" ? -1 : 1)
      )
      .forEach(resolution =>
        this.applyProjectileResolution(
          resolution.projectile,
          resolution.targetIds,
          resolution.objectId
        )
      );
    this.updateFieldObjects(now);
    this.updateTerrainEffects(now);
    this.updatePendingRepair(now);
    this.updatePendingChainEffects(now);
    this.updateOverdrivePrompt(now);
    this.updateMeleeAttacks(now);
    for (const enemy of this.enemies) {
      this.updateStatus(enemy, now);
      this.updateEnemy(enemy, now);
    }
    this.updateForcedRepairDrain(now);
    this.emotionSystem.update(now, this.playerHp, this.playerMaxHp, this.sync);
    this.syncBoardOccupancy();
    const allEnemiesDefeated =
      this.enemies.length > 0 &&
      this.enemies.every(enemy => enemy.state === "deleted");
    if (this.playerHp <= 0) {
      this.finishRun(allEnemiesDefeated ? "draw" : "defeat");
      return;
    }
    if (allEnemiesDefeated) this.finishWave();
    this.notifyTimer += delta;
    if (this.notifyTimer > 0.08) {
      this.notifyTimer = 0;
      this.notify();
    }
  }

  private updateStatus(enemy: Enemy, now: number): void {
    if (enemy.state === "deleted") return;
    if (enemy.burnUntil > now && now >= enemy.nextBurnAt) {
      enemy.nextBurnAt = now + 520;
      this.strikeEnemy(enemy, 7, undefined, false);
    }
  }
  private currentEnemyAction(enemy: Enemy): EnemyActionDefinition | undefined {
    return getEnemyDefinition(enemy.definitionId)?.actions.find(
      action => action.id === enemy.actionId
    );
  }

  private phaseForEnemy(enemy: Enemy): EnemyPhaseDefinition | undefined {
    const phases = getEnemyDefinition(enemy.definitionId)?.phases;
    if (!phases || phases.length === 0) return undefined;
    const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    return [...phases]
      .sort((a, b) => a.maxHpRatio - b.maxHpRatio)
      .find(phase => ratio <= phase.maxHpRatio) ?? phases[0];
  }

  private refreshEnemyPhase(enemy: Enemy): EnemyPhaseDefinition | undefined {
    const definition = getEnemyDefinition(enemy.definitionId);
    const phase = this.phaseForEnemy(enemy);
    if (!definition || !phase) {
      enemy.bossPhase = 0;
      enemy.bossPhaseLabel = null;
      enemy.defense = enemy.baseDefense;
      enemy.movement = enemy.baseMovement;
      enemy.weaknessElement =
        definition?.weakness ?? definition?.element ?? "none";
      return undefined;
    }

    const changed = enemy.bossPhase !== phase.phase;
    enemy.bossPhase = phase.phase;
    enemy.bossPhaseLabel = phase.label;
    enemy.defense = phase.defense ?? enemy.baseDefense;
    enemy.movement = phase.movement ?? enemy.baseMovement;
    enemy.weaknessElement =
      phase.weaknessElement ?? definition.weakness ?? definition.element;
    if (changed) {
      enemy.actionIndex = 0;
      this.message = enemy.name + " — " + phase.label;
      this.onEvent({
        type: "player-reaction",
        at: { ...enemy.grid },
        kind: "phase",
        enemyId: enemy.id,
      });
    }
    return phase;
  }

  private availableEnemyActions(enemy: Enemy): EnemyActionDefinition[] {
    const definition = getEnemyDefinition(enemy.definitionId);
    if (!definition) return [];
    const phase = this.phaseForEnemy(enemy);
    if (!phase) return [...definition.actions];
    const actions = phase.actionIds
      .map(actionId =>
        definition.actions.find(action => action.id === actionId)
      )
      .filter((action): action is EnemyActionDefinition => Boolean(action));
    return actions.length > 0 ? actions : [...definition.actions];
  }

  private chooseEnemyAction(
    enemy: Enemy,
    actions: readonly EnemyActionDefinition[]
  ): EnemyActionDefinition | undefined {
    if (actions.length === 0) return undefined;
    const phase = this.phaseForEnemy(enemy);
    let action =
      actions[enemy.actionIndex % actions.length] ?? actions[0];
    const panel = this.panelSystem.get(this.playerGrid);
    const preferredElement =
      panel?.terrain === "grass"
        ? "fire"
        : panel?.terrain === "ice"
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

  private updateEnemy(enemy: Enemy, now: number): void {
    if (enemy.state === "deleted") {
      enemy.actionPhase = "deleted";
      return;
    }
    if (enemy.state === "stunned") {
      enemy.actionPhase = "stunned";
      if (now >= enemy.stunnedUntil) {
        enemy.state = "recover";
        enemy.actionPhase = "recovery";
        enemy.activeUntil = now;
        enemy.recoverUntil = now + 430;
      }
      return;
    }

    this.refreshEnemyPhase(enemy);
    const action = this.currentEnemyAction(enemy);
    if (enemy.state === "windup") {
      if (
        !enemy.warningShown &&
        now >= enemy.warningAt &&
        now < enemy.windupUntil &&
        now >= this.playerBlindUntil
      ) {
        enemy.lockedTargets.forEach(target =>
          this.onEvent({ type: "warning", at: target, enabled: true })
        );
        enemy.warningShown = true;
        enemy.warningStartedAt = now;
        enemy.warningStage = "telegraph";
      }
      if (enemy.warningShown) {
        enemy.warningStage = getWarningStage(
          getWarningProgress(now, enemy.warningStartedAt, enemy.windupUntil)
        );
      }
      enemy.actionPhase = isCounterWindowOpen(now, enemy.counterWindowState)
        ? "counter-window"
        : "startup";
      if (now >= enemy.windupUntil) {
        const targets = [...enemy.lockedTargets];
        if (enemy.warningShown) this.clearWarnings(enemy);
        this.executeEnemyAction(enemy, action, now, targets);
        enemy.lockedTargets = [];
        enemy.state = "recover";
        enemy.actionPhase = "active";
        enemy.activeUntil = now + (action?.activeMs ?? 100);
        enemy.recoverUntil =
          enemy.activeUntil + (action?.recoveryMs ?? 430);
        enemy.warningShown = false;
        enemy.warningStage = null;
        enemy.warningStartedAt = 0;
      }
      return;
    }

    if (enemy.state === "recover") {
      if (now < enemy.activeUntil) {
        enemy.actionPhase = "active";
        return;
      }
      if (now < enemy.recoverUntil) {
        enemy.actionPhase = "recovery";
        return;
      }
      if (now >= enemy.rootUntil) this.reposition(enemy);
      enemy.state = "idle";
      enemy.actionPhase = "idle";
      enemy.nextAttackAt =
        now + (action?.cooldownMs ?? enemy.cooldownMs) +
        (now < enemy.slowUntil ? 620 : 0);
      return;
    }

    enemy.actionPhase = "idle";
    if (now >= enemy.nextAttackAt) this.prepareAttack(enemy, now);
  }

  private prepareAttack(enemy: Enemy, now: number): void {
    const definition = getEnemyDefinition(enemy.definitionId);
    const phase = this.refreshEnemyPhase(enemy);
    const action = this.chooseEnemyAction(
      enemy,
      this.availableEnemyActions(enemy)
    );
    if (!definition || !action) return;

    enemy.cycle += 1;
    enemy.actionId = action.id;
    enemy.actionName = action.name;
    enemy.pattern = action.pattern;
    enemy.attackDamage = action.damage;
    enemy.windupMs = action.startupMs;
    enemy.cooldownMs = action.cooldownMs;
    enemy.counterWindowMs = action.counterWindowMs;
    enemy.weaknessElement =
      action.weaknessElement ??
      phase?.weaknessElement ??
      definition.weakness ??
      definition.element;
    if (
      enemy.movement === "pursuit" &&
      now >= enemy.rootUntil
    ) {
      this.movePursuitEnemy(enemy);
    }
    enemy.lockedTargets = this.targetsForAction(enemy, action);
    enemy.state = "windup";
    enemy.actionPhase = "startup";
    const slowExtra = now < enemy.slowUntil ? 280 : 0;
    enemy.windupUntil = now + action.startupMs + slowExtra;
    enemy.activeUntil = enemy.windupUntil;
    enemy.recoverUntil = 0;
    enemy.attackStartedAt = now;
    enemy.counterWindowState = createCounterWindow(
      now,
      enemy.windupUntil,
      action.counterWindowMs,
      COMBAT_BALANCE.counter.endMarginMs
    );
    enemy.counterStartAt = enemy.counterWindowState.startAt;
    enemy.counterEndAt = enemy.counterWindowState.endAt;
    enemy.warningAt = now + (action.warningDelayMs ?? 0);
    enemy.warningShown = false;
    enemy.warningStage = null;
    enemy.warningStartedAt = 0;
    this.message = enemy.name + " — " + action.name;
  }

  private targetsForAction(
    enemy: Enemy,
    action: EnemyActionDefinition
  ): GridPosition[] {
    const player = { ...this.playerGrid };
    if (action.target === "support") {
      return [{ ...this.findEnemySupportTarget(enemy).grid }];
    }
    if (action.id === "hopper-jump-land") {
      return [{ ...this.findHopperLanding() }];
    }
    if (
      action.id === "hopper-bomb-drop" ||
      action.id === "bastion-obstacle-deploy" ||
      action.id === "arbiter-stake-field"
    ) {
      return [{ ...this.findEnemyObjectPlacement(enemy) }];
    }
    switch (action.target) {
      case "row":
        return [0, 1, 2].map(col => ({ col, row: player.row }));
      case "column":
        return [0, 1, 2].map(row => ({ col: player.col, row }));
      case "player":
      case "adjacent":
      case "mine":
        return [action.target === "mine" ? this.findEnemyMinePlacement() : player];
      case "cross":
        return uniqueTiles([
          player,
          { col: player.col - 1, row: player.row },
          { col: player.col + 1, row: player.row },
          { col: player.col, row: player.row - 1 },
          { col: player.col, row: player.row + 1 },
        ]).filter(tile => this.panelSystem.isInside(tile));
      case "spread":
        return uniqueTiles([
          player,
          { col: player.col, row: player.row - 1 },
          { col: player.col, row: player.row + 1 },
        ]).filter(tile => this.panelSystem.isInside(tile));
      case "alternating":
        return playerTiles().filter(
          tile => (tile.col + tile.row + enemy.cycle) % 2 === 0
        );
      case "all-rows":
        return playerTiles().concat(
          [3, 4, 5].flatMap(col =>
            [0, 1, 2].map(row => ({ col, row }))
          )
        );
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
        return [0, 1, 2].flatMap(col =>
          [0, 1, 2].map(row => ({ col, row }))
        );
      default:
        return [player];
    }
  }

  private movePursuitEnemy(enemy: Enemy): void {
    const target = { col: 3, row: this.playerGrid.row };
    if (!this.canEnemyOccupy(enemy, target)) return;
    enemy.actionPhase = "moving";
    enemy.grid = target;
  }

  private moveOuterEnemy(enemy: Enemy): void {
    const route: GridPosition[] = [
      { col: 3, row: 0 },
      { col: 4, row: 0 },
      { col: 5, row: 0 },
      { col: 5, row: 1 },
      { col: 5, row: 2 },
      { col: 4, row: 2 },
      { col: 3, row: 2 },
    ];
    let index = route.findIndex(tile => sameTile(tile, enemy.grid));
    if (index < 0) index = 0;
    for (let offset = 1; offset <= route.length; offset += 1) {
      const destination = route[(index + offset) % route.length];
      if (destination && this.canEnemyOccupy(enemy, destination)) {
        enemy.actionPhase = "moving";
        enemy.grid = destination;
        return;
      }
    }
  }

  private reposition(enemy: Enemy): void {
    if (enemy.movement === "stationary") return;
    if (enemy.movement === "outer") {
      this.moveOuterEnemy(enemy);
      return;
    }
    if (enemy.movement === "row-align") {
      const target = { col: enemy.grid.col, row: this.playerGrid.row };
      if (this.canEnemyOccupy(enemy, target)) {
        enemy.actionPhase = "moving";
        enemy.grid = target;
        return;
      }
    }
    if (enemy.movement === "pursuit") {
      const target = {
        col: 3,
        row: (this.playerGrid.row + enemy.cycle + 1) % 3,
      };
      if (this.canEnemyOccupy(enemy, target)) enemy.grid = target;
      return;
    }
    const flying = enemy.movement === "flying";
    const directions = [
      { col: 0, row: 1 },
      { col: 0, row: -1 },
      { col: -1, row: 0 },
      { col: 1, row: 0 },
    ];
    for (const direction of directions) {
      const destination = this.panelSystem.resolveMovement(
        enemy.grid,
        direction,
        "enemy",
        position =>
          this.objectSystem.isSolidAt(position) ||
          this.enemies.some(
            other => other.id !== enemy.id && sameTile(other.grid, position)
          ),
        flying
      );
      if (destination && !sameTile(destination, enemy.grid)) {
        enemy.grid = destination;
        return;
      }
    }
  }

  private canEnemyOccupy(enemy: Enemy, position: GridPosition): boolean {
    const panel = this.panelSystem.get(position);
    const territoryAllowed =
      panel?.owner === "enemy" ||
      (enemy.isBoss && panel?.owner === "player" && position.col >= 2);
    if (!panel || !territoryAllowed) return false;
    if (!enemy.movement || enemy.movement !== "flying") {
      if (panel.terrain === "hole") return false;
    }
    if (panel.objectId !== null) return false;
    return !this.enemies.some(
      other => other.id !== enemy.id &&
        other.state !== "deleted" &&
        sameTile(other.grid, position)
    );
  }

  private clearWarnings(enemy: Enemy): void {
    if (enemy.warningShown) {
      enemy.lockedTargets.forEach(target =>
        this.onEvent({ type: "warning", at: target, enabled: false })
      );
    }
    enemy.warningShown = false;
    enemy.warningStage = null;
    enemy.warningStartedAt = 0;
  }

  private firstLockedTarget(
    targets: readonly GridPosition[]
  ): GridPosition {
    return { ...(targets[0] ?? this.playerGrid) };
  }

  private executeEnemyAction(
    enemy: Enemy,
    action: EnemyActionDefinition | undefined,
    now: number,
    targets: GridPosition[]
  ): void {
    if (!action) return;

    const lockedTarget = this.firstLockedTarget(targets);
    const lockedRow = targets[0]?.row ?? lockedTarget.row;
    const lockedColumn = targets[0]?.col ?? lockedTarget.col;

    if (
      action.id === "bulwark-lane-cannon" ||
      action.id === "bastion-lane-cannon"
    ) {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "straight",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: lockedRow },
      });
      return;
    }
    if (
      action.id === "bulwark-shield-bash" ||
      action.id === "bastion-shield-bash" ||
      action.id === "razor-dash-cut" ||
      action.id === "arbiter-close-cut"
    ) {
      this.resolveEnemyMelee(enemy, action, targets);
      return;
    }
    if (
      action.id === "razor-cross-slash" ||
      action.id === "prism-cross-cut"
    ) {
      this.resolveEnemyMelee(enemy, action, targets);
      return;
    }
    if (action.id === "prism-teleport-cut") {
      this.teleportEnemyNearPlayer(enemy, lockedTarget);
      this.resolveEnemyMelee(enemy, action, targets);
      return;
    }
    if (action.id === "prism-front-cut") {
      this.resolveEnemyMelee(enemy, action, targets);
      return;
    }
    if (action.id === "prism-triple-cut") {
      this.resolveEnemyMelee(enemy, action, targets);
      return;
    }
    if (action.id === "scanner-column-scan") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "thrown",
        target: { col: lockedColumn, row: lockedTarget.row },
        rowSpan: true,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      return;
    }
    if (action.id === "scanner-signal-lock") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "homing",
        target: lockedTarget,
        speedCellsPerSecond: 9,
      });
      return;
    }
    if (action.id === "mortar-shell") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "thrown",
        target: lockedTarget,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      return;
    }
    if (action.id === "mortar-triple-shell") {
      const shellTargets = targets
        .filter(target => this.panelSystem.isInside(target))
        .slice(0, action.projectileCount ?? 3);
      shellTargets.forEach((target, index) =>
        this.spawnEnemyProjectile(
          enemy,
          action,
          {
            target: { ...target },
            motion: "thrown",
            flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
          },
          index * (action.projectileIntervalMs ?? 110)
        )
      );
      return;
    }
    if (action.id === "mortar-mine-drop") {
      const panel = lockedTarget;
      this.placeFieldObject(
        "mine",
        panel,
        action.objectHp ?? 35,
        action.objectLifetimeMs ?? 5000,
        "enemy-contact",
        {
          owner: "enemy",
          effectId: "enemy-mine",
          damage: action.damage,
          sourceId: enemy.id,
          collision: "passable",
          pushable: false,
          fallback: false,
        }
      );
      this.message = enemy.name + " — 地雷を設置";
      return;
    }
    if (action.id === "sentinel-alternating-pulse") {
      targets.forEach((target, index) =>
        this.spawnEnemyProjectile(
          enemy,
          action,
          {
            target,
            motion: "thrown",
            flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
          },
          index * 35
        )
      );
      return;
    }
    if (action.id === "sentinel-chain-bolt") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "homing",
        target: lockedTarget,
        speedCellsPerSecond: 9,
      });
      return;
    }

    if (
      action.id === "wave-runner-water-wave" ||
      action.id === "wave-runner-frost-surge"
    ) {
      this.applyEnemyActionTerrain(action, targets);
      this.spawnEnemyProjectile(enemy, action, {
        motion: "wave",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: lockedRow },
        rowSpan: true,
        stopOnObject: false,
      });
      return;
    }
    if (
      action.id === "boomer-arc-outbound" ||
      action.id === "boomer-arc-return" ||
      action.id === "arbiter-orbit-mine"
    ) {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "orbit",
        position: { col: 5, row: 0 },
        direction: { col: -1, row: 0 },
        target: null,
        continuesAfterHit: true,
        stopOnObject: false,
        expiresAt: now + 4200,
        speedCellsPerSecond: 8,
      });
      return;
    }
    if (action.id === "hopper-jump-land") {
      const landing = lockedTarget;
      enemy.grid = landing;
      this.syncBoardOccupancy();
      this.applyEnemyAreaDamage(enemy, landing, action.damage, 1, true);
      return;
    }
    if (action.id === "hopper-bomb-drop") {
      const panel = lockedTarget;
      this.placeFieldObject(
        "bomb",
        panel,
        action.objectHp ?? 50,
        action.objectLifetimeMs ?? 2000,
        "timer",
        {
          owner: "enemy",
          effectId: "enemy-bomb",
          damage: action.damage,
          sourceId: enemy.id,
          collision: "passable",
          pushable: false,
          fallback: false,
        }
      );
      this.message = enemy.name + " — 爆弾を投下";
      return;
    }
    if (action.id === "gaia-hammer-strike") {
      this.resolveEnemyMelee(enemy, action, targets);
      return;
    }
    if (action.id === "gaia-earthquake") {
      const center = targets[0] ?? this.playerGrid;
      this.applyEnemyActionTerrain(action, this.areaAround(center));
      this.applyEnemyAreaDamage(enemy, center, action.damage, 1, false);
      return;
    }

    if (
      action.pattern === "weather-core" ||
      action.pattern === "climate-engine"
    ) {
      this.applyEnemyActionTerrain(action, targets);
      const count = Math.max(1, action.projectileCount ?? 1);
      for (let index = 0; index < count; index += 1) {
        const delay = index * (action.projectileIntervalMs ?? 0);
        if (action.motion === "wave") {
          this.spawnEnemyProjectile(
            enemy,
            action,
            {
              motion: "wave",
              direction: { col: -1, row: 0 },
              target: { col: 0, row: lockedRow },
              rowSpan: true,
              stopOnObject: false,
            },
            delay
          );
        } else if (action.motion === "thrown") {
          this.spawnEnemyProjectile(
            enemy,
            action,
            {
              motion: "thrown",
              target: { col: lockedColumn, row: lockedTarget.row },
              rowSpan: true,
              flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
            },
            delay
          );
        } else if (action.motion === "homing") {
          this.spawnEnemyProjectile(
            enemy,
            action,
            {
              motion: "homing",
              target: lockedTarget,
              speedCellsPerSecond: 8,
            },
            delay
          );
        } else {
          this.spawnEnemyProjectile(
            enemy,
            action,
            {
              motion: "straight",
              direction: { col: -1, row: 0 },
              target: { col: 0, row: lockedRow },
            },
            delay
          );
        }
      }
      return;
    }

    if (action.id === "support-relay-heal" || action.id === "support-relay-barrier") {
      this.applyEnemySupport(enemy, action, lockedTarget);
      return;
    }
    if (action.id === "support-relay-shot") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "straight",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: lockedRow },
      });
      return;
    }
    if (action.id === "mirror-reflect-stance") {
      enemy.defense = "reflect";
      this.message = enemy.name + " — 反射姿勢";
      return;
    }
    if (action.id === "mirror-mimic-shot") {
      const mimicDamage = this.lastAttackCard
        ? Math.max(action.damage, Math.round(this.lastAttackCard.power / 2))
        : action.damage;
      this.spawnEnemyProjectile(enemy, action, {
        damage: mimicDamage,
        motion: "straight",
        direction: { col: -1, row: 0 },
        target: { col: 0, row: lockedRow },
      });
      return;
    }

    if (action.id === "bastion-obstacle-deploy") {
      this.placeFieldObject(
        action.objectKind ?? "cube",
        lockedTarget,
        action.objectHp ?? 100,
        action.objectLifetimeMs ?? null,
        "damage",
        {
          owner: "enemy",
          sourceId: enemy.id,
          collision: "solid",
          pushable: false,
          fallback: false,
        }
      );
      this.message = enemy.name + " — 障害物を展開";
      return;
    }
    if (action.id === "bastion-territory-siege") {
      this.stealPlayerFront();
      return;
    }
    if (action.id === "bastion-open-barrage") {
      for (let index = 0; index < (action.projectileCount ?? 3); index += 1) {
        this.spawnEnemyProjectile(
          enemy,
          action,
          {
            motion: "straight",
            direction: { col: -1, row: 0 },
            target: { col: 0, row: lockedRow },
          },
          index * (action.projectileIntervalMs ?? 150)
        );
      }
      return;
    }

    if (action.id === "arbiter-tracking-shot") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: "homing",
        target: lockedTarget,
        speedCellsPerSecond: 8,
      });
      return;
    }
    if (action.id === "arbiter-stake-field") {
      this.placeFieldObject(
        action.objectKind ?? "mine",
        lockedTarget,
        action.objectHp ?? 40,
        action.objectLifetimeMs ?? 4500,
        "enemy-contact",
        {
          owner: "enemy",
          effectId: "enemy-mine",
          damage: action.damage,
          sourceId: enemy.id,
          collision: "passable",
          pushable: false,
          fallback: false,
        }
      );
      this.message = enemy.name + " — 拘束フィールドを設置";
      return;
    }
    if (action.id === "arbiter-territory-take") {
      this.stealPlayerFront();
      return;
    }

    if (action.kind === "projectile") {
      this.spawnEnemyProjectile(enemy, action, {
        motion: action.motion ?? "straight",
        target: lockedTarget,
      });
    }
  }

  private findEnemyObjectPlacement(enemy: Enemy): GridPosition {
    const candidates = [
      { col: Math.max(3, enemy.grid.col - 1), row: enemy.grid.row },
      { col: enemy.grid.col, row: Math.max(0, enemy.grid.row - 1) },
      { col: enemy.grid.col, row: Math.min(2, enemy.grid.row + 1) },
      { col: 3, row: this.playerGrid.row },
      ...this.panelSystem.snapshot().map(panel => ({
        col: panel.col,
        row: panel.row,
      })),
    ];
    return (
      candidates.find(position => {
        const panel = this.panelSystem.get(position);
        return (
          panel?.owner === "enemy" &&
          panel.occupantId === null &&
          panel.objectId === null &&
          panel.terrain !== "hole"
        );
      }) ?? { col: 3, row: this.playerGrid.row }
    );
  }

  private findHopperLanding(): GridPosition {
    const candidates = [
      { col: Math.min(5, Math.max(3, this.playerGrid.col + 1)), row: this.playerGrid.row },
      { col: 3, row: this.playerGrid.row },
      { col: 4, row: Math.max(0, this.playerGrid.row - 1) },
      { col: 4, row: Math.min(2, this.playerGrid.row + 1) },
      { col: 5, row: this.playerGrid.row },
    ];
    return (
      candidates.find(position => {
        const panel = this.panelSystem.get(position);
        return (
          panel?.owner === "enemy" &&
          panel.occupantId === null &&
          panel.objectId === null &&
          panel.terrain !== "hole"
        );
      }) ?? { col: 3, row: this.playerGrid.row }
    );
  }

  private applyEnemyActionTerrain(
    action: EnemyActionDefinition,
    targets: GridPosition[]
  ): void {
    const terrain = action.panelTerrain;
    if (!terrain) return;
    const terrainTargets =
      action.target === "all-rows"
        ? [0, 1, 2, 3, 4, 5].flatMap(col =>
            [0, 1, 2].map(row => ({ col, row }))
          )
        : targets;
    terrainTargets.forEach(position => {
      if (!this.panelSystem.isInside(position)) return;
      if (terrain === "cracked")
        this.panelSystem.crack(position);
      else
        this.panelSystem.setTerrain(position, terrain, this.gameTimeMs, 3200);
    });
  }

  private applyEnemyAreaDamage(
    enemy: Enemy,
    center: GridPosition,
    damage: number,
    radius: number,
    crack: boolean
  ): void {
    const area = this.areaAround(center, radius);
    if (crack) area.forEach(position => this.panelSystem.crack(position));
    if (area.some(position => sameTile(position, this.playerGrid)))
      this.applyPlayerHit(damage, enemy.id);
    this.onEvent({
      type: "impact",
      at: { ...center },
      side: "enemy",
      enemyId: enemy.id,
      damage,
    });
  }

  private findEnemySupportTarget(enemy: Enemy): Enemy {
    return (
      this.enemies
        .filter(candidate => candidate.state !== "deleted" && candidate.id !== enemy.id)
        .sort((a, b) =>
          Number(b.isBoss) - Number(a.isBoss) ||
          (Math.abs(a.grid.col - enemy.grid.col) + Math.abs(a.grid.row - enemy.grid.row)) -
          (Math.abs(b.grid.col - enemy.grid.col) + Math.abs(b.grid.row - enemy.grid.row))
        )[0] ?? enemy
    );
  }

  private applyEnemySupport(
    enemy: Enemy,
    action: EnemyActionDefinition,
    lockedTarget?: GridPosition
  ): void {
    const target = lockedTarget
      ? this.enemies.find(
          candidate =>
            candidate.state !== "deleted" &&
            candidate.id !== enemy.id &&
            sameTile(candidate.grid, lockedTarget)
        ) ?? (sameTile(enemy.grid, lockedTarget) ? enemy : undefined)
      : this.findEnemySupportTarget(enemy);
    if (!target) return;
    const amount = action.supportAmount ?? 0;
    if (action.supportEffect === "heal")
      target.hp = Math.min(target.maxHp, target.hp + amount);
    if (action.supportEffect === "barrier")
      target.barrier = Math.min(220, target.barrier + amount);
    this.onEvent({
      type: "impact",
      at: { ...target.grid },
      side: "enemy",
      enemyId: target.id,
      damage: 0,
    });
    this.message = enemy.name + " — " + action.name;
  }

  private stealPlayerFront(): void {
    [0, 1, 2].forEach(row =>
      this.panelSystem.setOwner(
        { col: 2, row },
        "enemy",
        this.gameTimeMs,
        TERRITORY_EXPANSION_DURATION_MS
      )
    );
    this.ensurePlayerEscapeRoute();
    this.returnPlayerToSafeTerritory();
    this.message = "敵の区画奪取 — 退避経路を確保";
  }

  private ensurePlayerEscapeRoute(): void {
    const candidates = [
      { col: this.playerGrid.col - 1, row: this.playerGrid.row },
      { col: this.playerGrid.col + 1, row: this.playerGrid.row },
      { col: this.playerGrid.col, row: this.playerGrid.row - 1 },
      { col: this.playerGrid.col, row: this.playerGrid.row + 1 },
    ];
    const safe = candidates.some(position => {
      const panel = this.panelSystem.get(position);
      return (
        panel?.owner === "player" &&
        panel.terrain !== "hole" &&
        panel.objectId === null &&
        !this.enemies.some(
          enemy => enemy.state !== "deleted" && sameTile(enemy.grid, position)
        )
      );
    });
    if (safe) return;
    const fallback = { col: 1, row: this.playerGrid.row };
    const object = this.objectSystem.getAt(fallback);
    if (object) this.removeFieldObject(object.id);
    this.panelSystem.detachObject(fallback);
    this.panelSystem.setOwner(fallback, "player", this.gameTimeMs, null);
    this.panelSystem.setTerrain(fallback, "normal", this.gameTimeMs);
  }

  private teleportEnemyNearPlayer(
    enemy: Enemy,
    lockedTarget = this.playerGrid
  ): void {
    const candidates = [
      { col: 3, row: lockedTarget.row },
      { col: 4, row: lockedTarget.row },
      { col: 3, row: Math.max(0, lockedTarget.row - 1) },
      { col: 3, row: Math.min(2, lockedTarget.row + 1) },
    ];
    const target = candidates.find(
      position =>
        !sameTile(position, enemy.grid) && this.canEnemyOccupy(enemy, position)
    );
    if (target) {
      enemy.grid = target;
      this.syncBoardOccupancy();
    }
  }

  private reflectPlayerProjectile(
    enemy: Enemy,
    projectile: ProjectileState
  ): void {
    this.spawnProjectile({
      owner: "enemy",
      motion: "straight",
      position: { ...enemy.grid },
      direction: { col: -1, row: 0 },
      target: { col: 0, row: projectile.position.row },
      damage: Math.max(1, Math.ceil(projectile.damage / 2)),
      sourceId: enemy.id,
      sourceActionId: "mirror-reflect-stance",
      speedCellsPerSecond: COMBAT_BALANCE.projectile.defaultSpeedCellsPerSecond,
    });
    enemy.lastMirrorCardId = projectile.sourceCardId;
    this.message = enemy.name + " — 射撃を反射";
  }
  private spawnEnemyProjectile(
    enemy: Enemy,
    action: EnemyActionDefinition,
    options: Partial<Parameters<ProjectileSystem["spawn"]>[0]>,
    delayMs = 0
  ): void {
    const projectile = this.spawnProjectile({
      owner: "enemy",
      motion: action.motion ?? "straight",
      position: { ...enemy.grid },
      target: { ...this.playerGrid },
      damage: action.damage,
      sourceId: enemy.id,
      sourceActionId: action.id,
      continuesAfterHit: action.continuesAfterHit,
      activeAt: this.gameTimeMs + delayMs,
      ...options,
    });
    if (!projectile) return;
  }

  private resolveEnemyMelee(
    enemy: Enemy,
    action: EnemyActionDefinition,
    targets: readonly GridPosition[]
  ): void {
    const hits = targets.some(target => sameTile(target, this.playerGrid));
    if (!hits) return;
    const hitCount = Math.max(1, action.hitCount ?? 1);
    for (let index = 0; index < hitCount; index += 1)
      this.applyPlayerHit(action.damage, enemy.id, "direct", index > 0);
  }

  private findEnemyMinePlacement(): GridPosition {
    const player = { ...this.playerGrid };
    const candidates = [
      player,
      { col: player.col - 1, row: player.row },
      { col: player.col + 1, row: player.row },
      { col: player.col, row: player.row - 1 },
      { col: player.col, row: player.row + 1 },
      { col: 2, row: player.row },
      { col: 1, row: player.row },
      { col: 0, row: player.row },
    ];
    return (
      candidates.find(position => {
        const panel = this.panelSystem.get(position);
        return (
          panel &&
          panel.occupantId === null &&
          panel.objectId === null &&
          panel.terrain !== "hole"
        );
      }) ?? { col: 2, row: player.row }
    );
  }

  private syncBoardOccupancy(): void {
    this.panelSystem.clearOccupants();
    this.panelSystem.occupy(this.playerGrid, "player");
    for (const enemy of this.enemies) {
      if (enemy.state === "deleted") continue;
      if (this.panelSystem.occupy(enemy.grid, enemy.id)) continue;
      const fallback = this.panelSystem.findNearestSafePosition(
        enemy.grid,
        "enemy",
        position => this.objectSystem.isSolidAt(position)
      );
      if (fallback) {
        enemy.grid = fallback;
        this.panelSystem.occupy(enemy.grid, enemy.id);
      }
    }
  }

  private returnPlayerToSafeTerritory(): void {
    const current = this.panelSystem.get(this.playerGrid);
    if (
      current &&
      current.owner === "player" &&
      current.terrain !== "hole" &&
      current.objectId === null
    )
      return;
    const previous = { ...this.playerGrid };
    const safe = this.panelSystem.findNearestSafePosition(
      previous,
      "player",
      position => this.objectSystem.isSolidAt(position)
    );
    if (safe) {
      this.panelSystem.vacate(previous, this.gameTimeMs);
      this.playerGrid = safe;
      this.panelSystem.occupy(this.playerGrid, "player");
      this.message = "区画復元 — 安全な自陣へ帰還";
      return;
    }

    // A full set of temporary hazards must never delete the player. Reserve the center self panel as a last resort.
    const fallback = { col: 1, row: previous.row };
    this.objectSystem.removeAt(fallback);
    this.panelSystem.detachObject(fallback);
    this.panelSystem.setTerrain(fallback, "normal");
    this.panelSystem.vacate(previous, this.gameTimeMs);
    this.playerGrid = fallback;
    this.panelSystem.occupy(this.playerGrid, "player");
    this.message = "区画復元 — 緊急帰還";
  }

  private move(dx: number, dy: number): void {
    if (this.mode !== "battle" || this.paused) return;
    if (this.gameTimeMs < this.playerControlLockedUntil) return;
    if (this.gameTimeMs < this.playerStunnedUntil) return;
    if (dx === 0 && dy === 0) {
      this.notify();
      return;
    }
    const next = this.panelSystem.resolveMovement(
      this.playerGrid,
      { col: dx, row: dy },
      "player",
      position => this.objectSystem.isSolidAt(position)
    );
    if (!next) return;
    const previous = { ...this.playerGrid };
    this.panelSystem.vacate(previous, this.gameTimeMs);
    if (this.contaminationActive)
      this.panelSystem.setTerrain(previous, "poison", this.gameTimeMs);
    this.playerGrid = next;
    this.panelSystem.occupy(this.playerGrid, "player");
    this.applyPlayerEntryTerrain(this.playerGrid);
    this.message = this.isCharging ? "チャージを維持して移動" : "位置を更新";
    this.notify();
  }
  private fire(): void {
    const now = this.gameTimeMs;
    if (
      this.mode === "battle" &&
      !this.paused &&
      this.gameTimeMs >= this.playerStunnedUntil &&
      this.overdrivePrompt
    ) {
      if (now <= this.overdrivePrompt.expiresAt) {
        this.resolveOverdriveInput();
        return;
      }
      this.overdrivePrompt = null;
    }
    if (
      this.mode !== "battle" ||
      this.paused ||
      this.isCharging ||
      now < this.nextFireAt ||
      now < this.playerControlLockedUntil ||
      now < this.playerStunnedUntil
    )
      return;
    const target = this.frontTarget();
    const distance = target ? target.grid.col - this.playerGrid.col : 99;
    const interval =
      distance === 1
        ? COMBAT_BALANCE.normalShot.intervalByDistanceMs.one
        : distance === 2
          ? COMBAT_BALANCE.normalShot.intervalByDistanceMs.two
          : COMBAT_BALANCE.normalShot.intervalByDistanceMs.far;
    this.nextFireAt = now + interval;
    this.onEvent({ type: "attack", charged: false });
    this.spawnProjectile({
      owner: "player",
      motion: "straight",
      position: { ...this.playerGrid },
      direction: { col: 1, row: 0 },
      damage: Math.round(
        COMBAT_BALANCE.normalShot.damage * this.normalShotDamageMultiplier
      ),
      charged: false,
      target: target ? { ...target.grid } : null,
      speedCellsPerSecond: COMBAT_BALANCE.normalShot.speedCellsPerSecond,
    });
    this.message = "正面へ通常弾を発射";
    this.notify();
  }
  private startCharge(): void {
    if (
      this.mode === "battle" &&
      !this.paused &&
      this.gameTimeMs >= this.playerControlLockedUntil &&
      this.gameTimeMs >= this.playerStunnedUntil
    )
      this.isCharging = true;
  }
  private releaseCharge(): void {
    if (
      this.mode !== "battle" ||
      this.paused ||
      !this.isCharging ||
      this.gameTimeMs < this.playerControlLockedUntil ||
      this.gameTimeMs < this.playerStunnedUntil
    )
      return;
    const charge = this.charging;
    this.isCharging = false;
    this.charging = 0;
    const charged = charge >= 1;
    this.nextFireAt = this.gameTimeMs + 240;
    this.onEvent({ type: "attack", charged });
    this.spawnProjectile({
      owner: "player",
      motion: "straight",
      position: { ...this.playerGrid },
      direction: { col: 1, row: 0 },
      target: this.frontTarget()?.grid ?? null,
      damage: Math.round(
        (charged
          ? COMBAT_BALANCE.chargeShot.damage
          : COMBAT_BALANCE.chargeShot.shortDamage) *
          this.normalShotDamageMultiplier
      ),
      charged,
      speedCellsPerSecond: charged
        ? COMBAT_BALANCE.chargeShot.speedCellsPerSecond
        : COMBAT_BALANCE.normalShot.speedCellsPerSecond,
    });
    this.message = charged ? "正面へチャージ弾を発射" : "正面へ短射撃を発射";
    this.notify();
  }
  private cancelCharge(): void {
    this.isCharging = false;
    this.charging = 0;
  }

  private syncCustomRemaining(): void {
    this.customRemaining = this.customSystem.remainingSeconds();
  }

  private updateTerrainEffects(now: number): void {
    const playerPanel = this.panelSystem.get(this.playerGrid);
    if (
      playerPanel &&
      (playerPanel.terrain === "lava" || playerPanel.terrain === "poison") &&
      now >= this.nextPlayerTerrainDamageAt
    ) {
      this.nextPlayerTerrainDamageAt = now + 1000;
      this.applyPlayerHit(5, undefined, "terrain");
    }
    for (const enemy of this.enemies) {
      if (enemy.state === "deleted") continue;
      const panel = this.panelSystem.get(enemy.grid);
      if (
        panel &&
        (panel.terrain === "lava" || panel.terrain === "poison") &&
        now >= enemy.nextTerrainDamageAt
      ) {
        enemy.nextTerrainDamageAt = now + 1000;
        this.strikeEnemy(enemy, 5, undefined, false);
      }
    }
  }

  private applyPlayerEntryTerrain(position: GridPosition): void {
    const panel = this.panelSystem.get(position);
    if (!panel) return;
    if (panel.terrain === "lava") this.applyPlayerHit(10, undefined, "terrain");
    if (panel.terrain === "poison") this.applyPlayerHit(5, undefined, "terrain");
    if (panel.terrain === "lava" || panel.terrain === "poison")
      this.nextPlayerTerrainDamageAt = this.gameTimeMs + 1000;
  }

  private updatePendingRepair(now: number): void {
    if (!this.pendingRepair || now < this.pendingRepair.readyAt) return;
    const amount = this.pendingRepair.amount;
    this.pendingRepair = null;
    this.healPlayer(amount);
    this.emotionSystem.recover();
    this.message = `応急修復が完了 — HP${amount}回復`;
  }
  private updateForcedRepairDrain(now: number): void {
    if (!this.forcedRepairDrainActive || now < this.nextForcedRepairDrainAt)
      return;
    this.playerHp = Math.max(
      0,
      this.playerHp - COMBAT_BALANCE.overload.forcedRepairDrainPerSecond
    );
    this.nextForcedRepairDrainAt += 1000;
  }

  private useSkill(): void {
    if (
      this.mode !== "battle" ||
      this.paused ||
      this.queue.length === 0 ||
      this.gameTimeMs < this.playerControlLockedUntil ||
      this.gameTimeMs < this.playerStunnedUntil
    )
      return;
    const card = this.queue.shift();
    if (!card) return;
    this.cardsUsed += card.chainCardIds?.length ?? 1;
    if (card.isOverload) this.overloadCardsUsed += 1;
    if (card.power > 0) this.lastAttackCard = { ...card };
    const usedSync = this.sync;
    const rageReady = this.emotionSystem.snapshot(this.gameTimeMs).rageReady;
    const swordBonus = card.properties?.includes("剣")
      ? this.nextSwordMultiplier
      : 1;
    const power = Math.round(
      card.power * (usedSync || rageReady ? 2 : 1) * swordBonus
    );
    if (card.properties?.includes("剣")) this.nextSwordMultiplier = 1;
    const resolution = this.cardTargets(card);
    this.applyPlayerCardEffect(card, power);
    const attackTiles = this.dispatchCardAttack(card, power);
    const displayTiles =
      attackTiles.length > 0 ? attackTiles : resolution.tiles;
    this.onEvent({ type: "attack", charged: card.tier === "mega" });
    this.emitCardEvents(card, displayTiles);
    const hitstopDuration = card.tier === "mega" ? 105 : 55;
    this.hitstopRemainingMs = Math.max(
      this.hitstopRemainingMs,
      hitstopDuration
    );
    this.onEvent({
      type: "hitstop",
      duration: hitstopDuration,
      tier: card.tier,
    });
    let consumedEmotion: "synchronized" | "enraged" | null = null;
    if (card.power > 0 && card.chainTechniqueId !== "full-repair") {
      consumedEmotion = this.emotionSystem.consumePower(usedSync);
      if (usedSync) this.sync = false;
    }
    const multiplierLabel =
      usedSync || consumedEmotion === "synchronized"
        ? " — フルシンクロ×2"
        : consumedEmotion === "enraged"
          ? " — 激昂×2"
          : "";
    this.message = `${card.name} を送信${multiplierLabel}`;
    this.notify();
  }

  private dispatchCardAttack(card: Card, power: number): GridPosition[] {
    if (card.id === "overload-forced-repair" || card.id === "overload-collapse-field")
      return [];
    if (card.chainTechniqueId)
      return this.dispatchChainTechnique(card, power);
    if (card.power <= 0) return [];

    const action = getCardCombatProfile(card.id).actionId;
    const scaleDamage = (base: number): number =>
      Math.max(0, Math.round((base * power) / Math.max(1, card.power)));
    const origin = { ...this.playerGrid };
    const right = { col: 1, row: 0 };
    const enemies = this.enemies
      .filter(enemy => enemy.state !== "deleted")
      .map(enemy => enemy.grid);
    const preview = cardPreviewTiles(
      card,
      origin,
      enemies,
      this.panelSystem.snapshot()
    );
    this.applyElementalPanelInteraction(card.element, preview);
    const spawn = (
      options: Parameters<ProjectileSystem["spawn"]>[0],
      delayMs = 0
    ): void => {
      const activeAt = this.gameTimeMs + delayMs + (options.activeAt ?? 0);
      this.spawnProjectile({ ...options, activeAt });
    };
    const straight = (
      damage: number,
      options: Partial<Parameters<ProjectileSystem["spawn"]>[0]> = {},
      delayMs = 0
    ): GridPosition[] => {
      spawn({
        owner: "player",
        motion: "straight",
        position: origin,
        direction: right,
        damage: scaleDamage(damage),
        sourceCardId: card.id,
        ...options,
      }, delayMs);
      return preview;
    };
    const nearestTarget = nearestEnemyPosition(origin, enemies);
    const columnTarget = nearestTarget ?? {
      col: Math.min(5, origin.col + 2),
      row: origin.row,
    };
    const pointTarget = nearestTarget ?? {
      col: Math.min(5, Math.max(3, origin.col + 2)),
      row: origin.row,
    };

    if (action === "meteor") {
      const landingPanels = this.panelSystem
        .snapshot()
        .filter(panel => panel.owner === "enemy")
        .map(panel => ({ col: panel.col, row: panel.row }));
      const targets = landingPanels.length > 0
        ? landingPanels
        : [3, 4, 5].flatMap(col => [0, 1, 2].map(row => ({ col, row })));
      for (let index = 0; index < COMBAT_BALANCE.upper.meteorCount; index += 1) {
        const target = targets[index % targets.length];
        spawn({
          owner: "player",
          motion: "thrown",
          position: origin,
          target,
          damage: scaleDamage(COMBAT_BALANCE.upper.meteorDamage),
          sourceCardId: card.id,
          flightMs: COMBAT_BALANCE.upper.meteorFlightMs,
          stopOnObject: false,
        }, index * COMBAT_BALANCE.upper.meteorIntervalMs);
      }
      return preview;
    }
    if (action === "overdrive") {
      this.beginOverdrive(pointTarget, power);
      return [pointTarget];
    }
    if (["slash", "sweep", "dashslash", "gridcut", "moonblade"].includes(action))
      return this.dispatchMeleeCard(card, power);
    if (action === "dream" || action === "sanctuary") return [];

    if (action === "overload-limit-cannon") {
      const lostHp = Math.max(0, this.playerMaxHp - this.playerHp);
      return straight(Math.min(COMBAT_BALANCE.overload.limitCannonMaxDamage, Math.max(1, lostHp * 2)));
    }
    if (action === "overload-contamination")
      return straight(COMBAT_BALANCE.overload.contaminationDamage, { splashRadius: 1, stopOnObject: false });
    if (action === "rapid") {
      for (let index = 0; index < 3; index += 1) straight(12, {}, index * 90);
      return preview;
    }
    if (action === "lance") {
      straight(60, { motion: "piercing", stopOnObject: false });
      return preview;
    }
    if (action === "seeker") {
      straight(45);
      return preview;
    }
    if (action === "triplet") {
      for (let index = 0; index < 3; index += 1) straight(20, {}, index * 160);
      return preview;
    }
    if (action === "wide" || action === "frost") {
      straight(action === "wide" ? 40 : 35, { motion: "wave", rowSpan: true, stopOnObject: false });
      if (action === "frost") this.freezeEmptyEnemyPanels();
      return preview;
    }
    if (action === "column" || action === "fireline" || action === "thunderline") {
      const targetColumn = action === "fireline" ? Math.min(5, origin.col + 2) : columnTarget.col;
      spawn({
        owner: "player",
        motion: "thrown",
        position: origin,
        target: { col: targetColumn, row: origin.row },
        damage: scaleDamage(action === "column" ? 55 : 40),
        sourceCardId: card.id,
        rowSpan: true,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      return columnAtPreview(targetColumn);
    }
    if (action === "cross") {
      straight(40);
      straight(20, { splashRadius: 1, splashShape: "cross", stopOnObject: false });
      return preview;
    }
    if (action === "fan") {
      for (const direction of [{ col: 1, row: 0 }, { col: 1, row: -1 }, { col: 1, row: 1 }])
        spawn({ owner: "player", motion: "straight", position: origin, direction, damage: scaleDamage(30), sourceCardId: card.id });
      return preview;
    }
    if (action === "ember") {
      straight(50);
      return preview;
    }
    if (action === "icewall") {
      spawn({
        owner: "player",
        motion: "thrown",
        position: origin,
        target: pointTarget,
        damage: scaleDamage(40),
        sourceCardId: card.id,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
        stopOnObject: false,
        affectsObjects: false,
      });
      return [pointTarget];
    }
    if (action === "volt") {
      spawn({ owner: "player", motion: "homing", position: origin, direction: right, damage: scaleDamage(45), sourceCardId: card.id, speedCellsPerSecond: 8 });
      return preview;
    }
    if (action === "root") {
      straight(45);
      return preview;
    }
    if (action === "web") {
      const topLeft = { col: Math.max(3, Math.min(4, pointTarget.col)), row: Math.max(0, Math.min(1, pointTarget.row)) };
      spawn({
        owner: "player",
        motion: "thrown",
        position: origin,
        target: topLeft,
        damage: scaleDamage(25),
        sourceCardId: card.id,
        splashRadius: 1,
        splashShape: "two-by-two",
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      return preview;
    }
    if (card.family === "射撃" || card.family === "属性" || card.family === "範囲" || card.family === "高出力") {
      straight(power, { motion: card.family === "範囲" ? "wave" : "straight", rowSpan: card.family === "範囲" });
      return preview;
    }
    return [];
  }
  private dispatchChainTechnique(
    card: Card,
    power: number
  ): GridPosition[] {
    const technique = CHAIN_TECHNIQUES.find(
      candidate => candidate.id === card.chainTechniqueId
    );
    if (!technique) return [];
    this.usedChainTechniques.push(technique.id);

    const origin = { ...this.playerGrid };
    const activeEnemies = this.enemies.filter(
      enemy => enemy.state !== "deleted"
    );
    const enemyPositions = activeEnemies.map(enemy => ({ ...enemy.grid }));
    const target = this.cardPointTarget();
    const sourceCard = (id: string): Card | undefined => this.cardForSource(id);
    const scale = (damage: number): number =>
      Math.max(0, Math.round(damage * Math.max(1, power)));

    if (technique.id === "rapid-barrage") {
      for (let index = 0; index < COMBAT_BALANCE.chain.rapidCount; index += 1) {
        this.spawnProjectile({
          owner: "player",
          motion: "straight",
          position: origin,
          direction: { col: 1, row: 0 },
          damage: scale(COMBAT_BALANCE.chain.rapidDamage),
          sourceCardId: "rapid",
          activeAt:
            this.gameTimeMs + index * COMBAT_BALANCE.chain.rapidIntervalMs,
          speedCellsPerSecond: COMBAT_BALANCE.normalShot.speedCellsPerSecond,
        });
      }
      return cardPreviewTiles(
        sourceCard("rapid"),
        origin,
        enemyPositions,
        this.panelSystem.snapshot()
      );
    }

    if (technique.id === "triple-moon") {
      const firstPlan = createMeleePlan(origin, target, 0, 1, {
        dash: true,
        timing: {
          startupMs: COMBAT_BALANCE.chain.tripleMoonStartupMs,
          activeMs: COMBAT_BALANCE.chain.tripleMoonActiveMs,
          recoveryMs: COMBAT_BALANCE.chain.tripleMoonRecoveryMs,
        },
        canEnter: position => this.canEnterTemporaryMeleePosition(position),
      });
      const meleeOrigin = firstPlan.dashTo ?? origin;
      const stageCards = ["slash", "sweep", "moonblade"];
      const stageDamage = [80, 100, 140];
      const stages: PendingMeleeStage[] = stageCards.map((cardId, index) => {
        const stageCard = sourceCard(cardId);
        const stageOrigin = { ...meleeOrigin };
        const stageTiles =
          cardId === "sweep"
            ? columnAtPreview(stageOrigin.col + 1)
            : createMeleePlan(
                stageOrigin,
                target,
                0,
                cardId === "moonblade" ? 2 : 1,
                { dash: false }
              ).tiles;
        return {
          activeAt:
            this.gameTimeMs +
            COMBAT_BALANCE.chain.tripleMoonStartupMs +
            index * COMBAT_BALANCE.chain.tripleMoonStageGapMs,
          tiles: stageTiles,
          damage: scale(stageDamage[index] ?? 0),
          resolved: false,
          card: stageCard,
        };
      });
      const recoveryAt =
        Math.max(...stages.map(stage => stage.activeAt)) +
        COMBAT_BALANCE.chain.tripleMoonActiveMs +
        COMBAT_BALANCE.chain.tripleMoonRecoveryMs;
      this.pendingMelee.push({
        card: sourceCard("slash") ?? card,
        stages,
        dashTo: firstPlan.dashTo,
        returnTo: firstPlan.returnTo,
        recoveryAt,
        dashApplied: false,
      });
      this.playerControlLockedUntil = Math.max(
        this.playerControlLockedUntil,
        recoveryAt
      );
      return uniqueTiles(stages.flatMap(stage => stage.tiles));
    }

    if (technique.id === "fire-requiem") {
      const ember = sourceCard("ember");
      const firelineTarget = {
        col: Math.min(5, origin.col + 2),
        row: target.row,
      };
      this.spawnProjectile({
        owner: "player",
        motion: "straight",
        position: origin,
        direction: { col: 1, row: 0 },
        damage: scale(50),
        sourceCardId: "ember",
        activeAt: this.gameTimeMs,
      });
      this.spawnProjectile({
        owner: "player",
        motion: "thrown",
        position: origin,
        target: firelineTarget,
        damage: scale(40),
        sourceCardId: "fireline",
        activeAt: this.gameTimeMs + COMBAT_BALANCE.chain.fireChainStepGapMs,
        rowSpan: true,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      this.pendingChainEffects.push({
        at:
          this.gameTimeMs +
          COMBAT_BALANCE.chain.fireChainStepGapMs * 2,
        kind: "place-bomb",
        panel: { ...target },
        sourceCardId: "timer",
        damage: scale(90),
      });
      return uniqueTiles([
        ...cardPreviewTiles(ember, origin, enemyPositions),
        ...columnAtPreview(firelineTarget.col),
        ...this.areaAround(target),
      ]);
    }

    if (technique.id === "tree-prison") {
      const enemyIds = activeEnemies.map(enemy => enemy.id);
      activeEnemies.forEach(enemy =>
        this.applyStatus(
          enemy,
          "root",
          COMBAT_BALANCE.chain.treePrisonDurationMs
        )
      );
      this.pendingChainEffects.push({
        at: this.gameTimeMs + COMBAT_BALANCE.chain.treePrisonDurationMs,
        kind: "tree-prison",
        enemyIds,
        sourceCardId: "web",
        damage: scale(COMBAT_BALANCE.chain.treePrisonDamage),
      });
      return [3, 4, 5].flatMap(col =>
        [0, 1, 2].map(row => ({ col, row }))
      );
    }

    if (technique.id === "ground-collapse") {
      const enemyPanels = this.panelSystem.snapshot().filter(
        panel => panel.owner === "enemy"
      );
      enemyPanels.forEach(panel => {
        this.panelSystem.crack(panel);
        if (panel.occupantId === null && panel.objectId === null)
          this.panelSystem.setTerrain(
            panel,
            "hole",
            this.gameTimeMs,
            COMBAT_BALANCE.chain.groundCollapseHoleMs
          );
      });
      return enemyPanels.map(panel => ({ col: panel.col, row: panel.row }));
    }

    if (technique.id === "magnetic-encircle") {
      activeEnemies.forEach(enemy => {
        this.strikeEnemy(
          enemy,
          scale(COMBAT_BALANCE.chain.lightningMagneticDamage),
          sourceCard("volt"),
          false,
          0,
          "electric"
        );
        if (enemy.state !== "deleted")
          this.applyStatus(
            enemy,
            "stun",
            COMBAT_BALANCE.chain.lightningMagneticStunMs
          );
      });
      this.barrier = Math.min(
        220,
        this.barrier + scale(COMBAT_BALANCE.chain.lightningMagneticBarrier)
      );
      this.electromagneticBarrierActive = true;
      return activeEnemies.length > 0
        ? activeEnemies.map(enemy => ({ ...enemy.grid }))
        : [3, 4, 5].flatMap(col =>
            [0, 1, 2].map(row => ({ col, row }))
          );
    }

    if (technique.id === "layered-defense") {
      this.placeFieldObject(
        "cube",
        { col: origin.col + 1, row: origin.row },
        100,
        null,
        "damage",
        {
          sourceCardId: "block",
          collision: "solid",
          fallback: false,
        }
      );
      this.barrier = Math.min(
        220,
        this.barrier + scale(COMBAT_BALANCE.chain.layeredDefenseBarrier)
      );
      this.pendingDefense = "substitute";
      this.pendingDefenseUntil = 0;
      return uniqueTiles([
        { ...origin },
        { col: origin.col + 1, row: origin.row },
      ]);
    }

    if (technique.id === "full-repair") {
      this.healPlayer(COMBAT_BALANCE.chain.fullRepairHeal);
      this.pendingRepair = null;
      this.pendingDefense = null;
      this.pendingDefenseUntil = 0;
      this.enemies.forEach(enemy => {
        enemy.burnUntil = 0;
        enemy.nextBurnAt = 0;
        enemy.slowUntil = 0;
        enemy.rootUntil = 0;
      });
      this.paintPlayerTerritory(COMBAT_BALANCE.chain.fullRepairSanctuaryMs);
      return this.panelSystem
        .snapshot()
        .filter(panel => panel.owner === "player")
        .map(panel => ({ col: panel.col, row: panel.row }));
    }

    return [];
  }

  private emitCardEvents(card: Card, tiles: GridPosition[]): void {
    const ids = card.chainCardIds ?? [card.id];
    const origin = { ...this.playerGrid };
    const enemies = this.enemies
      .filter(enemy => enemy.state !== "deleted")
      .map(enemy => enemy.grid);
    const panels = this.panelSystem.snapshot();
    ids.forEach(cardId => {
      const source = this.cardForSource(cardId);
      if (!source) return;
      const sourcePreview = cardPreviewTiles(source, origin, enemies, panels);
      const sourceTiles =
        card.chainTechniqueId === undefined
          ? tiles
          : sourcePreview.length > 0
            ? sourcePreview
            : tiles;
      this.onEvent({
        type: "card",
        cardId: source.id,
        at: { ...(sourceTiles[0] ?? origin) },
        tiles: sourceTiles,
        family: source.family,
        tier: card.tier,
        target: source.target,
        status: source.status,
      });
    });
  }

  private updatePendingChainEffects(now: number): void {
    const ready = this.pendingChainEffects.filter(effect => now >= effect.at);
    if (ready.length === 0) return;
    this.pendingChainEffects = this.pendingChainEffects.filter(
      effect => now < effect.at
    );
    ready.forEach(effect => {
      if (effect.kind === "place-bomb") {
        this.placeFieldObject(
          "bomb",
          effect.panel ?? this.closestEmptyEnemyPanel(),
          50,
          2000,
          "timer",
          {
            effectId: "timed-bomb",
            damage: effect.damage,
            sourceCardId: effect.sourceCardId,
            collision: "passable",
            pushable: true,
          }
        );
        return;
      }
      effect.enemyIds?.forEach(enemyId => {
        const enemy = this.enemies.find(
          candidate =>
            candidate.id === enemyId && candidate.state !== "deleted"
        );
        if (enemy)
          this.strikeEnemy(
            enemy,
            effect.damage,
            this.cardForSource(effect.sourceCardId),
            false,
            0,
            "wood"
          );
      });
    });
  }

  private beginOverdrive(target: GridPosition, power: number): void {
    const targetEnemy = this.enemies.find(
      enemy => enemy.state !== "deleted" && sameTile(enemy.grid, target)
    );
    this.transferPlayerToCardTarget();
    this.nextSwordMultiplier = 1;
    this.overdrivePrompt = {
      enemyId: targetEnemy?.id ?? null,
      target: { ...target },
      step: 0,
      expiresAt: this.gameTimeMs + COMBAT_BALANCE.upper.overdriveInputWindowMs,
      damageMultiplier: power / 70 >= 2 ? 2 : 1,
    };
    this.message = "超過駆動 — 1/3の入力を受け付け中";
  }

  private updateOverdrivePrompt(now: number): void {
    if (!this.overdrivePrompt || now <= this.overdrivePrompt.expiresAt) return;
    const step = this.overdrivePrompt.step;
    this.overdrivePrompt = null;
    this.message = `超過駆動 — ${step}/${COMBAT_BALANCE.upper.overdriveStepCount}で終了`;
  }

  private resolveOverdriveInput(): void {
    const prompt = this.overdrivePrompt;
    if (!prompt || this.gameTimeMs > prompt.expiresAt) return;
    const enemy = prompt.enemyId
      ? this.enemies.find(candidate => candidate.id === prompt.enemyId)
      : undefined;
    if (enemy && enemy.state !== "deleted")
      this.strikeEnemy(
        enemy,
        Math.round(
          COMBAT_BALANCE.upper.overdriveDamagePerStep *
            prompt.damageMultiplier
        ),
        this.cardForSource("overdrive"),
        false
      );
    const nextStep = prompt.step + 1;
    if (nextStep >= COMBAT_BALANCE.upper.overdriveStepCount) {
      this.areaAround(prompt.target).forEach(tile => this.panelSystem.crack(tile));
      this.overdrivePrompt = null;
      this.message = "超過駆動 — 3段入力完了、周囲を亀裂化";
    } else {
      this.overdrivePrompt = {
        ...prompt,
        step: nextStep,
        expiresAt:
          this.gameTimeMs + COMBAT_BALANCE.upper.overdriveInputWindowMs,
      };
      this.message = `超過駆動 — ${nextStep + 1}/${COMBAT_BALANCE.upper.overdriveStepCount}の入力を受け付け中`;
    }
    this.notify();
  }

  private canEnterTemporaryMeleePosition(position: GridPosition): boolean {
    const panel = this.panelSystem.get(position);
    return Boolean(
      panel &&
        panel.terrain !== "hole" &&
        panel.occupantId === null &&
        !this.objectSystem.isSolidAt(position)
    );
  }

  private dispatchMeleeCard(card: Card, power: number): GridPosition[] {
    const action = getCardCombatProfile(card.id).actionId;
    const target =
      action === "dashslash"
        ? (this.closestEnemy()?.grid ?? null)
        : action === "gridcut"
          ? this.cardPointTarget()
          : (this.frontTarget()?.grid ?? null);
    const startupMs = action === "moonblade" ? 380 : action === "gridcut" ? 120 : 90;
    const activeMs = action === "moonblade" ? 110 : 80;
    const recoveryMs = action === "moonblade" ? 420 : 180;
    const plan = createMeleePlan(this.playerGrid, target, power, getMeleeRange(card), {
      dash: action === "dashslash",
      timing: { startupMs, activeMs, recoveryMs },
      canEnter: position => this.canEnterTemporaryMeleePosition(position),
    });
    const scaleDamage = (base: number): number =>
      Math.max(0, Math.round((base * power) / Math.max(1, card.power)));
    const stages: PendingMeleeStage[] =
      action === "sweep"
        ? [{ activeAt: this.gameTimeMs + startupMs, tiles: columnAtPreview(this.playerGrid.col + 1), damage: scaleDamage(70), resolved: false }]
        : action === "gridcut"
          ? (() => {
              const point = target ?? { col: Math.min(5, this.playerGrid.col + 2), row: this.playerGrid.row };
              return [
                {
                  activeAt: this.gameTimeMs + startupMs,
                  tiles: Array.from({ length: 3 }, (_, index) => ({ col: point.col - 1 + index, row: point.row }))
                    .filter(position => position.col >= 0 && position.col < 6),
                  damage: scaleDamage(50),
                  resolved: false,
                },
                {
                  activeAt: this.gameTimeMs + startupMs + 140,
                  tiles: columnAtPreview(point.col),
                  damage: scaleDamage(50),
                  resolved: false,
                },
              ];
            })()
          : [{
              activeAt: this.gameTimeMs + startupMs,
              tiles: plan.tiles,
              damage: scaleDamage(action === "slash" ? 80 : action === "dashslash" ? 100 : 140),
              resolved: false,
            }];
    const recoveryAt = Math.max(...stages.map(stage => stage.activeAt)) + activeMs + recoveryMs;
    this.pendingMelee.push({ card, stages, dashTo: plan.dashTo, returnTo: plan.returnTo, recoveryAt, dashApplied: false });
    this.playerControlLockedUntil = Math.max(this.playerControlLockedUntil, recoveryAt);
    return stages.flatMap(stage => stage.tiles).filter((tile, index, all) =>
      all.findIndex(candidate => sameTile(candidate, tile)) === index
    );
  }
  private updateMeleeAttacks(now: number): void {
    for (const attack of this.pendingMelee) {
      const firstStage = attack.stages[0];
      if (!attack.dashApplied && attack.dashTo && firstStage && now >= firstStage.activeAt) {
        const previous = { ...this.playerGrid };
        this.panelSystem.vacate(previous, now);
        this.playerGrid = { ...attack.dashTo };
        this.panelSystem.occupy(this.playerGrid, "player");
        attack.dashApplied = true;
      }
      for (const stage of attack.stages) {
        if (stage.resolved || now < stage.activeAt) continue;
        this.enemies
          .filter(enemy => enemy.state !== "deleted" && stage.tiles.some(tile => sameTile(tile, enemy.grid)))
          .forEach(enemy =>
            this.strikeEnemy(
              enemy,
              stage.damage,
              stage.card ?? attack.card,
              false
            )
          );
        stage.resolved = true;
      }
    }
    this.pendingMelee = this.pendingMelee.filter(attack => {
      if (now < attack.recoveryAt) return true;
      if (attack.dashTo && sameTile(attack.dashTo, this.playerGrid)) {
        this.panelSystem.vacate(this.playerGrid, now);
        const safe = this.panelSystem.findNearestSafePosition(
          attack.returnTo ?? this.playerGrid,
          "player",
          position => this.objectSystem.isSolidAt(position)
        );
        this.playerGrid = safe ?? attack.returnTo ?? this.playerGrid;
        this.panelSystem.occupy(this.playerGrid, "player");
      }
      return false;
    });
  }
  private spawnProjectile(
    spawn: Parameters<ProjectileSystem["spawn"]>[0]
  ): ProjectileState {
    const projectile = this.projectileSystem.spawn(spawn, this.gameTimeMs);
    const to = spawn.target ?? {
      col:
        projectile.direction.col < 0
          ? 0
          : projectile.direction.col > 0
            ? 5
            : projectile.position.col,
      row:
        projectile.direction.row < 0
          ? 0
          : projectile.direction.row > 0
            ? 2
            : projectile.position.row,
    };
    this.onEvent({
      type: "projectile",
      id: projectile.id,
      motion: projectile.motion,
      from: { ...projectile.origin },
      to: { ...to },
      side: projectile.owner,
      charged: projectile.charged,
    });
    return projectile;
  }
  private resolutionTilesFor(
    shape: TargetShape,
    origin: GridPosition
  ): GridPosition[] {
    if (shape === "column")
      return [0, 1, 2].map(row => ({ col: Math.min(5, origin.col + 2), row }));
    if (shape === "enemy-field")
      return [3, 4, 5].flatMap(col => [0, 1, 2].map(row => ({ col, row })));
    return [3, 4, 5].map(col => ({ col, row: origin.row }));
  }
  private resolveProjectileCollision(
    projectile: ProjectileState,
    positions: GridPosition[]
  ): { targetIds: string[]; objectId: string | null; stop: boolean } {
    const targetIds =
      projectile.owner === "player"
        ? this.enemies
            .filter(
              enemy =>
                enemy.state !== "deleted" &&
                positions.some(position => sameTile(position, enemy.grid))
            )
            .map(enemy => enemy.id)
        : positions.some(position => sameTile(position, this.playerGrid))
          ? ["player"]
          : [];
    const object = positions
      .map(position => this.objectSystem.getAt(position))
      .find(candidate => candidate !== undefined);
    return {
      targetIds,
      objectId: object?.id ?? null,
      stop: object?.collision === "solid",
    };
  }
  private findHomingTarget(projectile: ProjectileState): GridPosition | null {
    if (projectile.owner === "enemy")
      return projectile.target ? { ...projectile.target } : null;
    return (
      this.enemies
        .filter(enemy => enemy.state !== "deleted")
        .sort(
          (a, b) =>
            Math.abs(a.grid.col - projectile.position.col) +
            Math.abs(a.grid.row - projectile.position.row) -
            (Math.abs(b.grid.col - projectile.position.col) +
              Math.abs(b.grid.row - projectile.position.row))
        )[0]?.grid ?? null
    );
  }
  private applyProjectileResolution(
    projectile: ProjectileState,
    targetIds: string[],
    objectId: string | null
  ): void {
    if (projectile.sourceCardId === "meteor")
      this.panelSystem.crack(projectile.position);
    if (objectId && projectile.affectsObjects) {
      const objectResult = this.objectSystem.damage(
        objectId,
        projectile.damage
      );
      if (objectResult.destroyed && objectResult.object) {
        this.panelSystem.detachObject(
          objectResult.object.panel,
          objectResult.object.id
        );
        this.objectNextTriggerAt.delete(objectResult.object.id);
        this.objectTriggerCount.delete(objectResult.object.id);
        this.onEvent({
          type: "impact",
          at: { ...objectResult.object.panel },
          side: projectile.owner,
          damage: projectile.damage,
        });
      }
    }
    if (projectile.owner === "player") {
      const card = projectile.sourceCardId
        ? [...CARD_CATALOG, ...OVERLOAD_CARDS].find(
            candidate => candidate.id === projectile.sourceCardId
          )
        : undefined;
      targetIds
        .map(id => this.enemies.find(enemy => enemy.id === id))
        .filter((enemy): enemy is Enemy => Boolean(enemy))
        .forEach(enemy => {
          const frontalShot =
            projectile.motion === "straight" &&
            projectile.direction.col > 0 &&
            projectile.direction.row === 0;
          const shouldReflect =
            enemy.definitionId === "mirror-node" &&
            enemy.defense === "reflect" &&
            frontalShot &&
            !card?.properties?.includes("破砕") &&
            ["idle", "startup", "counter-window"].includes(enemy.actionPhase);
          if (shouldReflect) {
            this.reflectPlayerProjectile(enemy, projectile);
            return;
          }
          this.strikeEnemy(enemy, projectile.damage, card, projectile.charged);
        });
      return;
    }
    if (targetIds.includes("player")) {
      const sourceEnemy = projectile.sourceId
        ? this.enemies.find(enemy => enemy.id === projectile.sourceId)
        : undefined;
      const action = sourceEnemy
        ? getEnemyDefinition(sourceEnemy.definitionId)?.actions.find(
            candidate => candidate.id === projectile.sourceActionId
          )
        : undefined;
      this.applyPlayerHit(projectile.damage, projectile.sourceId ?? undefined);
      if (projectile.sourceActionId === "scanner-signal-lock") {
        this.playerBlindUntil = Math.max(this.playerBlindUntil, this.gameTimeMs + 900);
        this.message = "追尾信号弾 — 目隠し";
      }
      if (projectile.sourceActionId === "sentinel-chain-bolt") {
        this.playerStunnedUntil = Math.max(this.playerStunnedUntil, this.gameTimeMs + 500);
        this.message = "連鎖電撃 — 麻痺";
      }
      if (action?.status === "stun") {
        this.playerStunnedUntil = Math.max(
          this.playerStunnedUntil,
          this.gameTimeMs + (action.statusDurationMs ?? 0)
        );
        this.message = action.name + " — 麻痺";
      }
      if (action?.status === "root") {
        this.playerControlLockedUntil = Math.max(
          this.playerControlLockedUntil,
          this.gameTimeMs + (action.statusDurationMs ?? 0)
        );
        this.message = action.name + " — 拘束";
      }
    }
  }
  private activateSubstitute(): void {
    const previous = { ...this.playerGrid };
    this.panelSystem.vacate(previous, this.gameTimeMs);
    const candidates = [
      { col: previous.col + 1, row: previous.row },
      { col: previous.col - 1, row: previous.row },
      { col: previous.col, row: previous.row + 1 },
      { col: previous.col, row: previous.row - 1 },
    ];
    const destination = candidates.find(position => {
      const panel = this.panelSystem.get(position);
      return panel?.owner === "player" && panel.terrain !== "hole" && panel.occupantId === null && panel.objectId === null;
    });
    if (!destination) {
      this.panelSystem.occupy(previous, "player");
      return;
    }
    this.playerGrid = destination;
    this.panelSystem.occupy(this.playerGrid, "player");
    this.placeFieldObject(
      "field-device",
      previous,
      1,
      2000,
      "none",
      { effectId: "decoy", collision: "passable", fallback: false }
    );
    this.message = "身代わり膜 — 囮を残して退避";
    this.onEvent({
      type: "player-reaction",
      at: { ...this.playerGrid },
      kind: "dodge",
    });
  }

  private triggerElectromagneticBurst(enemyId?: string): void {
    const targets = this.enemies.filter(
      enemy =>
        enemy.state !== "deleted" &&
        Math.abs(enemy.grid.col - this.playerGrid.col) <= 1 &&
        Math.abs(enemy.grid.row - this.playerGrid.row) <= 1
    );
    targets.forEach(enemy => {
      this.strikeEnemy(enemy, 40, undefined, false, 0, "electric");
      if (enemy.state !== "deleted") this.applyStatus(enemy, "stun", 500);
    });
    this.message = "電磁防壁 — 周囲へ放電";
    this.onEvent({
      type: "impact",
      at: { ...this.playerGrid },
      side: "player",
      enemyId,
      damage: 40,
    });
  }
  private applyPlayerHit(
    damage: number,
    enemyId?: string,
    source: "direct" | "terrain" = "direct",
    ignoreDamageInvulnerability = false
  ): void {
    const now = this.gameTimeMs;
    const terrainDamage = source === "terrain";
    if (!terrainDamage) {
      if (this.pendingRepair) {
        this.pendingRepair = null;
        this.message = "応急修復失敗 — 準備中に被弾";
      }
      if (this.pendingDefense === "premonition" && now >= this.pendingDefenseUntil) {
        this.pendingDefense = null;
        this.pendingDefenseUntil = 0;
      }
      if (this.pendingDefense === "substitute") {
        this.pendingDefense = null;
        this.pendingDefenseUntil = 0;
        this.activateSubstitute();
        return;
      }
      if (
        this.pendingDefense === "return" ||
        (this.pendingDefense === "premonition" && now < this.pendingDefenseUntil)
      ) {
        const defense = this.pendingDefense;
        const counterDamage = defense === "return" ? 80 : 120;
        this.pendingDefense = null;
        this.pendingDefenseUntil = 0;
        const sourceEnemy = enemyId
          ? this.enemies.find(enemy => enemy.id === enemyId)
          : undefined;
        if (sourceEnemy && sourceEnemy.state !== "deleted")
          this.strikeEnemy(sourceEnemy, counterDamage, undefined, false);
        this.message = defense === "return" ? "返し手裏剣 — 攻撃を反射" : "予知反撃 — 攻撃を反射";
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "counter",
          enemyId,
          damage: counterDamage,
        });
        return;
      }
      if (now < this.dreamAuraUntil) {
        if (damage < COMBAT_BALANCE.upper.dreamAuraThreshold) {
          this.message = "夢幻障壁 — 100未満の攻撃を無効化";
          this.onEvent({
            type: "player-reaction",
            at: { ...this.playerGrid },
            kind: "barrier",
            enemyId,
          });
          return;
        }
        this.dreamAuraUntil = 0;
        this.message = "夢幻障壁 — 強攻撃でオーラが消滅";
      }
      if (now < this.phaseUntil || now < this.invincibleUntil) {
        this.message = "位相回避";
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "phase",
          enemyId,
        });
        return;
      }
      if (!ignoreDamageInvulnerability && now < this.playerDamageInvulnerableUntil)
        return;
    }

    let incoming = Math.max(0, damage);
    const panel = this.panelSystem.get(this.playerGrid);
    if (panel?.terrain === "holy") incoming = Math.ceil(incoming / 2);
    let remaining = incoming;
    const barrierBefore = this.barrier;
    if (this.barrier > 0) {
      const absorbed = Math.min(this.barrier, remaining);
      this.barrier -= absorbed;
      remaining -= absorbed;
      this.message = remaining > 0 ? "障壁損傷" : "障壁防御";
      if (absorbed > 0)
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "barrier",
          enemyId,
          damage: absorbed,
        });
    }
    const sourceEnemy = enemyId
      ? this.enemies.find(enemy => enemy.id === enemyId)
      : undefined;
    const electromagneticContact =
      !terrainDamage &&
      this.electromagneticBarrierActive &&
      barrierBefore > 0 &&
      Boolean(sourceEnemy && sameTile(sourceEnemy.grid, this.playerGrid));
    const electromagneticBroken =
      !terrainDamage &&
      this.electromagneticBarrierActive &&
      barrierBefore > 0 &&
      this.barrier === 0;

    if (remaining > 0) {
      this.recordPlayerDamage(remaining);
      this.playerHp = Math.max(0, this.playerHp - remaining);
      if (!terrainDamage) {
        this.playerControlLockedUntil =
          now + COMBAT_BALANCE.playerHit.controlLockMs;
        this.playerDamageInvulnerableUntil =
          now + COMBAT_BALANCE.playerHit.invulnerableMs;
      }
      this.sync = false;
      this.emotionSystem.recordDamage(
        now,
        remaining,
        this.playerHp,
        this.playerMaxHp
      );
      if (!terrainDamage && this.emotionSystem.isRageStaggerImmune(now))
        this.playerControlLockedUntil = now;
      this.message = terrainDamage ? "危険地形 — 耐久を消耗" : "被弾 — 退避してください";
      this.onEvent({
        type: "impact",
        at: { ...this.playerGrid },
        side: "enemy",
        enemyId,
        damage: remaining,
      });
      if (!terrainDamage)
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "damage",
          enemyId,
          damage: remaining,
        });
    }
    if (electromagneticBroken || electromagneticContact) {
      this.electromagneticBarrierActive = false;
      this.triggerElectromagneticBurst(enemyId);
    }
  }
  private healPlayer(amount: number): void {
    const adjusted = Math.floor(
      Math.max(0, amount) * this.emotionSystem.healMultiplier()
    );
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + adjusted);
  }
  private updateFieldObjects(now: number): void {
    const expiring = this.objectSystem
      .snapshot()
      .filter(object => object.expiresAt !== null && now >= object.expiresAt);
    expiring
      .filter(object => object.effectId === "timed-bomb")
      .forEach(object =>
        this.triggerObjectExplosion(
          object.panel,
          object.damage ?? 90,
          object.sourceCardId
        )
      );
    expiring
      .filter(object => object.effectId === "enemy-bomb")
      .forEach(object => {
        this.triggerEnemyObjectExplosion(
          object.panel,
          object.damage ?? 26,
          object.sourceId
        );
        this.removeFieldObject(object.id);
      });

    for (const object of this.objectSystem.snapshot()) {
      if (object.expiresAt !== null && now >= object.expiresAt) continue;
      const nextTriggerAt = this.objectNextTriggerAt.get(object.id) ?? now;
      if (now < nextTriggerAt) continue;
      const sourceCard = this.cardForSource(object.sourceCardId);
      if (object.effectId === "enemy-mine") {
        if (sameTile(object.panel, this.playerGrid)) {
          this.removeFieldObject(object.id);
          this.applyPlayerHit(object.damage ?? 28, object.sourceId);
        }
        continue;
      }
      if (object.effectId === "watch-mine") {
        const target = this.enemies.find(
          enemy =>
            enemy.state !== "deleted" && sameTile(enemy.grid, object.panel)
        );
        if (target) {
          this.triggerObjectExplosion(object.panel, object.damage ?? 100, object.sourceCardId);
          if (target.state !== "deleted") this.applyStatus(target, "stun", 500);
          this.removeFieldObject(object.id);
        }
        continue;
      }
      if (object.effectId === "stake") {
        const targets = this.enemies.filter(
          enemy =>
            enemy.state !== "deleted" &&
            Math.abs(enemy.grid.col - object.panel.col) <= 1 &&
            Math.abs(enemy.grid.row - object.panel.row) <= 1
        );
        if (targets.length > 0) {
          targets.forEach(enemy => {
            this.strikeEnemy(enemy, object.damage ?? 10, sourceCard, false);
            if (enemy.state !== "deleted")
              enemy.rootUntil = Math.max(enemy.rootUntil, now + 800);
          });
          const count = (this.objectTriggerCount.get(object.id) ?? 0) + 1;
          this.objectTriggerCount.set(object.id, count);
          if (count >= 5) this.removeFieldObject(object.id);
          else this.objectNextTriggerAt.set(object.id, now + 800);
        }
        continue;
      }
      if (object.effectId === "turret") {
        const target = this.closestEnemy();
        if (target) {
          this.spawnProjectile({
            owner: "player",
            motion: "straight",
            position: { ...object.panel },
            target: { ...target.grid },
            direction: {
              col: Math.sign(target.grid.col - object.panel.col),
              row: Math.sign(target.grid.row - object.panel.row),
            },
            damage: object.damage ?? 12,
            sourceCardId: object.sourceCardId ?? null,
            speedCellsPerSecond: COMBAT_BALANCE.normalShot.speedCellsPerSecond,
          });
          this.objectNextTriggerAt.set(object.id, now + 400);
        }
        continue;
      }
      if (object.effectId === "poison-mist") {
        this.enemies
          .filter(enemy =>
            enemy.state !== "deleted" &&
            Math.abs(enemy.grid.col - object.panel.col) <= 1 &&
            Math.abs(enemy.grid.row - object.panel.row) <= 1
          )
          .forEach(enemy =>
            this.strikeEnemy(enemy, object.damage ?? 8, sourceCard, false)
          );
        this.objectNextTriggerAt.set(object.id, now + 1000);
        continue;
      }
      if (object.effectId === "gravity-field") {
        this.pullEnemiesTo(object.panel);
        this.objectNextTriggerAt.set(object.id, now + 800);
        continue;
      }
      if (object.kind === "field-device" && object.trigger === "contact") {
        this.enemies
          .filter(
            enemy =>
              enemy.state !== "deleted" &&
              Math.abs(enemy.grid.col - object.panel.col) <= 1 &&
              Math.abs(enemy.grid.row - object.panel.row) <= 1
          )
          .forEach(enemy => this.strikeEnemy(enemy, 8, sourceCard, false));
        this.objectNextTriggerAt.set(object.id, now + 1000);
      }
    }
    this.objectSystem.update(now).forEach(object => {
      this.panelSystem.detachObject(object.panel, object.id);
      this.objectNextTriggerAt.delete(object.id);
      this.objectTriggerCount.delete(object.id);
    });
    this.syncBoardOccupancy();
  }
  private triggerObjectExplosion(
    panel: GridPosition,
    damage: number,
    sourceCardId?: string
  ): void {
    const sourceCard = this.cardForSource(sourceCardId);
    this.enemies
      .filter(
        enemy =>
          enemy.state !== "deleted" &&
          Math.abs(enemy.grid.col - panel.col) <= 1 &&
          Math.abs(enemy.grid.row - panel.row) <= 1
      )
      .forEach(enemy => this.strikeEnemy(enemy, damage, sourceCard, false));
    this.onEvent({
      type: "impact",
      at: { ...panel },
      side: "player",
      cardId: sourceCardId,
      damage,
    });
  }
  private triggerEnemyObjectExplosion(
    panel: GridPosition,
    damage: number,
    enemyId?: string
  ): void {
    const area = this.areaAround(panel, 1);
    if (area.some(position => sameTile(position, this.playerGrid)))
      this.applyPlayerHit(damage, enemyId);
    area.forEach(position => this.panelSystem.crack(position));
    this.onEvent({
      type: "impact",
      at: { ...panel },
      side: "enemy",
      enemyId,
      damage,
    });
    this.message = "敵の爆弾が起爆";
  }

  private removeFieldObject(id: string): void {
    const object = this.objectSystem.remove(id);
    if (!object) return;
    this.panelSystem.detachObject(object.panel, object.id);
    this.objectNextTriggerAt.delete(id);
    this.objectTriggerCount.delete(id);
  }
  private cardForSource(sourceCardId?: string): Card | undefined {
    if (!sourceCardId) return undefined;
    return [...CARD_CATALOG, ...OVERLOAD_CARDS].find(
      card => card.id === sourceCardId
    );
  }
  private cardPointTarget(): GridPosition {
    const target = nearestEnemyPosition(
      this.playerGrid,
      this.enemies
        .filter(enemy => enemy.state !== "deleted")
        .map(enemy => enemy.grid)
    );
    return target ? { ...target } : {
      col: Math.min(5, Math.max(3, this.playerGrid.col + 2)),
      row: this.playerGrid.row,
    };
  }

  private freezeEmptyEnemyPanels(): void {
    this.panelSystem
      .snapshot()
      .filter(panel =>
        panel.owner === "enemy" &&
        panel.occupantId === null &&
        panel.objectId === null &&
        panel.terrain !== "hole"
      )
      .forEach(panel => this.panelSystem.setTerrain(panel, "ice", this.gameTimeMs, 2300));
  }

  private applyElementalPanelInteraction(element: CardElement | undefined, positions: GridPosition[]): void {
    if (!element || element === "none") return;
    positions.forEach(position => {
      const panel = this.panelSystem.get(position);
      if (!panel) return;
      if (element === "fire" && panel.terrain === "grass")
        this.panelSystem.setTerrain(position, "normal", this.gameTimeMs);
      if (element === "water" && panel.terrain === "lava")
        this.panelSystem.setTerrain(position, "normal", this.gameTimeMs);
    });
  }

  private resolveCardDamage(
    enemy: Enemy,
    damage: number,
    card: Card | undefined,
    elementOverride?: CardElement
  ): number {
    const panel = this.panelSystem.get(enemy.grid);
    const element = elementOverride ?? card?.element ?? "none";
    const multiplier = getElementalMultiplier(
      element,
      enemy.weaknessElement ?? enemy.element ?? "none",
      panel?.terrain ?? "normal"
    );
    const elementalDamage = Math.max(0, Math.round(damage * multiplier));
    return panel?.terrain === "holy"
      ? Math.ceil(elementalDamage / 2)
      : elementalDamage;
  }
  private applyPlayerCardEffect(card: Card, power = card.power): void {
    if (card.isOverload) this.applyOverloadEffect(card);
    const value = card.effectValue ?? 0;

    if (card.id === "prism")
      this.barrier = Math.min(220, this.barrier + value);
    if (card.status === "barrier" && card.id !== "prism")
      this.barrier = Math.min(220, this.barrier + value);
    if (card.id === "dream")
      this.dreamAuraUntil = Math.max(
        this.dreamAuraUntil,
        this.gameTimeMs + COMBAT_BALANCE.upper.dreamAuraMs
      );
    if (card.id === "rectify") {
      this.healPlayer(value);
      this.emotionSystem.recover();
    }
    if (
      card.status === "recover" &&
      card.id !== "repair" &&
      card.id !== "rectify"
    ) {
      this.healPlayer(value);
      this.emotionSystem.recover();
    }
    if (
      card.status === "gauge" &&
      card.id !== "fastsync" &&
      card.id !== "reroute"
    )
      this.customSystem.add(value);

    if (card.id === "fastsync")
      this.customSystem.setTemporaryMultiplier(
        COMBAT_BALANCE.custom.fastSyncMultiplier,
        COMBAT_BALANCE.custom.fastSyncDurationMs,
        this.gameTimeMs
      );
    if (card.id === "reroute") this.customSystem.fill();
    if (card.id === "stamp")
      this.outputMarkRemaining = Math.min(
        120,
        Math.max(this.outputMarkRemaining, value || 120)
      );

    if (card.id === "repair") {
      this.pendingRepair = {
        readyAt: this.gameTimeMs + (card.durationMs ?? 600),
        amount: value || 100,
      };
      this.message = "応急修復を準備中 — 被弾すると失敗";
    }
    if (card.id === "phase") this.grantPhaseInvincibility();
    if (card.id === "return") {
      this.pendingDefense = "return";
      this.pendingDefenseUntil = 0;
    }
    if (card.id === "substitute") {
      this.pendingDefense = "substitute";
      this.pendingDefenseUntil = 0;
    }
    if (card.id === "premonition") {
      this.pendingDefense = "premonition";
      this.pendingDefenseUntil = this.gameTimeMs + (card.durationMs ?? 1200);
    }
    if (card.id === "magguard")
      this.electromagneticBarrierActive = true;

    if (card.id === "sanctum")
      this.paintSanctuary(card.durationMs ?? 8000);
    if (card.id === "sanctuary") {
      this.healPlayer(COMBAT_BALANCE.upper.sanctuaryHeal);
      this.paintPlayerTerritory(COMBAT_BALANCE.upper.sanctuaryDurationMs);
    }
    if (card.id === "sector")
      this.panelSystem.expandEnemyFront(
        this.gameTimeMs,
        card.durationMs ?? TERRITORY_EXPANSION_DURATION_MS
      );
    if (card.id === "rush") this.transferPlayerToCardTarget();

    if (card.id === "crack") {
      [1, 2].map(offset => ({
        col: this.playerGrid.col + offset,
        row: this.playerGrid.row,
      })).forEach(target => {
        this.panelSystem.crack(target);
        this.spawnPointAttack(card, target, power || 20);
      });
    }
    if (card.id === "hole") this.applyReversePhaseHole(card, power || 30);

    if (card.id === "timer")
      this.placeFieldObject(
        "bomb",
        this.closestEmptyEnemyPanel(),
        50,
        2000,
        "timer",
        {
          effectId: "timed-bomb",
          damage: power || 90,
          sourceCardId: card.id,
          collision: "passable",
          pushable: true,
        }
      );
    if (card.id === "watchmine")
      this.placeFieldObject(
        "mine",
        this.closestEmptyEnemyPanel(),
        50,
        null,
        "enemy-contact",
        {
          effectId: "watch-mine",
          damage: power || 100,
          sourceCardId: card.id,
          collision: "passable",
          hidden: true,
          pushable: true,
        }
      );
    if (card.id === "turret")
      this.placeFieldObject(
        "turret",
        { col: 2, row: this.playerGrid.row },
        60,
        4000,
        "timer",
        {
          effectId: "turret",
          damage: power || 12,
          sourceCardId: card.id,
          collision: "solid",
          firstTriggerDelayMs: 0,
        }
      );
    if (card.id === "stake")
      this.placeFieldObject(
        "stake",
        this.closestEmptyEnemyPanel(),
        40,
        5000,
        "enemy-contact",
        {
          effectId: "stake",
          damage: power || 10,
          sourceCardId: card.id,
          collision: "solid",
        }
      );
    if (card.id === "breakpillar") {
      const target = this.cardPointTarget();
      this.panelSystem.crack(target);
      this.spawnPointAttack(card, target, power || 90);
    }
    if (card.id === "block")
      this.placeFieldObject(
        "cube",
        { col: this.playerGrid.col + 1, row: this.playerGrid.row },
        100,
        null,
        "damage",
        { collision: "solid", fallback: false }
      );
    if (card.id === "toxic") {
      const target = this.closestEmptyEnemyPanel();
      this.paintToxicMist(target, card.durationMs ?? 5000);
      this.placeFieldObject(
        "field-device",
        target,
        70,
        card.durationMs ?? 5000,
        "none",
        {
          effectId: "poison-mist",
          damage: power || 8,
          sourceCardId: card.id,
          collision: "passable",
          firstTriggerDelayMs: 0,
        }
      );
    }
    if (card.id === "gravity")
      this.placeFieldObject(
        "field-device",
        this.closestEmptyEnemyPanel(),
        40,
        card.durationMs ?? 4000,
        "none",
        {
          effectId: "gravity-field",
          collision: "passable",
          firstTriggerDelayMs: 0,
        }
      );
    if (card.id === "gustwall") this.applyGustWall();

    this.syncCustomRemaining();
    this.syncBoardOccupancy();
  }
  private applyOverloadEffect(card: Card): void {
    const result = this.emotionSystem.registerOverload();
    this.playerMaxHp = Math.max(
      1,
      this.playerMaxHp - result.appliedMaxHpReduction
    );
    this.playerHp = Math.min(this.playerHp, this.playerMaxHp);
    this.addScore(
      "overloadPenalty",
      COMBAT_BALANCE.score.overloadPenalty
    );
    if (card.id === "overload-limit-cannon") {
      this.normalShotDamageMultiplier = 0.5;
      this.message = "限界砲 — このWaveは通常射撃が半減";
    }
    if (card.id === "overload-contamination") {
      this.contaminationActive = true;
      this.message = "汚染拡散 — 移動した自陣が毒化";
    }
    if (card.id === "overload-forced-repair") {
      this.healPlayer(this.playerMaxHp);
      this.forcedRepairDrainActive = true;
      this.nextForcedRepairDrainAt = this.gameTimeMs + 1000;
      this.message = "強制修復 — 修復後の維持負荷が発生";
    }
    if (card.id === "overload-collapse-field") {
      this.panelSystem
        .snapshot()
        .filter(panel => panel.owner === "enemy")
        .forEach(panel =>
          this.panelSystem.setTerrain(panel, "poison", this.gameTimeMs, 8000)
        );
      this.panelSystem
        .snapshot()
        .filter(
          panel => panel.owner === "player" && !sameTile(panel, this.playerGrid)
        )
        .forEach(panel =>
          this.panelSystem.setTerrain(panel, "hole", this.gameTimeMs, 4000)
        );
      this.handSizeReduction = Math.max(
        this.handSizeReduction,
        COMBAT_BALANCE.overload.collapseHandReduction
      );
      this.message = "崩落領域 — 次の手札が減少";
    }
    if (card.id === "overload-severing-blade") {
      this.customSystem.setBaseMultiplier(
        COMBAT_BALANCE.custom.severingBladeMultiplier
      );
      this.message = "断絶刃 — ゲージ上昇速度が低下";
    }
  }

  private paintSanctuary(durationMs: number): void {
    const positions = [
      this.playerGrid,
      { col: this.playerGrid.col - 1, row: this.playerGrid.row },
      { col: this.playerGrid.col + 1, row: this.playerGrid.row },
      { col: this.playerGrid.col, row: this.playerGrid.row - 1 },
      { col: this.playerGrid.col, row: this.playerGrid.row + 1 },
    ];
    positions
      .filter(position => this.panelSystem.get(position)?.owner === "player")
      .forEach(position =>
        this.panelSystem.setTerrain(position, "holy", this.gameTimeMs, durationMs)
      );
  }

  private paintPlayerTerritory(durationMs: number): void {
    this.panelSystem
      .snapshot()
      .filter(panel => panel.owner === "player")
      .forEach(panel =>
        this.panelSystem.setTerrain(
          { col: panel.col, row: panel.row },
          "holy",
          this.gameTimeMs,
          durationMs
        )
      );
  }

  private closestEmptyEnemyPanel(): GridPosition {
    return cardPlacementTarget(
      this.playerGrid,
      this.enemies
        .filter(enemy => enemy.state !== "deleted")
        .map(enemy => enemy.grid),
      this.panelSystem.snapshot()
    );
  }

  private placeFieldObject(
    kind: FieldObjectKind,
    preferred: GridPosition,
    hp: number,
    lifetimeMs: number | null,
    trigger: Parameters<ObjectSystem["place"]>[0]["trigger"],
    options: FieldObjectOptions = {}
  ): FieldObject | null {
    const allPanels = this.panelSystem.snapshot().map(panel => ({
      col: panel.col,
      row: panel.row,
    }));
    const candidates = options.fallback === false
      ? [preferred]
      : [preferred, ...allPanels];
    const panel = candidates.find((position, index, list) => {
      if (list.findIndex(candidate => sameTile(candidate, position)) !== index)
        return false;
      const state = this.panelSystem.get(position);
      return (
        state?.occupantId === null &&
        state.objectId === null &&
        state.terrain !== "hole"
      );
    });
    if (!panel) return null;
    const id = `${kind}-${this.gameTimeMs}-${this.objectSequence}`;
    this.objectSequence += 1;
    const result = this.objectSystem.place({
      id,
      owner: options.owner ?? "player",
      kind,
      panel,
      hp,
      expiresAt: lifetimeMs === null ? null : this.gameTimeMs + lifetimeMs,
      trigger,
      effectId: options.effectId,
      damage: options.damage,
      sourceCardId: options.sourceCardId,
      sourceId: options.sourceId,
      hidden: options.hidden ?? false,
      pushable:
        options.pushable ??
        (kind === "bomb" || kind === "mine" || kind === "stake" || kind === "field-device"),
      collision: options.collision ?? (kind === "mine" || kind === "bomb" ? "passable" : "solid"),
    });
    if (result.removed) {
      this.panelSystem.detachObject(result.removed.panel, result.removed.id);
      this.objectNextTriggerAt.delete(result.removed.id);
      this.objectTriggerCount.delete(result.removed.id);
    }
    if (!result.object) return null;
    this.panelSystem.attachObject(result.object.panel, result.object.id);
    const firstTriggerDelay =
      options.firstTriggerDelayMs ??
      (kind === "turret" ? 400 : kind === "field-device" ? 1000 : 0);
    this.objectNextTriggerAt.set(
      result.object.id,
      this.gameTimeMs + firstTriggerDelay
    );
    this.objectTriggerCount.set(result.object.id, 0);
    return result.object;
  }

  private spawnPointAttack(card: Card, target: GridPosition, damage: number): void {
    this.spawnProjectile({
      owner: "player",
      motion: "thrown",
      position: { ...this.playerGrid },
      target: { ...target },
      damage,
      sourceCardId: card.id,
      flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      speedCellsPerSecond: COMBAT_BALANCE.projectile.defaultSpeedCellsPerSecond,
    });
  }

  private areaAround(center: GridPosition, radius = 1): GridPosition[] {
    const tiles: GridPosition[] = [];
    for (let col = center.col - radius; col <= center.col + radius; col += 1)
      for (let row = center.row - radius; row <= center.row + radius; row += 1)
        if (this.panelSystem.isInside({ col, row })) tiles.push({ col, row });
    return tiles;
  }

  private paintToxicMist(center: GridPosition, durationMs: number): void {
    this.areaAround(center).forEach(position =>
      this.panelSystem.setTerrain(position, "poison", this.gameTimeMs, durationMs)
    );
  }

  private applyReversePhaseHole(card: Card, damage: number): void {
    let created = 0;
    for (const panel of this.panelSystem.snapshot().filter(candidate => candidate.owner === "enemy")) {
      if (panel.occupantId === null && panel.objectId === null && created < 3) {
        this.panelSystem.setTerrain(panel, "hole", this.gameTimeMs, 8000);
        created += 1;
        continue;
      }
      const enemy = this.enemies.find(candidate =>
        candidate.state !== "deleted" && sameTile(candidate.grid, panel)
      );
      if (enemy) {
        this.panelSystem.crack(panel);
        this.strikeEnemy(enemy, damage, card, false);
      }
    }
  }

  private transferPlayerToCardTarget(): void {
    const destination = cardTransferTarget(
      this.playerGrid,
      this.enemies
        .filter(enemy => enemy.state !== "deleted")
        .map(enemy => enemy.grid),
      this.panelSystem.snapshot()
    );
    const destinationPanel = this.panelSystem.get(destination);
    if (
      !destinationPanel ||
      destinationPanel.terrain === "hole" ||
      destinationPanel.occupantId !== null ||
      destinationPanel.objectId !== null
    )
      return;
    const previous = { ...this.playerGrid };
    this.panelSystem.vacate(previous, this.gameTimeMs);
    this.playerGrid = { ...destination };
    this.panelSystem.occupy(this.playerGrid, "player");
    this.grantPhaseInvincibility();
    this.nextSwordMultiplier = 1.3;
    this.applyPlayerEntryTerrain(this.playerGrid);
    this.message = "強襲転送 — 次の剣攻撃を強化";
  }

  private grantPhaseInvincibility(): void {
    this.phaseUntil = Math.max(
      this.phaseUntil,
      this.gameTimeMs + COMBAT_BALANCE.phase.invincibilityMs
    );
  }

  private applyGustWall(): void {
    for (const enemy of [...this.enemies].filter(enemy => enemy.state !== "deleted").sort((a, b) => b.grid.col - a.grid.col)) {
      const destination = { col: enemy.grid.col + 1, row: enemy.grid.row };
      const panel = this.panelSystem.get(destination);
      if (
        panel &&
        panel.terrain !== "hole" &&
        panel.occupantId === null &&
        panel.objectId === null
      ) enemy.grid = destination;
    }
    this.syncBoardOccupancy();
    for (const object of this.objectSystem.snapshot().filter(object => object.pushable).sort((a, b) => b.panel.col - a.panel.col)) {
      const destination = { col: object.panel.col + 1, row: object.panel.row };
      this.moveFieldObject(object, destination);
    }
    this.syncBoardOccupancy();
  }

  private moveFieldObject(object: FieldObject, destination: GridPosition): boolean {
    const panel = this.panelSystem.get(destination);
    if (!panel || panel.terrain === "hole" || panel.occupantId !== null || panel.objectId !== null)
      return false;
    this.panelSystem.detachObject(object.panel, object.id);
    if (!this.objectSystem.move(object.id, destination)) {
      this.panelSystem.attachObject(object.panel, object.id);
      return false;
    }
    this.panelSystem.attachObject(destination, object.id);
    return true;
  }

  private pullEnemiesTo(center: GridPosition): void {
    for (const enemy of this.enemies.filter(enemy => enemy.state !== "deleted")) {
      if (enemy.state === "windup" || enemy.state === "stunned") continue;
      if (Math.abs(enemy.grid.col - center.col) + Math.abs(enemy.grid.row - center.row) > 3) continue;
      const horizontal = Math.abs(center.col - enemy.grid.col) >= Math.abs(center.row - enemy.grid.row);
      const directions = horizontal
        ? [{ col: Math.sign(center.col - enemy.grid.col), row: 0 }, { col: 0, row: Math.sign(center.row - enemy.grid.row) }]
        : [{ col: 0, row: Math.sign(center.row - enemy.grid.row) }, { col: Math.sign(center.col - enemy.grid.col), row: 0 }];
      for (const direction of directions) {
        if (Math.abs(direction.col) + Math.abs(direction.row) !== 1) continue;
        const destination = this.panelSystem.resolveMovement(
          enemy.grid,
          direction,
          "enemy",
          position => this.objectSystem.isSolidAt(position)
        );
        if (destination) {
          enemy.grid = destination;
          break;
        }
      }
    }
    this.syncBoardOccupancy();
  }
  private closestEnemy(): Enemy | undefined {
    const active = this.enemies.filter(enemy => enemy.state !== "deleted");
    const target = nearestEnemyPosition(
      this.playerGrid,
      active.map(enemy => enemy.grid)
    );
    return active.find(enemy => target !== null && sameTile(enemy.grid, target));
  }
  private frontTarget(): Enemy | undefined {
    return this.enemies
      .filter(
        enemy =>
          enemy.state !== "deleted" &&
          enemy.grid.row === this.playerGrid.row &&
          enemy.grid.col > this.playerGrid.col
      )
      .sort((a, b) => a.grid.col - b.grid.col)[0];
  }
  private cardTargets(card: Card): {
    tiles: GridPosition[];
    enemies: Enemy[];
  } {
    const tiles = cardPreviewTiles(
      card,
      this.playerGrid,
      this.enemies.filter(enemy => enemy.state !== "deleted").map(enemy => enemy.grid),
      this.panelSystem.snapshot()
    );
    const enemies = this.enemies.filter(enemy =>
      enemy.state !== "deleted" &&
      tiles.some(tile => sameTile(tile, enemy.grid))
    );
    return { tiles, enemies };
  }
  private consumeOutputMark(damage: number, card: Card | undefined): number {
    if (!card || card.power <= 0 || this.outputMarkRemaining <= 0) return damage;
    const bonus = Math.min(30, this.outputMarkRemaining);
    this.outputMarkRemaining -= bonus;
    return damage + bonus;
  }

  private enemyBlocksDamage(enemy: Enemy, card: Card | undefined): boolean {
    if (enemy.state === "deleted") return true;
    if (card?.properties?.includes("破砕")) return false;

    if (enemy.defense === "guard") {
      // Keep the low-power basic shot useful while a guard blocks card attacks.
      if (!card) return false;
      return ![
        "counter-window",
        "active",
        "recovery",
        "stunned",
        "deleted",
      ].includes(enemy.actionPhase);
    }

    if (enemy.defense === "armor") {
      const hammerOpen =
        enemy.actionId === "gaia-hammer-strike" &&
        ["counter-window", "active", "recovery"].includes(enemy.actionPhase);
      return !hammerOpen;
    }

    if (
      enemy.definitionId === "hopper-bomb" &&
      enemy.actionId === "hopper-jump-land" &&
      ["startup", "counter-window", "active"].includes(enemy.actionPhase) &&
      !card?.properties?.includes("看破")
    ) {
      return !card || Boolean(card.properties?.includes("射撃"));
    }

    return false;
  }

  private strikeEnemy(
    enemy: Enemy,
    damage: number,
    card: Card | undefined,
    charged: boolean,
    chainDepth = 0,
    elementOverride?: CardElement
  ): void {
    if (enemy.state === "deleted") return;
    if (this.enemyBlocksDamage(enemy, card)) {
      this.message =
        enemy.defense === "armor"
          ? enemy.name + " — 装甲が攻撃を弾く"
          : enemy.name + " — 正面ガード";
      this.onEvent({
        type: "impact",
        at: { ...enemy.grid },
        side: "player",
        enemyId: enemy.id,
        cardId: card?.id,
        damage: 0,
        charged,
      });
      return;
    }

    const markedDamage = this.consumeOutputMark(damage, card);
    const resolvedDamage = this.resolveCardDamage(
      enemy,
      markedDamage,
      card,
      elementOverride
    );
    const barrierBefore = enemy.barrier;
    const absorbed = Math.min(barrierBefore, resolvedDamage);
    enemy.barrier = Math.max(0, barrierBefore - absorbed);
    const actualDamage = Math.max(0, resolvedDamage - absorbed);
    enemy.hp = Math.max(0, enemy.hp - actualDamage);
    if (absorbed > 0 && actualDamage === 0)
      this.message = enemy.name + " — 障壁防御";

    this.refreshEnemyPhase(enemy);
    const counter = Boolean(
      card &&
        card.power > 0 &&
        !charged &&
        enemy.actionPhase === "counter-window" &&
        isCounterWindowOpen(this.gameTimeMs, enemy.counterWindowState)
    );
    if (counter) {
      this.clearWarnings(enemy);
      enemy.lockedTargets = [];
      enemy.state = "stunned";
      enemy.actionPhase = "stunned";
      enemy.stunnedUntil = this.gameTimeMs + COMBAT_BALANCE.counter.stunMs;
      this.sync = this.emotionSystem.counterSuccess();
      this.counters += 1;
      this.addScore("counterPoints", COMBAT_BALANCE.score.counterPoints);
      if (enemy.definitionId === "core-arbiter")
        enemy.actionIndex += 1;
      this.message = this.sync
        ? "カードカウンター — フルシンクロ"
        : "カードカウンター — 激昂を維持";
      this.onEvent({ type: "counter", at: { ...enemy.grid } });
    }
    this.onEvent({
      type: "impact",
      at: { ...enemy.grid },
      side: "player",
      enemyId: enemy.id,
      cardId: card?.id,
      damage: actualDamage,
      status: card?.status,
      charged,
      counter,
    });
    if (card?.status && enemy.hp > 0)
      this.applyStatus(enemy, card.status, card.durationMs ?? 0);
    if (card?.id === "volt" && chainDepth === 0 && enemy.hp > 0) {
      const chained = this.enemies
        .filter(candidate =>
          candidate.id !== enemy.id &&
          candidate.state !== "deleted" &&
          Math.abs(candidate.grid.col - enemy.grid.col) <= 1 &&
          Math.abs(candidate.grid.row - enemy.grid.row) <= 1
        )
        .sort((a, b) =>
          Math.abs(a.grid.col - enemy.grid.col) +
            Math.abs(a.grid.row - enemy.grid.row) -
          (Math.abs(b.grid.col - enemy.grid.col) +
            Math.abs(b.grid.row - enemy.grid.row))
        )[0];
      if (chained)
        this.strikeEnemy(
          chained,
          Math.max(1, Math.round(actualDamage / 2)),
          card,
          charged,
          1,
          elementOverride
        );
    }
    if (enemy.hp <= 0) {
      this.clearWarnings(enemy);
      enemy.state = "deleted";
      enemy.actionPhase = "deleted";
      this.recordEnemyDefeat(enemy);
      this.onEvent({ type: "deleted", id: enemy.id, at: { ...enemy.grid } });
      this.message = enemy.name + " を停止";
    }
  }

  private applyStatus(
    enemy: Enemy,
    status: CardStatus,
    duration: number
  ): void {
    const now = this.gameTimeMs;
    if (status === "burn") {
      enemy.burnUntil = Math.max(enemy.burnUntil, now + duration);
      enemy.nextBurnAt = now + 420;
    }
    if (status === "stun") {
      this.clearWarnings(enemy);
      enemy.lockedTargets = [];
      enemy.state = "stunned";
      enemy.actionPhase = "stunned";
      enemy.stunnedUntil = Math.max(enemy.stunnedUntil, now + duration);
    }
    if (status === "root")
      enemy.rootUntil = Math.max(enemy.rootUntil, now + duration);
    if (status === "slow") {
      enemy.slowUntil = Math.max(enemy.slowUntil, now + duration);
      enemy.nextAttackAt += 350;
    }
  }


  private addScore(
    component: Exclude<keyof ScoreBreakdown, "total">,
    amount: number
  ): void {
    this.scoreBreakdown[component] = Math.max(
      0,
      this.scoreBreakdown[component] + Math.max(0, amount)
    );
    this.scoreBreakdown.total = calculateScoreTotal(this.scoreBreakdown);
    this.score = this.scoreBreakdown.total;
  }

  private recordPlayerDamage(amount: number): void {
    const damage = Math.max(0, Math.round(amount));
    if (damage === 0) return;
    this.waveDamageTaken += damage;
    this.totalDamageTaken += damage;
    this.addScore(
      "damagePenalty",
      damage * COMBAT_BALANCE.score.damagePenaltyPerHp
    );
  }

  private recordEnemyDefeat(enemy: Enemy): void {
    this.addScore("enemyDefeatPoints", enemyDefeatScore(enemy.definitionId));
    if (
      this.lastDefeatAt !== null &&
      this.gameTimeMs - this.lastDefeatAt <=
        COMBAT_BALANCE.score.simultaneousDefeatWindowMs
    ) {
      this.simultaneousDefeats += 1;
      this.addScore(
        "simultaneousPoints",
        COMBAT_BALANCE.score.simultaneousDefeatPoints
      );
    }
    this.lastDefeatAt = this.gameTimeMs;
  }

  private completeWaveScore(): WaveScoreSummary {
    const summary = scoreWaveCompletion({
      wave: this.wave,
      elapsedSeconds: Math.max(0, this.elapsed - this.waveStartedElapsed),
      damageTaken: this.waveDamageTaken,
    });
    this.waveResults.push(summary);
    this.lastWaveScore = summary;
    this.addScore("waveClearPoints", summary.waveClearPoints);
    this.addScore("timePoints", summary.timePoints);
    this.addScore("noDamagePoints", summary.noDamagePoints);
    return summary;
  }

  private resetBoard(): void {
    this.clearEnemyWarnings();
    this.panelSystem.reset();
    this.objectSystem.reset();
    this.objectSequence = 0;
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.pendingChainEffects = [];
    this.lastAttackCard = null;
    this.dreamAuraUntil = 0;
    this.overdrivePrompt = null;
    this.playerStunnedUntil = 0;
    this.playerBlindUntil = 0;
    this.objectNextTriggerAt.clear();
    this.objectTriggerCount.clear();
    this.enemies = this.makeEnemies(this.wave);
    this.syncBoardOccupancy();
  }

  private resetBattleDeck(): void {
    this.battleDeck.resetWave(this.deckSeed());
    this.customHand = this.drawCustomHand();
    this.selected = [];
    this.focusedCard = null;
    this.selectionError = null;
  }

  private drawCustomHand(): Card[] {
    const hand = this.battleDeck.drawHand();
    const chance = this.emotionSystem.overloadChance();
    if (hand.length > 0 && this.overloadRandom.next() < chance) {
      const slot = this.overloadRandom.int(hand.length);
      const overload = this.overloadRandom.pick(OVERLOAD_CARDS);
      if (overload) {
        hand[slot] = {
          ...overload,
          folderClass: "overload",
          instanceId: hand[slot].instanceId,
          selectedCode: "!",
          allowedCodes: ["!"],
        };
      }
    }
    return this.handSizeReduction > 0
      ? hand.slice(0, Math.max(1, hand.length - this.handSizeReduction))
      : hand;
  }

  private reloadFolder(): void {
    if (
      this.mode === "result" ||
      this.mode === "intermission" ||
      this.mode === "practice"
    ) {
      this.restart();
      return;
    }
    const saveData = loadSaveData();
    this.activeFolder = getActiveFolder(saveData);
    this.battleDeck = new BattleDeck(this.activeFolder, this.deckSeed());
    this.queue = [];
    this.mode = "custom";
    this.customSystem.reset();
    this.syncCustomRemaining();
    this.message = `${this.activeFolder.name}を読み込みました — カードを選択`;
    this.resetBattleDeck();
    this.notify();
  }

  private deckSeed(): number {
    return this.wave === 1 ? 12345 : this.wave * 1009 + 17;
  }

  private beginCustom(message: string): void {
    if (!this.customSystem.isFull()) return;
    this.mode = "custom";
    this.clock.discardPendingTime();
    this.cancelCharge();
    this.hitstopRemainingMs = 0;
    this.customHand = this.drawCustomHand();
    this.selected = [];
    this.focusedCard = null;
    this.selectionError = null;
    this.message = message;
    this.notify();
  }
  private openCustom(): void {
    if (this.mode !== "battle" || this.paused) return;
    if (this.gameTimeMs < this.playerStunnedUntil) {
      this.message = "麻痺中 — 移動と攻撃はできません";
      this.notify();
      return;
    }
    if (this.isCharging) {
      this.message = "チャージを解除してからカード選択を開いてください";
      this.notify();
      return;
    }
    if (!this.customSystem.isFull()) {
      this.message = "カスタムゲージが満タンになるまで開けません";
      this.notify();
      return;
    }
    this.beginCustom("カスタム画面 — 次のカードを選択");
  }
  private toggleCard(index: number): void {
    if (this.mode !== "custom" || !this.customHand[index]) return;
    const card = this.customHand[index];
    if (this.selected.includes(index)) {
      this.selected = this.selected.filter(selected => selected !== index);
      this.focusedCard = this.selected.at(-1) ?? null;
      this.selectionError = null;
      this.message = `${card.name} の選択を解除`;
    } else {
      const nextSelection = [...this.selected, index];
      const validation = validateSelection(this.customHand, nextSelection);
      if (validation.valid) {
        this.selected = nextSelection;
        this.focusedCard = index;
        this.selectionError = null;
        this.message = `${card.name} を ${this.selected.length} 番目に選択`;
      } else {
        // A rejected card still becomes the preview target so the player can
        // see why it cannot be added. Selection itself remains unchanged.
        this.focusedCard = index;
        this.selectionError = validation.reason;
        this.message = validation.reason;
      }
    }
    this.notify();
  }
  private confirmCustom(): void {
    if (this.mode !== "custom") return;
    const validation = validateSelection(this.customHand, this.selected);
    if (!validation.valid) {
      this.selectionError = validation.reason;
      this.message = validation.reason;
      this.notify();
      return;
    }
    const committed = this.battleDeck.commitSelection(this.selected);
    const committedByInstance = new Map(
      committed.map(card => [card.instanceId, card])
    );
    const orderedCards = this.selected.flatMap(index => {
      const offered = this.customHand[index];
      if (!offered) return [];
      if (offered.isOverload) return [offered];
      const committedCard = offered.instanceId
        ? committedByInstance.get(offered.instanceId)
        : undefined;
      return committedCard ? [committedCard] : [];
    });
    const chainTechnique = findChainTechnique(orderedCards);
    this.queue = chainTechnique
      ? [createChainCard(chainTechnique, orderedCards)]
      : orderedCards;
    this.focusedCard = null;
    this.selectionError = null;
    this.mode = "battle";
    this.clock.discardPendingTime();
    this.customSystem.resetGauge();
    this.syncCustomRemaining();
    this.message =
      chainTechnique
        ? `ウェーブ 0${this.wave} — ${chainTechnique.name}を接続`
        : this.queue.length > 0
          ? `ウェーブ 0${this.wave} — 接続開始`
          : `ウェーブ 0${this.wave} — カードなしで戦闘開始`;
    const now = this.gameTimeMs;
    this.enemies.forEach((enemy, index) => {
      if (enemy.state !== "deleted")
        enemy.nextAttackAt = now + 1050 + index * 510;
    });
    this.notify();
  }
  private finishWave(): void {
    if (this.mode !== "battle") return;
    const summary = this.completeWaveScore();
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.hitstopRemainingMs = 0;
    this.cancelCharge();
    this.clock.discardPendingTime();
    this.objectSystem.reset();
    this.objectNextTriggerAt.clear();
    this.objectTriggerCount.clear();
    this.panelSystem.reset();
    this.syncBoardOccupancy();
    this.mode = this.wave >= FINAL_WAVE ? "result" : "intermission";
    if (this.mode === "intermission") {
      this.pendingChainEffects = [];
      this.dreamAuraUntil = 0;
      this.overdrivePrompt = null;
      const beforeRecovery = this.playerHp;
      this.healPlayer(Math.ceil(this.playerMaxHp * 0.15));
      this.lastWaveRecovery = Math.max(0, this.playerHp - beforeRecovery);
      this.message =
        "ウェーブ 0" +
        this.wave +
        " 完了 — 耐久を" +
        this.lastWaveRecovery +
        "回復、次のWaveへ";
      if (summary.total > 0)
        this.message += "（獲得+" + summary.total + "）";
    } else {
      this.finishRun("victory");
    }
    this.notify();
  }
  private nextWave(): void {
    if (this.mode !== "intermission") return;
    this.wave += 1;
    this.waveStartedElapsed = this.elapsed;
    this.waveDamageTaken = 0;
    this.lastDefeatAt = null;
    this.lastWaveRecovery = 0;
    this.clock.discardPendingTime();
    this.playerGrid = { col: 1, row: 1 };
    this.customSystem.reset();
    this.syncCustomRemaining();
    this.sync = false;
    this.emotionSystem.resetWave();
    this.charging = 0;
    this.isCharging = false;
    this.barrier = 0;
    this.invincibleUntil = 0;
    this.playerControlLockedUntil = 0;
    this.playerDamageInvulnerableUntil = 0;
    this.playerStunnedUntil = 0;
    this.playerBlindUntil = 0;
    this.phaseUntil = 0;
    this.pendingDefense = null;
    this.pendingDefenseUntil = 0;
    this.electromagneticBarrierActive = false;
    this.pendingRepair = null;
    this.nextSwordMultiplier = 1;
    this.outputMarkRemaining = 0;
    this.normalShotDamageMultiplier = 1;
    this.contaminationActive = false;
    this.forcedRepairDrainActive = false;
    this.nextForcedRepairDrainAt = 0;
    this.nextPlayerTerrainDamageAt = 0;
    this.handSizeReduction = 0;
    this.hitstopRemainingMs = 0;
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.lastAttackCard = null;
    this.queue = [];
    this.selected = [];
    this.focusedCard = null;
    this.selectionError = null;
    this.resetBattleDeck();
    this.resetBoard();
    this.mode = "custom";
    this.message = `ウェーブ 0${this.wave} 接近 — カードを選択`;
    this.notify();
  }
  private restart(): void {
    this.clock.reset();
    this.gameTimeMs = 0;
    this.hitstopRemainingMs = 0;
    this.mode = "custom";
    this.paused = false;
    this.playerHp = PLAYER_MAX_HP;
    this.playerMaxHp = PLAYER_MAX_HP;
    this.playerGrid = { col: 1, row: 1 };
    this.customSystem.reset();
    this.syncCustomRemaining();
    this.sync = false;
    this.emotionSystem.resetRun();
    this.charging = 0;
    this.isCharging = false;
    this.barrier = 0;
    this.invincibleUntil = 0;
    this.playerControlLockedUntil = 0;
    this.playerDamageInvulnerableUntil = 0;
    this.playerStunnedUntil = 0;
    this.playerBlindUntil = 0;
    this.phaseUntil = 0;
    this.pendingDefense = null;
    this.pendingDefenseUntil = 0;
    this.electromagneticBarrierActive = false;
    this.pendingRepair = null;
    this.nextSwordMultiplier = 1;
    this.outputMarkRemaining = 0;
    this.normalShotDamageMultiplier = 1;
    this.contaminationActive = false;
    this.forcedRepairDrainActive = false;
    this.nextForcedRepairDrainAt = 0;
    this.nextPlayerTerrainDamageAt = 0;
    this.handSizeReduction = 0;
    this.wave = 1;
    this.score = 0;
    this.scoreBreakdown = createScoreBreakdown();
    this.waveResults = [];
    this.lastWaveScore = null;
    this.lastWaveRecovery = 0;
    this.waveStartedElapsed = 0;
    this.waveDamageTaken = 0;
    this.totalDamageTaken = 0;
    this.simultaneousDefeats = 0;
    this.cardsUsed = 0;
    this.overloadCardsUsed = 0;
    this.lastDefeatAt = null;
    this.outcome = null;
    this.personalBestDelta = 0;
    this.practiceStage = 1;
    this.selected = [];
    this.focusedCard = null;
    this.selectionError = null;
    this.queue = [];
    this.message = "カードを選択してください";
    this.elapsed = 0;
    this.counters = 0;
    this.rank = "—";
    this.activeFolder = getActiveFolder(loadSaveData());
    this.battleDeck = new BattleDeck(this.activeFolder, this.deckSeed());
    this.overloadRandom = new Random(0x51a7c0de);
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.pendingChainEffects = [];
    this.dreamAuraUntil = 0;
    this.overdrivePrompt = null;
    this.usedChainTechniques = [];
    this.nextFireAt = 0;
    this.resetBattleDeck();
    this.resetBoard();
    this.notify();
  }
  private togglePause(): void {
    if (this.mode !== "battle") return;
    this.paused = !this.paused;
    this.clock.setPaused(this.paused);
    if (this.paused) this.cancelCharge();
    this.message = this.paused ? "戦闘を停止 — 設定を調整" : "戦闘を再開";
    this.notify();
  }
  private finishRun(outcome: RunOutcome): void {
    this.clearEnemyWarnings();
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.pendingChainEffects = [];
    this.dreamAuraUntil = 0;
    this.overdrivePrompt = null;
    this.playerStunnedUntil = 0;
    this.playerBlindUntil = 0;
    this.hitstopRemainingMs = 0;
    this.cancelCharge();
    this.objectSystem.reset();
    this.objectNextTriggerAt.clear();
    this.objectTriggerCount.clear();
    this.panelSystem.reset();
    this.syncBoardOccupancy();
    this.mode = "result";
    this.outcome = outcome;
    if (outcome === "victory") {
      this.rank = rankForScore(this.score);
      this.message = "ネットワーク制圧完了";
    } else if (outcome === "draw") {
      this.rank = "R";
      this.message = "相打ち — 敗北扱い";
    } else {
      this.rank = "R";
      this.message = "信号が途絶しました";
    }
    const previousBest = this.records.highScore;
    this.personalBestDelta = this.score - previousBest;
    this.records = {
      highScore: Math.max(this.records.highScore, this.score),
      bestWave: Math.max(this.records.bestWave, this.wave),
    };
    saveRecords(this.records);
    this.notify();
  }
  private clearEnemyWarnings(): void {
    this.enemies.forEach(enemy => {
      this.clearWarnings(enemy);
      enemy.lockedTargets = [];
    });
  }
  private makeEnemies(wave: number): Enemy[] {
    const now = this.gameTimeMs;
    const scale = wave === FINAL_WAVE ? 1 : 1 + (wave - 1) * 0.18;
    const factory = (spawn: EncounterSpawn): Enemy => {
      const definition = getEnemyDefinition(spawn.enemyId);
      if (!definition) throw new Error("未知の敵編成です");
      const firstAction = definition.actions[0];
      if (!firstAction) throw new Error("敵の行動定義がありません");
      const firstPhase = definition.phases?.[0];
      return {
        id: definition.id,
        name: definition.name,
        pattern: firstAction.pattern,
        hp: Math.round(definition.maxHp * scale),
        maxHp: Math.round(definition.maxHp * scale),
        grid: { ...spawn.grid },
        state: "idle",
        counterWindow: false,
        element: definition.element,
        definitionId: definition.id,
        actionIndex: 0,
        actionId: null,
        actionName: null,
        actionPhase: "idle",
        activeUntil: 0,
        warningAt: 0,
        warningShown: false,
        warningStage: null,
        warningStartedAt: 0,
        defense: firstPhase?.defense ?? definition.defense,
        movement: firstPhase?.movement ?? definition.movement,
        isBoss: definition.rank === "boss",
        bossPhase: firstPhase?.phase ?? 0,
        bossPhaseLabel: firstPhase?.label ?? null,
        weaknessElement:
          firstPhase?.weaknessElement ??
          definition.weakness ??
          definition.element,
        barrier: 0,
        baseDefense: definition.defense,
        baseMovement: definition.movement,
        lastMirrorCardId: null,
        windupUntil: 0,
        recoverUntil: 0,
        stunnedUntil: 0,
        nextAttackAt: now + 1900,
        attackDamage: Math.round(firstAction.damage * scale),
        windupMs: firstAction.startupMs,
        cooldownMs: firstAction.cooldownMs,
        lockedTargets: [],
        cycle: 0,
        burnUntil: 0,
        nextBurnAt: 0,
        slowUntil: 0,
        rootUntil: 0,
        attackStartedAt: 0,
        counterStartAt: null,
        counterEndAt: null,
        counterWindowMs: firstAction.counterWindowMs,
        counterWindowState: null,
        nextTerrainDamageAt: 0,
      };
    };

    if (wave < FINAL_WAVE) {
      const encounterWave = Math.min(3, Math.max(1, wave)) as 1 | 2 | 3;
      const templates = getEncounterTemplates(encounterWave);
      const template =
        templates[(wave - 1) % templates.length] ?? templates[0];
      if (!template || !encounterHasSafeStart(template.spawns))
        throw new Error("安全な敵編成がありません");
      return template.spawns.map(factory);
    }

    const availableBosses = BOSS_ENEMY_IDS.filter(
      id => !this.bossHistory.slice(-2).includes(id)
    );
    const bossPool = availableBosses.length > 0 ? availableBosses : BOSS_ENEMY_IDS;
    const selectedBoss =
      new Random(0xb055 + this.wave * 97 + this.bossHistory.length).pick(
        bossPool
      ) ?? BOSS_ENEMY_IDS[0];
    this.bossHistory = [...this.bossHistory, selectedBoss].slice(-2);
    saveBossHistory(this.bossHistory);

    const bossSpawn: EncounterSpawn = {
      enemyId: selectedBoss,
      grid: { col: 4, row: 1 },
    };
    const spawns: EncounterSpawn[] = [bossSpawn];
    if (
      (selectedBoss === "bastion-prime" ||
        selectedBoss === "climate-engine") &&
      !spawns.some(spawn => sameTile(spawn.grid, BOSS_SUPPORT_SPAWN.grid)) &&
      encounterHasSafeStart([...spawns, BOSS_SUPPORT_SPAWN])
    )
      spawns.push({ ...BOSS_SUPPORT_SPAWN, grid: { ...BOSS_SUPPORT_SPAWN.grid } });
    return spawns.map(factory);
  }
  private notify(): void {
    const now = this.gameTimeMs;
    const emotion = this.emotionSystem.snapshot(now);
    const practice = getPracticeStage(this.practiceStage);
    this.onSnapshot({
      mode: this.mode,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      playerGrid: { ...this.playerGrid },
      gauge: this.customSystem.value,
      sync: this.sync,
      emotion: emotion.state,
      emotionRemaining: emotion.remainingMs / 1000,
      corruption: emotion.corruption,
      charging: this.charging,
      barrier: this.barrier,
      invincible: now < this.invincibleUntil || now < this.phaseUntil,
      invincibleRemaining: Math.max(
        0,
        (Math.max(this.invincibleUntil, this.phaseUntil) - now) / 1000
      ),
      customHand: this.customHand,
      selected: this.selected,
      focusedCard: this.focusedCard,
      selectionError: this.selectionError,
      queue: this.queue,
      enemies: this.enemies.map(
        ({
          windupUntil: _w,
          recoverUntil: _r,
          stunnedUntil: _s,
          nextAttackAt: _n,
          attackDamage: _d,
          windupMs: _wm,
          cooldownMs: _c,
          lockedTargets: _l,
          cycle: _cy,
          burnUntil: _b,
          nextBurnAt: _nb,
          slowUntil: _sl,
          rootUntil: _rt,
          attackStartedAt: _as,
          counterStartAt: _cs,
          counterEndAt: _ce,
          counterWindowMs: _cwm,
          counterWindowState: _cws,
          nextTerrainDamageAt: _nt,
          definitionId: _definitionId,
          actionIndex: _actionIndex,
          activeUntil: _activeUntil,
          warningAt: _warningAt,
          warningShown: _warningShown,
          warningStartedAt: _warningStartedAt,
          isBoss: _isBoss,
          bossPhase: _bossPhase,
          bossPhaseLabel: _bossPhaseLabel,
          weaknessElement: _weaknessElement,
          barrier: _enemyBarrier,
          baseDefense: _baseDefense,
          baseMovement: _baseMovement,
          lastMirrorCardId: _lastMirrorCardId,
          ...enemy
        }) => {
          const warningActive =
            _warningShown && enemy.warningStage !== null;
          const progress = warningActive
            ? getWarningProgress(now, _warningStartedAt, _w)
            : 0;
          return {
            ...enemy,
            boss: _isBoss,
            bossPhase: _bossPhase,
            bossPhaseLabel: _bossPhaseLabel,
            weakness: _weaknessElement,
            barrier: _enemyBarrier,
            grid: { ...enemy.grid },
            counterWindow:
              this.sync &&
              enemy.actionPhase === "counter-window" &&
              isCounterWindowOpen(now, _cws),
            counterWindowRemaining: _cws
              ? Math.max(0, (_cws.endAt - now) / 1000)
              : 0,
            warningStage: warningActive ? enemy.warningStage : null,
            warningProgress: progress,
            warningRemainingMs: warningActive
              ? getWarningRemainingMs(now, _w)
              : 0,
            warningTargets: warningActive
              ? _l.map(target => ({ ...target }))
              : [],
          };
        }
      ),
      panels: this.panelSystem.snapshot(),
      objects: this.objectSystem.snapshot(),
      projectiles: this.projectileSystem.snapshot(),
      message: this.message,
      elapsed: this.elapsed,
      counters: this.counters,
      rank: this.rank,
      wave: this.wave,
      score: this.score,
      highScore: this.records.highScore,
      bestWave: this.records.bestWave,
      paused: this.paused,
      customRemaining: this.customRemaining,
      playerStunnedRemaining: Math.max(
        0,
        (this.playerStunnedUntil - now) / 1000
      ),
      playerBlindRemaining: Math.max(
        0,
        (this.playerBlindUntil - now) / 1000
      ),
      dreamAuraRemaining: Math.max(
        0,
        (this.dreamAuraUntil - now) / 1000
      ),
      overdriveStep: this.overdrivePrompt
        ? this.overdrivePrompt.step + 1
        : 0,
      overdriveRemaining: this.overdrivePrompt
        ? Math.max(0, (this.overdrivePrompt.expiresAt - now) / 1000)
        : 0,
      usedChainTechniques: [...this.usedChainTechniques],
      outcome: this.outcome ?? undefined,
      scoreBreakdown: { ...this.scoreBreakdown },
      waveResults: this.waveResults.map(summary => ({ ...summary })),
      lastWaveScore: this.lastWaveScore
        ? { ...this.lastWaveScore }
        : null,
      lastWaveRecovery: this.lastWaveRecovery,
      totalDamageTaken: this.totalDamageTaken,
      waveDamageTaken: this.waveDamageTaken,
      simultaneousDefeats: this.simultaneousDefeats,
      cardsUsed: this.cardsUsed,
      overloadCardsUsed: this.overloadCardsUsed,
      reachedWave: this.wave,
      personalBestDelta: this.personalBestDelta,
      practiceStage: this.mode === "practice" ? practice.stage : undefined,
      practiceStageTitle:
        this.mode === "practice" ? practice.title : undefined,
      practiceStageLesson:
        this.mode === "practice" ? practice.lesson : undefined,
      practiceStageObjective:
        this.mode === "practice" ? practice.objective : undefined,
    });
  }
}
