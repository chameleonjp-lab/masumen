/** Signal Relay Tactical core: Japanese battle-chip cards resolve through shared target shapes, status effects, and counter windows. */
import { validateSelection, CARD_CATALOG } from "./deck";
import { FixedStepClock } from "./core/FixedStepClock";
import { Random } from "./core/Random";
import { COMBAT_BALANCE } from "./data/balance";
import { OVERLOAD_CARDS } from "./data/overloadCards";
import {
  activeFolder as getActiveFolder,
  BattleDeck,
  loadSaveData,
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
import type {
  BattleEvent,
  BattleSnapshot,
  Card,
  CardStatus,
  EnemySnapshot,
  EnemyState,
  FieldObjectKind,
  GameController,
  GridPosition,
  ProjectileState,
  TargetShape,
} from "./types";

type Pattern =
  | "lane-sweep"
  | "column-scan"
  | "pursuit-dash"
  | "mortar-spread"
  | "pulse-grid";
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
}
interface PendingMelee {
  card: Card;
  damage: number;
  tiles: GridPosition[];
  dashTo: GridPosition | null;
  returnTo: GridPosition | null;
  activeAt: number;
  recoveryAt: number;
  hitResolved: boolean;
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
  "lane-sweep": "LANE SWEEP",
  "column-scan": "COLUMN SCAN",
  "pursuit-dash": "PURSUIT DASH",
  "mortar-spread": "MORTAR SPREAD",
  "pulse-grid": "PULSE GRID",
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
function loadRecords(): StoredRecords {
  if (typeof window === "undefined") return { highScore: 0, bestWave: 0 };
  try {
    const r = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      highScore: Number(r.highScore) || 0,
      bestWave: Number(r.bestWave) || 0,
    };
  } catch {
    return { highScore: 0, bestWave: 0 };
  }
}

export class GameWorld {
  private readonly clock = new FixedStepClock();
  private readonly panelSystem = new PanelSystem();
  private readonly objectSystem = new ObjectSystem();
  private readonly projectileSystem = new ProjectileSystem();
  private readonly objectNextTriggerAt = new Map<string, number>();
  private readonly objectTriggerCount = new Map<string, number>();
  private pendingMelee: PendingMelee[] = [];
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
  private retaliateDamage = 0;
  private nextCardBoost = 1;
  private normalShotDamageMultiplier = 1;
  private contaminationActive = false;
  private forcedRepairDrainActive = false;
  private nextForcedRepairDrainAt = 0;
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
  private records = loadRecords();
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
      this.message = `WAVE 0${this.wave} デモ — カードを選択`;
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
  };

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
    this.updateMeleeAttacks(now);
    for (const enemy of this.enemies) {
      this.updateStatus(enemy, now);
      this.updateEnemy(enemy, now);
    }
    this.updateForcedRepairDrain(now);
    this.emotionSystem.update(now, this.playerHp, this.playerMaxHp, this.sync);
    this.syncBoardOccupancy();
    if (this.playerHp <= 0) {
      this.finishRun(false);
      return;
    }
    if (this.enemies.every(enemy => enemy.state === "deleted"))
      this.finishWave();
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
  private updateEnemy(enemy: Enemy, now: number): void {
    if (enemy.state === "deleted") return;
    if (enemy.state === "stunned") {
      if (now >= enemy.stunnedUntil) {
        enemy.state = "recover";
        enemy.recoverUntil = now + 430;
      }
      return;
    }
    if (enemy.state === "windup") {
      if (now >= enemy.windupUntil) {
        enemy.state = "recover";
        enemy.recoverUntil = now + 460;
        this.clearWarnings(enemy);
        enemy.lockedTargets.forEach((target, index) => {
          const motion =
            enemy.pattern === "mortar-spread" || enemy.pattern === "pulse-grid"
              ? "thrown"
              : "straight";
          const projectile = this.projectileSystem.spawn(
            {
              owner: "enemy",
              motion,
              position: { ...enemy.grid },
              target,
              damage: enemy.attackDamage,
              sourceId: enemy.id,
              activeAt: now + 250 + index * 105,
              flightMs:
                motion === "thrown"
                  ? COMBAT_BALANCE.projectile.thrownFlightMs
                  : 0,
              speedCellsPerSecond:
                motion === "thrown"
                  ? COMBAT_BALANCE.projectile.defaultSpeedCellsPerSecond
                  : 11,
              rowSpan: false,
            },
            now
          );
          this.onEvent({
            type: "projectile",
            id: projectile.id,
            motion: projectile.motion,
            from: { ...enemy.grid },
            to: target,
            side: "enemy",
          });
        });
        enemy.lockedTargets = [];
      }
      return;
    }
    if (enemy.state === "recover") {
      if (now >= enemy.recoverUntil) {
        if (now >= enemy.rootUntil) this.reposition(enemy);
        enemy.state = "idle";
        enemy.nextAttackAt =
          now + enemy.cooldownMs + (now < enemy.slowUntil ? 620 : 0);
      }
      return;
    }
    if (now >= enemy.nextAttackAt) this.prepareAttack(enemy, now);
  }
  private prepareAttack(enemy: Enemy, now: number): void {
    enemy.cycle += 1;
    enemy.lockedTargets = this.targetsFor(enemy);
    if (enemy.pattern === "pursuit-dash" && now >= enemy.rootUntil)
      enemy.grid = { col: 3, row: this.playerGrid.row };
    enemy.state = "windup";
    enemy.windupUntil =
      now + enemy.windupMs + (now < enemy.slowUntil ? 280 : 0);
    enemy.attackStartedAt = now;
    enemy.counterWindowState = createCounterWindow(
      now,
      enemy.windupUntil,
      enemy.counterWindowMs,
      COMBAT_BALANCE.counter.endMarginMs
    );
    enemy.counterStartAt = enemy.counterWindowState.startAt;
    enemy.counterEndAt = enemy.counterWindowState.endAt;
    enemy.lockedTargets.forEach(target =>
      this.onEvent({ type: "warning", at: target, enabled: true })
    );
    this.message = `${enemy.name} — ${PATTERN_LABEL[enemy.pattern as Pattern]}`;
  }
  private targetsFor(enemy: Enemy): GridPosition[] {
    const p = { ...this.playerGrid };
    switch (enemy.pattern) {
      case "lane-sweep":
        return [0, 1, 2].map(col => ({ col, row: p.row }));
      case "column-scan":
        return [0, 1, 2].map(row => ({ col: p.col, row }));
      case "pursuit-dash":
        return [p];
      case "mortar-spread":
        return uniqueTiles([
          p,
          { col: p.col === 2 ? 1 : p.col + 1, row: p.row },
          { col: p.col, row: p.row === 2 ? 1 : p.row + 1 },
        ]);
      case "pulse-grid":
        return playerTiles().filter(
          tile => (tile.col + tile.row + enemy.cycle) % 2 === 0
        );
      default:
        return [p];
    }
  }
  private reposition(enemy: Enemy): void {
    if (enemy.pattern === "lane-sweep")
      enemy.grid.row = (enemy.grid.row + 1) % 3;
    if (enemy.pattern === "column-scan")
      enemy.grid.row = (enemy.grid.row + 2) % 3;
    if (enemy.pattern === "pulse-grid")
      enemy.grid.row = (enemy.grid.row + 1) % 3;
  }
  private clearWarnings(enemy: Enemy): void {
    enemy.lockedTargets.forEach(target =>
      this.onEvent({ type: "warning", at: target, enabled: false })
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
    this.message = this.isCharging ? "チャージを維持して移動" : "位置を更新";
    this.notify();
  }
  private fire(): void {
    const now = this.gameTimeMs;
    if (
      this.mode !== "battle" ||
      this.paused ||
      this.isCharging ||
      now < this.nextFireAt ||
      now < this.playerControlLockedUntil
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
      speedCellsPerSecond: COMBAT_BALANCE.normalShot.speedCellsPerSecond,
    });
    this.message = "正面へ通常弾を発射";
    this.notify();
  }
  private startCharge(): void {
    if (
      this.mode === "battle" &&
      !this.paused &&
      this.gameTimeMs >= this.playerControlLockedUntil
    )
      this.isCharging = true;
  }
  private releaseCharge(): void {
    if (
      this.mode !== "battle" ||
      this.paused ||
      !this.isCharging ||
      this.gameTimeMs < this.playerControlLockedUntil
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
      this.gameTimeMs < this.playerControlLockedUntil
    )
      return;
    const card = this.queue.shift();
    if (!card) return;
    const usedSync = this.sync;
    const rageReady = this.emotionSystem.snapshot(this.gameTimeMs).rageReady;
    const power = Math.round(
      card.power * (usedSync || rageReady ? 2 : 1) * this.nextCardBoost
    );
    this.nextCardBoost = 1;
    const resolution = this.cardTargets(card.target);
    this.applyPlayerCardEffect(card);
    const attackTiles = this.dispatchCardAttack(card, power);
    const displayTiles =
      attackTiles.length > 0 ? attackTiles : resolution.tiles;
    this.onEvent({ type: "attack", charged: card.tier === "mega" });
    this.onEvent({
      type: "card",
      cardId: card.id,
      at: { ...(displayTiles[0] ?? this.playerGrid) },
      tiles: displayTiles,
      family: card.family,
      tier: card.tier,
      target: card.target,
      status: card.status,
    });
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
    if (card.power > 0) {
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
    if (
      card.id === "overload-forced-repair" ||
      card.id === "overload-collapse-field"
    )
      return [];
    if (card.power <= 0) return [];
    if (card.family === "近接") return this.dispatchMeleeCard(card, power);
    const scaleDamage = (base: number): number =>
      card.power > 0
        ? Math.max(0, Math.round((base * power) / card.power))
        : base;
    const origin = { ...this.playerGrid };
    const right = { col: 1, row: 0 };
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
    ): GridPosition => {
      spawn(
        {
          owner: "player",
          motion: "straight",
          position: origin,
          direction: right,
          damage: scaleDamage(damage),
          sourceCardId: card.id,
          ...options,
        },
        delayMs
      );
      return { col: 5, row: origin.row };
    };
    if (card.id === "overload-limit-cannon") {
      const lostHp = Math.max(0, this.playerMaxHp - this.playerHp);
      return [
        straight(
          Math.min(
            COMBAT_BALANCE.overload.limitCannonMaxDamage,
            Math.max(1, lostHp * 2)
          )
        ),
      ];
    }
    if (card.id === "overload-contamination") {
      straight(COMBAT_BALANCE.overload.contaminationDamage, {
        splashRadius: 1,
        stopOnObject: false,
      });
      return [3, 4, 5].flatMap(col =>
        [origin.row - 1, origin.row, origin.row + 1]
          .filter(row => row >= 0 && row < 3)
          .map(row => ({ col, row }))
      );
    }
    if (card.id === "rapid") {
      for (let index = 0; index < 3; index += 1) straight(12, {}, index * 90);
      return [3, 4, 5].map(col => ({ col, row: origin.row }));
    }
    if (card.id === "lance") {
      straight(60, { motion: "piercing", stopOnObject: false });
      return [3, 4, 5].map(col => ({ col, row: origin.row }));
    }
    if (card.id === "seeker") {
      straight(45);
      return [3, 4, 5].map(col => ({ col, row: origin.row }));
    }
    if (card.id === "triplet") {
      for (let index = 0; index < 3; index += 1) straight(20, {}, index * 160);
      return [3, 4, 5].map(col => ({ col, row: origin.row }));
    }
    if (card.id === "wide" || card.id === "frost") {
      straight(card.id === "wide" ? 40 : 35, {
        motion: "wave",
        rowSpan: true,
        stopOnObject: false,
      });
      return [3, 4, 5].flatMap(col => [0, 1, 2].map(row => ({ col, row })));
    }
    if (
      card.id === "column" ||
      card.id === "fireline" ||
      card.id === "thunderline" ||
      card.id === "breakpillar"
    ) {
      const target = { col: Math.min(5, origin.col + 2), row: origin.row };
      spawn({
        owner: "player",
        motion: "thrown",
        position: origin,
        target,
        damage: scaleDamage(
          card.id === "column" ? 55 : card.id === "breakpillar" ? 90 : 40
        ),
        sourceCardId: card.id,
        rowSpan: true,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      return [0, 1, 2].map(row => ({ col: target.col, row }));
    }
    if (card.id === "cross") {
      straight(40, { splashRadius: 1 });
      return [3, 4, 5].flatMap(col =>
        [origin.row, origin.row - 1, origin.row + 1]
          .filter(row => row >= 0 && row < 3)
          .map(row => ({ col, row }))
      );
    }
    if (card.id === "fan") {
      for (const direction of [
        { col: 1, row: 0 },
        { col: 1, row: -1 },
        { col: 1, row: 1 },
      ])
        spawn({
          owner: "player",
          motion: "straight",
          position: origin,
          direction,
          damage: scaleDamage(30),
          sourceCardId: card.id,
        });
      return [3, 4, 5].flatMap(col =>
        [origin.row - 1, origin.row, origin.row + 1]
          .filter(row => row >= 0 && row < 3)
          .map(row => ({ col, row }))
      );
    }
    if (card.id === "volt") {
      spawn({
        owner: "player",
        motion: "homing",
        position: origin,
        direction: right,
        damage: scaleDamage(45),
        sourceCardId: card.id,
        speedCellsPerSecond: 8,
      });
      return [3, 4, 5].map(col => ({ col, row: origin.row }));
    }
    if (card.id === "web") {
      spawn({
        owner: "player",
        motion: "thrown",
        position: origin,
        target: { col: 4, row: origin.row },
        damage: scaleDamage(25),
        sourceCardId: card.id,
        splashRadius: 1,
        flightMs: COMBAT_BALANCE.projectile.thrownFlightMs,
      });
      return uniqueTiles(
        [
          { col: 4, row: origin.row },
          { col: 4, row: origin.row - 1 },
          { col: 4, row: origin.row + 1 },
          { col: 3, row: origin.row },
          { col: 5, row: origin.row },
        ].filter(tile => tile.row >= 0 && tile.row < 3)
      );
    }
    if (card.id === "meteor") {
      const targets = this.enemies
        .filter(enemy => enemy.state !== "deleted")
        .map(enemy => enemy.grid);
      for (let index = 0; index < 8; index += 1) {
        const target = targets[index % Math.max(1, targets.length)] ?? {
          col: 3 + (index % 3),
          row: index % 3,
        };
        spawn({
          owner: "player",
          motion: "thrown",
          position: origin,
          target,
          damage: scaleDamage(25),
          sourceCardId: card.id,
          flightMs: COMBAT_BALANCE.projectile.thrownFlightMs + index * 35,
        });
      }
      return targets.length > 0
        ? targets.map(target => ({ ...target }))
        : [{ col: 4, row: 1 }];
    }
    if (
      card.family === "射撃" ||
      card.family === "属性" ||
      card.family === "範囲" ||
      card.family === "高出力"
    ) {
      straight(power, {
        motion: card.family === "範囲" ? "wave" : "straight",
        rowSpan: card.family === "範囲",
      });
      return this.resolutionTilesFor(card.target, origin);
    }
    return [];
  }
  private dispatchMeleeCard(card: Card, power: number): GridPosition[] {
    const resolvedPower =
      card.id === "overload-severing-blade"
        ? Math.round(
            COMBAT_BALANCE.overload.severingBladeDamage *
              (power / Math.max(1, card.power))
          )
        : power;
    const target =
      card.id === "dashslash" || card.id === "overload-severing-blade"
        ? (this.closestEnemy()?.grid ?? null)
        : (this.frontTarget()?.grid ?? null);
    const plan = createMeleePlan(
      this.playerGrid,
      target,
      resolvedPower,
      getMeleeRange(card),
      {
        dash: card.id === "dashslash" || card.id === "overload-severing-blade",
        cross: card.id === "gridcut",
        timing: { startupMs: card.id === "moonblade" ? 220 : 90 },
        canEnter: position =>
          this.panelSystem.canEnter(position, "player", candidate =>
            this.objectSystem.isSolidAt(candidate)
          ),
      }
    );
    const recoveryAt =
      this.gameTimeMs +
      plan.timing.startupMs +
      plan.timing.activeMs +
      plan.timing.recoveryMs;
    this.pendingMelee.push({
      card,
      damage: power,
      tiles: plan.tiles,
      dashTo: plan.dashTo,
      returnTo: plan.returnTo,
      activeAt: this.gameTimeMs + plan.timing.startupMs,
      recoveryAt,
      hitResolved: false,
    });
    this.playerControlLockedUntil = Math.max(
      this.playerControlLockedUntil,
      recoveryAt
    );
    return plan.tiles;
  }
  private updateMeleeAttacks(now: number): void {
    for (const attack of this.pendingMelee) {
      if (!attack.hitResolved && now >= attack.activeAt) {
        if (attack.dashTo && !sameTile(attack.dashTo, this.playerGrid)) {
          const previous = { ...this.playerGrid };
          this.panelSystem.vacate(previous, now);
          this.playerGrid = { ...attack.dashTo };
          this.panelSystem.occupy(this.playerGrid, "player");
        }
        this.enemies
          .filter(
            enemy =>
              enemy.state !== "deleted" &&
              attack.tiles.some(tile => sameTile(tile, enemy.grid))
          )
          .forEach(enemy =>
            this.strikeEnemy(enemy, attack.damage, attack.card, false)
          );
        attack.hitResolved = true;
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
    if (projectile.owner === "enemy") return { ...this.playerGrid };
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
    if (objectId) {
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
        .forEach(enemy =>
          this.strikeEnemy(enemy, projectile.damage, card, projectile.charged)
        );
      return;
    }
    if (targetIds.includes("player"))
      this.applyPlayerHit(projectile.damage, projectile.sourceId ?? undefined);
  }
  private applyPlayerHit(damage: number, enemyId?: string): void {
    const now = this.gameTimeMs;
    if (now < this.invincibleUntil) {
      this.message = "位相回避";
      this.onEvent({
        type: "player-reaction",
        at: { ...this.playerGrid },
        kind: "phase",
        enemyId,
      });
      return;
    }
    if (now < this.playerDamageInvulnerableUntil) return;
    let remaining = Math.max(0, damage);
    if (this.barrier > 0) {
      const absorbed = Math.min(this.barrier, remaining);
      this.barrier -= absorbed;
      remaining -= absorbed;
      this.message = remaining > 0 ? "障壁損傷" : "障壁防御";
      if (remaining === 0)
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "barrier",
          enemyId,
          damage: absorbed,
        });
    }
    if (remaining > 0) {
      this.playerHp = Math.max(0, this.playerHp - remaining);
      this.playerControlLockedUntil =
        now + COMBAT_BALANCE.playerHit.controlLockMs;
      this.playerDamageInvulnerableUntil =
        now + COMBAT_BALANCE.playerHit.invulnerableMs;
      this.sync = false;
      this.emotionSystem.recordDamage(
        now,
        remaining,
        this.playerHp,
        this.playerMaxHp
      );
      if (this.emotionSystem.isRageStaggerImmune(now))
        this.playerControlLockedUntil = now;
      this.message = "被弾 — 退避してください";
      this.onEvent({
        type: "impact",
        at: { ...this.playerGrid },
        side: "enemy",
        enemyId,
        damage: remaining,
      });
      this.onEvent({
        type: "player-reaction",
        at: { ...this.playerGrid },
        kind: "damage",
        enemyId,
        damage: remaining,
      });
    }
    if (this.retaliateDamage > 0 && enemyId) {
      const source = this.enemies.find(enemy => enemy.id === enemyId);
      if (source && source.state !== "deleted")
        this.strikeEnemy(source, this.retaliateDamage, undefined, false);
      this.retaliateDamage = 0;
      this.message = "反撃信号を送信";
      this.onEvent({
        type: "player-reaction",
        at: { ...this.playerGrid },
        kind: "counter",
        enemyId,
      });
    }
  }
  private healPlayer(amount: number): void {
    const adjusted = Math.floor(
      Math.max(0, amount) * this.emotionSystem.healMultiplier()
    );
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + adjusted);
  }
  private updateFieldObjects(now: number): void {
    const beforeExpiry = this.objectSystem
      .snapshot()
      .filter(object => object.expiresAt !== null && now >= object.expiresAt);
    beforeExpiry
      .filter(object => object.kind === "bomb" && object.trigger === "timer")
      .forEach(object => this.triggerObjectExplosion(object.panel, 90));
    for (const object of this.objectSystem.snapshot()) {
      const nextTriggerAt = this.objectNextTriggerAt.get(object.id) ?? now;
      if (now < nextTriggerAt) continue;
      if (
        object.kind === "mine" &&
        object.trigger === "enemy-contact" &&
        this.enemies.some(
          enemy =>
            enemy.state !== "deleted" && sameTile(enemy.grid, object.panel)
        )
      ) {
        this.triggerObjectExplosion(object.panel, 100);
        this.removeFieldObject(object.id);
        continue;
      }
      if (object.kind === "stake" && object.trigger === "enemy-contact") {
        const target = this.enemies.find(
          enemy =>
            enemy.state !== "deleted" &&
            Math.abs(enemy.grid.col - object.panel.col) <= 1 &&
            Math.abs(enemy.grid.row - object.panel.row) <= 1
        );
        if (target) {
          this.strikeEnemy(target, 10, undefined, false);
          target.rootUntil = Math.max(target.rootUntil, now + 650);
          const count = (this.objectTriggerCount.get(object.id) ?? 0) + 1;
          this.objectTriggerCount.set(object.id, count);
          if (count >= 5) this.removeFieldObject(object.id);
          else this.objectNextTriggerAt.set(object.id, now + 600);
        }
      }
      if (object.kind === "turret" && object.trigger === "timer") {
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
            damage: 12,
            sourceId: object.id,
            speedCellsPerSecond: COMBAT_BALANCE.normalShot.speedCellsPerSecond,
          });
          this.objectNextTriggerAt.set(object.id, now + 400);
        }
      }
      if (object.kind === "field-device" && object.trigger === "contact") {
        this.enemies
          .filter(
            enemy =>
              enemy.state !== "deleted" &&
              Math.abs(enemy.grid.col - object.panel.col) <= 1 &&
              Math.abs(enemy.grid.row - object.panel.row) <= 1
          )
          .forEach(enemy => this.strikeEnemy(enemy, 8, undefined, false));
        this.objectNextTriggerAt.set(object.id, now + 1000);
      }
    }
    this.objectSystem.update(now).forEach(object => {
      this.panelSystem.detachObject(object.panel, object.id);
      this.objectNextTriggerAt.delete(object.id);
      this.objectTriggerCount.delete(object.id);
    });
  }
  private triggerObjectExplosion(panel: GridPosition, damage: number): void {
    this.enemies
      .filter(
        enemy =>
          enemy.state !== "deleted" &&
          Math.abs(enemy.grid.col - panel.col) <= 1 &&
          Math.abs(enemy.grid.row - panel.row) <= 1
      )
      .forEach(enemy => this.strikeEnemy(enemy, damage, undefined, false));
    this.onEvent({ type: "impact", at: { ...panel }, side: "player", damage });
  }
  private removeFieldObject(id: string): void {
    const object = this.objectSystem.remove(id);
    if (!object) return;
    this.panelSystem.detachObject(object.panel, object.id);
    this.objectNextTriggerAt.delete(id);
    this.objectTriggerCount.delete(id);
  }
  private applyPlayerCardEffect(card: Card): void {
    if (card.isOverload) this.applyOverloadEffect(card);
    const value = card.effectValue ?? 0;
    if (card.status === "barrier")
      this.barrier = Math.min(220, this.barrier + value);
    if (card.id === "dream" || card.status === "invincible")
      this.invincibleUntil = Math.max(
        this.invincibleUntil,
        this.gameTimeMs + COMBAT_BALANCE.phase.invincibilityMs
      );
    if (card.status === "recover") {
      this.healPlayer(value);
      this.emotionSystem.recover();
      if (card.id === "sanctum" || card.id === "sanctuary")
        this.barrier = Math.min(220, this.barrier + 42);
    }
    if (
      card.status === "gauge" &&
      card.id !== "fastsync" &&
      card.id !== "reroute" &&
      card.id !== "sector"
    )
      this.customSystem.add(value);
    if (card.id === "fastsync")
      this.customSystem.setTemporaryMultiplier(
        COMBAT_BALANCE.custom.fastSyncMultiplier,
        COMBAT_BALANCE.custom.fastSyncDurationMs,
        this.gameTimeMs
      );
    if (card.id === "reroute") this.customSystem.fill();
    if (card.status === "boost") this.nextCardBoost = value / 100;
    if (card.status === "counter") this.retaliateDamage = value;
    if (card.id === "magguard") this.barrier = Math.min(220, this.barrier + 24);
    if (card.id === "sector")
      this.panelSystem.expandEnemyFront(
        this.gameTimeMs,
        TERRITORY_EXPANSION_DURATION_MS
      );
    if (card.id === "sanctum" || card.id === "sanctuary")
      this.paintSanctuary(card.id === "sanctuary" ? 10000 : 8000);
    if (card.id === "crack")
      [1, 2].forEach(offset =>
        this.panelSystem.crack({
          col: this.playerGrid.col + offset,
          row: this.playerGrid.row,
        })
      );
    if (card.id === "hole")
      this.panelSystem
        .snapshot()
        .filter(
          panel =>
            panel.owner === "enemy" &&
            panel.occupantId === null &&
            panel.objectId === null
        )
        .slice(0, 3)
        .forEach(panel =>
          this.panelSystem.setTerrain(panel, "hole", this.gameTimeMs, 8000)
        );
    if (card.id === "toxic")
      this.placeFieldObject(
        "field-device",
        this.closestEmptyEnemyPanel(),
        70,
        5000,
        "contact"
      );
    if (card.id === "timer")
      this.placeFieldObject(
        "bomb",
        this.closestEmptyEnemyPanel(),
        50,
        2000,
        "timer"
      );
    if (card.id === "watchmine")
      this.placeFieldObject(
        "mine",
        this.closestEmptyEnemyPanel(),
        50,
        null,
        "enemy-contact"
      );
    if (card.id === "turret")
      this.placeFieldObject(
        "turret",
        { col: 2, row: this.playerGrid.row },
        60,
        4000,
        "timer"
      );
    if (card.id === "stake")
      this.placeFieldObject(
        "stake",
        this.closestEmptyEnemyPanel(),
        40,
        5000,
        "enemy-contact"
      );
    if (card.id === "block")
      this.placeFieldObject(
        "cube",
        { col: this.playerGrid.col + 1, row: this.playerGrid.row },
        100,
        null,
        "damage"
      );
    this.syncCustomRemaining();
  }

  private applyOverloadEffect(card: Card): void {
    const result = this.emotionSystem.registerOverload();
    this.playerMaxHp = Math.max(
      1,
      this.playerMaxHp - result.appliedMaxHpReduction
    );
    this.playerHp = Math.min(this.playerHp, this.playerMaxHp);
    this.score = Math.max(0, this.score - COMBAT_BALANCE.overload.scorePenalty);
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
    positions.forEach(position =>
      this.panelSystem.setTerrain(position, "holy", this.gameTimeMs, durationMs)
    );
  }

  private closestEmptyEnemyPanel(): GridPosition {
    const enemy = this.closestEnemy();
    const candidates = [
      enemy?.grid,
      ...this.panelSystem
        .snapshot()
        .filter(panel => panel.owner === "enemy")
        .map(panel => ({ col: panel.col, row: panel.row })),
    ].filter((position): position is GridPosition => Boolean(position));
    return (
      candidates.find(position => {
        const panel = this.panelSystem.get(position);
        return (
          panel?.occupantId === null &&
          panel.objectId === null &&
          panel.terrain !== "hole"
        );
      }) ?? { col: 5, row: 1 }
    );
  }

  private placeFieldObject(
    kind: FieldObjectKind,
    preferred: GridPosition,
    hp: number,
    lifetimeMs: number | null,
    trigger: Parameters<ObjectSystem["place"]>[0]["trigger"]
  ): void {
    const candidates = [
      preferred,
      ...this.panelSystem
        .snapshot()
        .map(panel => ({ col: panel.col, row: panel.row })),
    ];
    const panel = candidates.find(position => {
      const state = this.panelSystem.get(position);
      return (
        state?.occupantId === null &&
        state.objectId === null &&
        state.terrain !== "hole"
      );
    });
    if (!panel) return;
    const result = this.objectSystem.place({
      id: `${kind}-${this.gameTimeMs}-${this.objectSystem.snapshot().length}`,
      owner: "player",
      kind,
      panel,
      hp,
      expiresAt: lifetimeMs === null ? null : this.gameTimeMs + lifetimeMs,
      trigger,
    });
    if (result.removed) {
      this.panelSystem.detachObject(result.removed.panel, result.removed.id);
      this.objectNextTriggerAt.delete(result.removed.id);
      this.objectTriggerCount.delete(result.removed.id);
    }
    if (result.object) {
      this.panelSystem.attachObject(result.object.panel, result.object.id);
      const firstTriggerDelay =
        kind === "turret" ? 400 : kind === "field-device" ? 1000 : 0;
      this.objectNextTriggerAt.set(
        result.object.id,
        this.gameTimeMs + firstTriggerDelay
      );
      this.objectTriggerCount.set(result.object.id, 0);
    }
  }
  private closestEnemy(): Enemy | undefined {
    return [...this.enemies]
      .filter(enemy => enemy.state !== "deleted")
      .sort(
        (a, b) =>
          Math.abs(a.grid.row - this.playerGrid.row) -
            Math.abs(b.grid.row - this.playerGrid.row) ||
          a.grid.col - b.grid.col
      )[0];
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
  private cardTargets(shape: TargetShape): {
    tiles: GridPosition[];
    enemies: Enemy[];
  } {
    const row = this.playerGrid.row;
    const tiles =
      shape === "self"
        ? [{ ...this.playerGrid }]
        : shape === "near"
          ? [0, 1, 2].map(targetRow => ({ col: 3, row: targetRow }))
          : shape === "front" || shape === "row"
            ? [3, 4, 5].map(col => ({ col, row }))
            : shape === "column"
              ? [0, 1, 2].map(targetRow => ({ col: 4, row: targetRow }))
              : shape === "cross"
                ? uniqueTiles([
                    { col: 3, row },
                    { col: 4, row },
                    { col: 5, row },
                    { col: 4, row: 0 },
                    { col: 4, row: 2 },
                  ])
                : [3, 4, 5].flatMap(col =>
                    [0, 1, 2].map(targetRow => ({ col, row: targetRow }))
                  );
    const enemies = this.enemies.filter(
      enemy =>
        enemy.state !== "deleted" &&
        tiles.some(tile => sameTile(tile, enemy.grid))
    );
    return { tiles, enemies };
  }
  private strikeEnemy(
    enemy: Enemy,
    damage: number,
    card: Card | undefined,
    charged: boolean
  ): void {
    if (enemy.state === "deleted") return;
    enemy.hp = Math.max(0, enemy.hp - damage);
    const counter = Boolean(
      card &&
        card.power > 0 &&
        !charged &&
        enemy.state === "windup" &&
        isCounterWindowOpen(this.gameTimeMs, enemy.counterWindowState)
    );
    if (counter) {
      this.clearWarnings(enemy);
      enemy.lockedTargets = [];
      enemy.state = "stunned";
      enemy.stunnedUntil = this.gameTimeMs + COMBAT_BALANCE.counter.stunMs;
      this.sync = this.emotionSystem.counterSuccess();
      this.counters += 1;
      this.score += 150;
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
      damage,
      status: card?.status,
      charged,
      counter,
    });
    if (card?.status)
      this.applyStatus(enemy, card.status, card.durationMs ?? 0);
    if (enemy.hp <= 0) {
      this.clearWarnings(enemy);
      enemy.state = "deleted";
      this.score += 100 + this.wave * 25;
      this.onEvent({ type: "deleted", id: enemy.id, at: { ...enemy.grid } });
      this.message = `${enemy.name} を停止`;
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
      enemy.stunnedUntil = Math.max(enemy.stunnedUntil, now + duration);
    }
    if (status === "root")
      enemy.rootUntil = Math.max(enemy.rootUntil, now + duration);
    if (status === "slow") {
      enemy.slowUntil = Math.max(enemy.slowUntil, now + duration);
      enemy.nextAttackAt += 350;
    }
  }

  private resetBoard(): void {
    this.panelSystem.reset();
    this.objectSystem.reset();
    this.projectileSystem.reset();
    this.pendingMelee = [];
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
      this.focusedCard = null;
      this.selectionError = null;
      this.message = `${card.name} の選択を解除`;
    } else if (
      this.selected.length > 0 &&
      !validateSelection(this.customHand, [...this.selected, index]).valid
    ) {
      const reason = validateSelection(this.customHand, [
        ...this.selected,
        index,
      ]).reason;
      this.focusedCard = null;
      this.selectionError = reason;
      this.message = reason;
    } else if (this.focusedCard !== index) {
      this.focusedCard = index;
      this.selectionError = null;
      this.message = `${card.name}: ${card.description} — もう一度タップで選択`;
    } else {
      const nextSelection = [...this.selected, index];
      const validation = validateSelection(this.customHand, nextSelection);
      if (validation.valid) {
        this.selected = nextSelection;
        this.focusedCard = null;
        this.selectionError = null;
        this.message = `${card.name} を ${this.selected.length} 番目に選択`;
      } else {
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
    this.queue = this.selected.flatMap(index => {
      const offered = this.customHand[index];
      if (!offered) return [];
      if (offered.isOverload) return [offered];
      const committedCard = offered.instanceId
        ? committedByInstance.get(offered.instanceId)
        : undefined;
      return committedCard ? [committedCard] : [];
    });
    this.focusedCard = null;
    this.selectionError = null;
    this.mode = "battle";
    this.clock.discardPendingTime();
    this.customSystem.resetGauge();
    this.syncCustomRemaining();
    this.message =
      this.queue.length > 0
        ? `WAVE 0${this.wave} — 接続開始`
        : `WAVE 0${this.wave} — カードなしで戦闘開始`;
    const now = this.gameTimeMs;
    this.enemies.forEach((enemy, index) => {
      if (enemy.state !== "deleted")
        enemy.nextAttackAt = now + 1050 + index * 510;
    });
    this.notify();
  }
  private finishWave(): void {
    if (this.mode !== "battle") return;
    this.score += 250 + Math.max(0, this.playerHp);
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
      const recovery = Math.ceil(this.playerMaxHp * 0.15);
      this.healPlayer(recovery);
      this.message = `WAVE 0${this.wave} 完了 — 耐久を15%回復`;
    } else this.finishRun(true);
    this.notify();
  }
  private nextWave(): void {
    if (this.mode !== "intermission") return;
    this.wave += 1;
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
    this.retaliateDamage = 0;
    this.nextCardBoost = 1;
    this.normalShotDamageMultiplier = 1;
    this.contaminationActive = false;
    this.forcedRepairDrainActive = false;
    this.nextForcedRepairDrainAt = 0;
    this.handSizeReduction = 0;
    this.hitstopRemainingMs = 0;
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.queue = [];
    this.selected = [];
    this.focusedCard = null;
    this.selectionError = null;
    this.resetBattleDeck();
    this.resetBoard();
    this.mode = "custom";
    this.message = `WAVE 0${this.wave} 接近 — カードを選択`;
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
    this.retaliateDamage = 0;
    this.nextCardBoost = 1;
    this.normalShotDamageMultiplier = 1;
    this.contaminationActive = false;
    this.forcedRepairDrainActive = false;
    this.nextForcedRepairDrainAt = 0;
    this.handSizeReduction = 0;
    this.wave = 1;
    this.score = 0;
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
  private finishRun(victory: boolean): void {
    this.projectileSystem.reset();
    this.pendingMelee = [];
    this.hitstopRemainingMs = 0;
    this.cancelCharge();
    this.objectSystem.reset();
    this.objectNextTriggerAt.clear();
    this.objectTriggerCount.clear();
    this.panelSystem.reset();
    this.syncBoardOccupancy();
    this.mode = "result";
    if (victory) {
      this.score = Math.max(
        0,
        this.score + this.counters * 80 + Math.ceil(this.playerHp / 10)
      );
      this.rank = this.score >= 1500 ? "S" : this.score >= 1000 ? "A" : "B";
      this.message = "ネットワーク制圧完了";
    } else {
      this.rank = "R";
      this.message = "信号が途絶しました";
    }
    this.records = {
      highScore: Math.max(this.records.highScore, this.score),
      bestWave: Math.max(this.records.bestWave, this.wave),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      /* Private browser modes can disallow storage. */
    }
  }
  private makeEnemies(wave: number): Enemy[] {
    const now = this.gameTimeMs;
    const scale = 1 + (wave - 1) * 0.18;
    const factory = (
      id: string,
      name: string,
      pattern: Pattern,
      hp: number,
      grid: GridPosition,
      damage: number,
      windupMs: number,
      cooldownMs: number
    ): Enemy => ({
      id,
      name,
      pattern,
      hp: Math.round(hp * scale),
      maxHp: Math.round(hp * scale),
      grid,
      state: "idle",
      counterWindow: false,
      windupUntil: 0,
      recoverUntil: 0,
      stunnedUntil: 0,
      nextAttackAt: now + 1900,
      attackDamage: Math.round(damage * scale),
      windupMs,
      cooldownMs,
      lockedTargets: [],
      cycle: 0,
      burnUntil: 0,
      nextBurnAt: 0,
      slowUntil: 0,
      rootUntil: 0,
      attackStartedAt: 0,
      counterStartAt: null,
      counterEndAt: null,
      counterWindowMs:
        COMBAT_BALANCE.counter.patternWindowMs[pattern] ??
        COMBAT_BALANCE.counter.windowMs,
      counterWindowState: null,
    });
    const layouts: (() => Enemy[])[] = [
      () => [
        factory(
          "bulwark",
          "BULWARK-3",
          "lane-sweep",
          132,
          { col: 4, row: 1 },
          24,
          1080,
          1550
        ),
        factory(
          "scanner",
          "SCANNER-8",
          "column-scan",
          90,
          { col: 5, row: 0 },
          18,
          820,
          1150
        ),
      ],
      () => [
        factory(
          "razor",
          "RAZOR-6",
          "pursuit-dash",
          84,
          { col: 4, row: 0 },
          22,
          600,
          850
        ),
        factory(
          "mortar",
          "MORTAR-NODE",
          "mortar-spread",
          152,
          { col: 5, row: 1 },
          25,
          1320,
          1800
        ),
        factory(
          "scanner",
          "SCANNER-8",
          "column-scan",
          96,
          { col: 3, row: 2 },
          19,
          840,
          1120
        ),
      ],
      () => [
        factory(
          "bulwark",
          "BULWARK-3",
          "lane-sweep",
          150,
          { col: 4, row: 1 },
          26,
          1060,
          1480
        ),
        factory(
          "razor",
          "RAZOR-6",
          "pursuit-dash",
          98,
          { col: 3, row: 0 },
          24,
          570,
          760
        ),
        factory(
          "sentinel",
          "VOLT-SENTINEL",
          "pulse-grid",
          118,
          { col: 5, row: 2 },
          21,
          980,
          1040
        ),
      ],
      () => [
        factory(
          "mortar",
          "MORTAR-NODE",
          "mortar-spread",
          170,
          { col: 5, row: 0 },
          29,
          1280,
          1680
        ),
        factory(
          "sentinel",
          "VOLT-SENTINEL",
          "pulse-grid",
          142,
          { col: 4, row: 2 },
          23,
          920,
          920
        ),
        factory(
          "bulwark",
          "BULWARK-3",
          "lane-sweep",
          166,
          { col: 3, row: 1 },
          30,
          980,
          1320
        ),
        factory(
          "razor",
          "RAZOR-6",
          "pursuit-dash",
          110,
          { col: 5, row: 2 },
          26,
          540,
          700
        ),
      ],
    ];
    return layouts[Math.min(wave - 1, layouts.length - 1)]();
  }
  private notify(): void {
    const now = this.gameTimeMs;
    const emotion = this.emotionSystem.snapshot(now);
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
      invincible: now < this.invincibleUntil,
      invincibleRemaining: Math.max(0, (this.invincibleUntil - now) / 1000),
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
          ...enemy
        }) => ({
          ...enemy,
          grid: { ...enemy.grid },
          counterWindow:
            this.sync &&
            enemy.state === "windup" &&
            isCounterWindowOpen(now, _cws),
        })
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
    });
  }
}
