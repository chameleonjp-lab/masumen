/** Signal Relay Tactical core: Japanese battle-chip cards resolve through shared target shapes, status effects, and counter windows. */
import { canAppendSelection, drawHand } from "./deck";
import { FixedStepClock } from "./core/FixedStepClock";
import { ObjectSystem } from "./systems/ObjectSystem";
import { PanelSystem } from "./systems/PanelSystem";
import type { BattleEvent, BattleSnapshot, Card, CardStatus, EnemySnapshot, EnemyState, FieldObjectKind, GameController, GridPosition, TargetShape } from "./types";

type Pattern = "lane-sweep" | "column-scan" | "pursuit-dash" | "mortar-spread" | "pulse-grid";
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
}
interface PendingShot {
  at: number;
  from: GridPosition;
  to: GridPosition;
  damage: number;
  enemyId: string;
}
interface StoredRecords {
  highScore: number;
  bestWave: number;
}

const PLAYER_MAX_HP = 220;
const FINAL_WAVE = 4;
const CUSTOM_INTERVAL_SECONDS = 10;
const INVINCIBILITY_DURATION_MS = 5000;
const TERRITORY_EXPANSION_DURATION_MS = 10000;
const STORAGE_KEY = "grid-signal-arena-records-v2";
const PATTERN_LABEL: Record<Pattern, string> = {
  "lane-sweep": "LANE SWEEP",
  "column-scan": "COLUMN SCAN",
  "pursuit-dash": "PURSUIT DASH",
  "mortar-spread": "MORTAR SPREAD",
  "pulse-grid": "PULSE GRID",
};
const playerTiles = () => Array.from({ length: 3 }, (_, col) => Array.from({ length: 3 }, (_, row) => ({ col, row }))).flat();
const sameTile = (a: GridPosition, b: GridPosition) => a.col === b.col && a.row === b.row;
const uniqueTiles = (tiles: GridPosition[]) => tiles.filter((tile, index) => tiles.findIndex(other => sameTile(other, tile)) === index);
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
  private gameTimeMs = 0;
  private hitstopRemainingMs = 0;
  private mode: BattleSnapshot["mode"] = "custom";
  private playerHp = PLAYER_MAX_HP;
  private playerGrid: GridPosition = { col: 1, row: 1 };
  private gauge = 0;
  private sync = false;
  private charging = 0;
  private isCharging = false;
  private barrier = 0;
  private invincibleUntil = 0;
  private retaliateDamage = 0;
  private nextCardBoost = 1;
  private customHand = drawHand(0);
  private selected: number[] = [];
  private focusedCard: number | null = null;
  private queue: Card[] = [];
  private wave = 1;
  private score = 0;
  private records = loadRecords();
  private enemies: Enemy[] = [];
  private message = "カードを選択してください";
  private elapsed = 0;
  private counters = 0;
  private rank = "—";
  private round = 0;
  private notifyTimer = 0;
  private pendingShots: PendingShot[] = [];
  private paused = false;
  private customRemaining = CUSTOM_INTERVAL_SECONDS;
  private nextFireAt = 0;
  private onSnapshot: (snapshot: BattleSnapshot) => void;
  private onEvent: (event: BattleEvent) => void;

  constructor(onSnapshot: (snapshot: BattleSnapshot) => void, onEvent: (event: BattleEvent) => void, startWave = 1) {
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    if (startWave > 1 && startWave <= FINAL_WAVE) {
      this.wave = startWave;
      this.round = startWave - 1;
      this.customHand = drawHand(this.round);
      this.message = `WAVE 0${this.wave} デモ — カードを選択`;
    }
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
    this.customRemaining = Math.max(0, this.customRemaining - delta);
    this.gauge = Math.min(100, (1 - this.customRemaining / CUSTOM_INTERVAL_SECONDS) * 100);
    if (this.isCharging) this.charging = Math.min(1, this.charging + delta * 0.85);
    const now = this.gameTimeMs;
    const panelUpdate = this.panelSystem.update(now);
    this.objectSystem.update(now).forEach(object => this.panelSystem.detachObject(object.panel, object.id));
    this.syncBoardOccupancy();
    if (panelUpdate.restoredTerritoryColumns.length > 0) this.returnPlayerToSafeTerritory();
    if (this.customRemaining <= 0) {
      this.beginCustom("カスタムタイム — 次のカードを選択");
      return;
    }
    this.pendingShots = this.pendingShots.filter(shot => {
      if (now < shot.at) return true;
      if (!sameTile(this.playerGrid, shot.to)) {
        this.message = "回避成功";
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "dodge",
          enemyId: shot.enemyId,
        });
        return false;
      }
      if (now < this.invincibleUntil) {
        this.message = "位相回避";
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "phase",
          enemyId: shot.enemyId,
        });
        return false;
      }
      let remaining = shot.damage;
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
            enemyId: shot.enemyId,
            damage: absorbed,
          });
      }
      if (remaining > 0) {
        this.playerHp = Math.max(0, this.playerHp - remaining);
        this.sync = false;
        this.message = "被弾 — 退避してください";
        this.onEvent({ type: "impact", at: shot.to, side: "enemy" });
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "damage",
          enemyId: shot.enemyId,
          damage: remaining,
        });
      }
      if (this.retaliateDamage > 0) {
        const source = this.enemies.find(enemy => enemy.id === shot.enemyId);
        if (source && source.state !== "deleted") this.strikeEnemy(source, this.retaliateDamage, undefined, false);
        this.retaliateDamage = 0;
        this.message = "反撃信号を送信";
        this.onEvent({
          type: "player-reaction",
          at: { ...this.playerGrid },
          kind: "counter",
          enemyId: shot.enemyId,
        });
      }
      if (this.playerHp <= 0) this.finishRun(false);
      return false;
    });
    for (const enemy of this.enemies) {
      this.updateStatus(enemy, now);
      this.updateEnemy(enemy, now);
    }
    this.syncBoardOccupancy();
    if (this.enemies.every(enemy => enemy.state === "deleted")) this.finishWave();
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
          this.pendingShots.push({
            at: now + 250 + index * 105,
            from: { ...enemy.grid },
            to: target,
            damage: enemy.attackDamage,
            enemyId: enemy.id,
          });
          this.onEvent({
            type: "projectile",
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
        enemy.nextAttackAt = now + enemy.cooldownMs + (now < enemy.slowUntil ? 620 : 0);
      }
      return;
    }
    if (now >= enemy.nextAttackAt) this.prepareAttack(enemy, now);
  }
  private prepareAttack(enemy: Enemy, now: number): void {
    enemy.cycle += 1;
    enemy.lockedTargets = this.targetsFor(enemy);
    if (enemy.pattern === "pursuit-dash" && now >= enemy.rootUntil) enemy.grid = { col: 3, row: this.playerGrid.row };
    enemy.state = "windup";
    enemy.windupUntil = now + enemy.windupMs + (now < enemy.slowUntil ? 280 : 0);
    enemy.lockedTargets.forEach(target => this.onEvent({ type: "warning", at: target, enabled: true }));
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
        return uniqueTiles([p, { col: p.col === 2 ? 1 : p.col + 1, row: p.row }, { col: p.col, row: p.row === 2 ? 1 : p.row + 1 }]);
      case "pulse-grid":
        return playerTiles().filter(tile => (tile.col + tile.row + enemy.cycle) % 2 === 0);
      default:
        return [p];
    }
  }
  private reposition(enemy: Enemy): void {
    if (enemy.pattern === "lane-sweep") enemy.grid.row = (enemy.grid.row + 1) % 3;
    if (enemy.pattern === "column-scan") enemy.grid.row = (enemy.grid.row + 2) % 3;
    if (enemy.pattern === "pulse-grid") enemy.grid.row = (enemy.grid.row + 1) % 3;
  }
  private clearWarnings(enemy: Enemy): void {
    enemy.lockedTargets.forEach(target => this.onEvent({ type: "warning", at: target, enabled: false }));
  }

  private syncBoardOccupancy(): void {
    this.panelSystem.clearOccupants();
    this.panelSystem.occupy(this.playerGrid, "player");
    for (const enemy of this.enemies) {
      if (enemy.state === "deleted") continue;
      if (this.panelSystem.occupy(enemy.grid, enemy.id)) continue;
      const fallback = this.panelSystem.findNearestSafePosition(enemy.grid, "enemy", position => this.objectSystem.isSolidAt(position));
      if (fallback) {
        enemy.grid = fallback;
        this.panelSystem.occupy(enemy.grid, enemy.id);
      }
    }
  }

  private returnPlayerToSafeTerritory(): void {
    const current = this.panelSystem.get(this.playerGrid);
    if (current && current.owner === "player" && current.terrain !== "hole" && current.objectId === null) return;
    const previous = { ...this.playerGrid };
    const safe = this.panelSystem.findNearestSafePosition(previous, "player", position => this.objectSystem.isSolidAt(position));
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
    if (dx === 0 && dy === 0) {
      this.notify();
      return;
    }
    const next = this.panelSystem.resolveMovement(this.playerGrid, { col: dx, row: dy }, "player", position => this.objectSystem.isSolidAt(position));
    if (!next) return;
    this.panelSystem.vacate(this.playerGrid, this.gameTimeMs);
    this.playerGrid = next;
    this.panelSystem.occupy(this.playerGrid, "player");
    this.message = this.isCharging ? "チャージを維持して移動" : "位置を更新";
    this.notify();
  }
  private fire(): void {
    const now = this.gameTimeMs;
    if (this.mode !== "battle" || this.paused || this.isCharging || now < this.nextFireAt) return;
    this.nextFireAt = now + 320;
    this.onEvent({ type: "attack", charged: false });
    const target = this.frontTarget();
    if (target) this.strikeEnemy(target, 12, undefined, false);
    else {
      this.onEvent({
        type: "projectile",
        from: { ...this.playerGrid },
        to: { col: 5, row: this.playerGrid.row },
        side: "player",
        charged: false,
      });
      this.message = "正面へ通常弾を発射";
      this.notify();
    }
  }
  private startCharge(): void {
    if (this.mode === "battle" && !this.paused) this.isCharging = true;
  }
  private releaseCharge(): void {
    if (this.mode !== "battle" || this.paused || !this.isCharging) return;
    const charge = this.charging;
    this.isCharging = false;
    this.charging = 0;
    const charged = charge > 0.68;
    this.nextFireAt = this.gameTimeMs + 240;
    this.onEvent({ type: "attack", charged });
    const target = this.frontTarget();
    if (target) this.strikeEnemy(target, charged ? 42 : 20, undefined, charged);
    else {
      this.onEvent({
        type: "projectile",
        from: { ...this.playerGrid },
        to: { col: 5, row: this.playerGrid.row },
        side: "player",
        charged,
      });
      this.message = "正面へチャージ弾を発射";
      this.notify();
    }
  }
  private cancelCharge(): void {
    this.isCharging = false;
    this.charging = 0;
  }

  private useSkill(): void {
    if (this.mode !== "battle" || this.paused || this.queue.length === 0) return;
    const card = this.queue.shift();
    if (!card) return;
    const usedSync = this.sync;
    const power = Math.round(card.power * (usedSync ? 2 : 1) * this.nextCardBoost);
    this.nextCardBoost = 1;
    const resolution = this.cardTargets(card.target);
    this.applyPlayerCardEffect(card);
    this.onEvent({ type: "attack", charged: card.tier === "mega" });
    this.onEvent({
      type: "card",
      cardId: card.id,
      at: { ...(resolution.tiles[0] ?? this.playerGrid) },
      tiles: resolution.tiles,
      family: card.family,
      tier: card.tier,
      target: card.target,
      status: card.status,
    });
    const hitstopDuration = card.tier === "mega" ? 105 : 55;
    this.hitstopRemainingMs = Math.max(this.hitstopRemainingMs, hitstopDuration);
    this.onEvent({
      type: "hitstop",
      duration: hitstopDuration,
      tier: card.tier,
    });
    for (const target of resolution.enemies) this.strikeEnemy(target, power, card, card.family === "範囲" || card.family === "高出力");
    if (usedSync) this.sync = false;
    this.message = `${card.name} を送信${usedSync ? " — フルシンクロ×2" : ""}`;
    this.notify();
  }
  private applyPlayerCardEffect(card: Card): void {
    const value = card.effectValue ?? 0;
    if (card.status === "barrier") this.barrier = Math.min(220, this.barrier + value);
    if (card.id === "dream" || card.status === "invincible") this.invincibleUntil = Math.max(this.invincibleUntil, this.gameTimeMs + INVINCIBILITY_DURATION_MS);
    if (card.status === "recover") {
      this.playerHp = Math.min(PLAYER_MAX_HP, this.playerHp + value);
      if (card.id === "sanctum" || card.id === "sanctuary") this.barrier = Math.min(220, this.barrier + 42);
    }
    if (card.status === "gauge") this.gauge = Math.min(100, this.gauge + value);
    if (card.status === "boost") this.nextCardBoost = value / 100;
    if (card.status === "counter") this.retaliateDamage = value;
    if (card.id === "magguard") this.barrier = Math.min(220, this.barrier + 24);
    if (card.id === "sector") this.panelSystem.expandEnemyFront(this.gameTimeMs, TERRITORY_EXPANSION_DURATION_MS);
    if (card.id === "sanctum" || card.id === "sanctuary") this.paintSanctuary(card.id === "sanctuary" ? 10000 : 8000);
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
        .filter(panel => panel.owner === "enemy" && panel.occupantId === null && panel.objectId === null)
        .slice(0, 3)
        .forEach(panel => this.panelSystem.setTerrain(panel, "hole", this.gameTimeMs, 8000));
    if (card.id === "toxic") this.placeFieldObject("field-device", this.closestEmptyEnemyPanel(), 70, 5000, "contact");
    if (card.id === "timer") this.placeFieldObject("bomb", this.closestEmptyEnemyPanel(), 50, 2000, "timer");
    if (card.id === "watchmine") this.placeFieldObject("mine", this.closestEmptyEnemyPanel(), 50, null, "enemy-contact");
    if (card.id === "turret") this.placeFieldObject("turret", { col: 2, row: this.playerGrid.row }, 60, 4000, "timer");
    if (card.id === "stake") this.placeFieldObject("stake", this.closestEmptyEnemyPanel(), 40, 5000, "enemy-contact");
    if (card.id === "block") this.placeFieldObject("cube", { col: this.playerGrid.col + 1, row: this.playerGrid.row }, 100, null, "damage");
  }

  private paintSanctuary(durationMs: number): void {
    const positions = [this.playerGrid, { col: this.playerGrid.col - 1, row: this.playerGrid.row }, { col: this.playerGrid.col + 1, row: this.playerGrid.row }, { col: this.playerGrid.col, row: this.playerGrid.row - 1 }, { col: this.playerGrid.col, row: this.playerGrid.row + 1 }];
    positions.forEach(position => this.panelSystem.setTerrain(position, "holy", this.gameTimeMs, durationMs));
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
        return panel?.occupantId === null && panel.objectId === null && panel.terrain !== "hole";
      }) ?? { col: 5, row: 1 }
    );
  }

  private placeFieldObject(kind: FieldObjectKind, preferred: GridPosition, hp: number, lifetimeMs: number | null, trigger: Parameters<ObjectSystem["place"]>[0]["trigger"]): void {
    const candidates = [preferred, ...this.panelSystem.snapshot().map(panel => ({ col: panel.col, row: panel.row }))];
    const panel = candidates.find(position => {
      const state = this.panelSystem.get(position);
      return state?.occupantId === null && state.objectId === null && state.terrain !== "hole";
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
    if (result.removed) this.panelSystem.detachObject(result.removed.panel, result.removed.id);
    if (result.object) this.panelSystem.attachObject(result.object.panel, result.object.id);
  }
  private closestEnemy(): Enemy | undefined {
    return [...this.enemies].filter(enemy => enemy.state !== "deleted").sort((a, b) => Math.abs(a.grid.row - this.playerGrid.row) - Math.abs(b.grid.row - this.playerGrid.row) || a.grid.col - b.grid.col)[0];
  }
  private frontTarget(): Enemy | undefined {
    return this.enemies.filter(enemy => enemy.state !== "deleted" && enemy.grid.row === this.playerGrid.row && enemy.grid.col > this.playerGrid.col).sort((a, b) => a.grid.col - b.grid.col)[0];
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
                : [3, 4, 5].flatMap(col => [0, 1, 2].map(targetRow => ({ col, row: targetRow })));
    const enemies = this.enemies.filter(enemy => enemy.state !== "deleted" && tiles.some(tile => sameTile(tile, enemy.grid)));
    return { tiles, enemies };
  }
  private strikeEnemy(enemy: Enemy, damage: number, card: Card | undefined, charged: boolean): void {
    if (enemy.state === "deleted") return;
    if (!card)
      this.onEvent({
        type: "projectile",
        from: { ...this.playerGrid },
        to: { ...enemy.grid },
        side: "player",
        charged,
      });
    enemy.hp = Math.max(0, enemy.hp - damage);
    const counter = Boolean(card && enemy.state === "windup");
    if (counter) {
      this.clearWarnings(enemy);
      enemy.lockedTargets = [];
      enemy.state = "stunned";
      enemy.stunnedUntil = this.gameTimeMs + 1300;
      this.sync = true;
      this.counters += 1;
      this.score += 150;
      this.message = "カードカウンター — フルシンクロ";
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
    if (card?.status) this.applyStatus(enemy, card.status, card.durationMs ?? 0);
    if (enemy.hp <= 0) {
      this.clearWarnings(enemy);
      enemy.state = "deleted";
      this.score += 100 + this.wave * 25;
      this.onEvent({ type: "deleted", id: enemy.id, at: { ...enemy.grid } });
      this.message = `${enemy.name} を停止`;
    }
  }
  private applyStatus(enemy: Enemy, status: CardStatus, duration: number): void {
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
    if (status === "root") enemy.rootUntil = Math.max(enemy.rootUntil, now + duration);
    if (status === "slow") {
      enemy.slowUntil = Math.max(enemy.slowUntil, now + duration);
      enemy.nextAttackAt += 350;
    }
  }

  private resetBoard(): void {
    this.panelSystem.reset();
    this.objectSystem.reset();
    this.enemies = this.makeEnemies(this.wave);
    this.syncBoardOccupancy();
  }

  private beginCustom(message: string): void {
    this.mode = "custom";
    this.clock.discardPendingTime();
    this.cancelCharge();
    this.hitstopRemainingMs = 0;
    this.round += 1;
    this.gauge = 100;
    this.customHand = drawHand(this.round);
    this.selected = [];
    this.focusedCard = null;
    this.message = message;
    this.notify();
  }
  private openCustom(): void {
    if (this.mode !== "battle" || this.paused) return;
    this.beginCustom("カスタム画面 — 次のカードを選択");
  }
  private toggleCard(index: number): void {
    if (this.mode !== "custom" || !this.customHand[index]) return;
    const card = this.customHand[index];
    if (this.selected.includes(index)) {
      this.selected = this.selected.filter(selected => selected !== index);
      this.focusedCard = null;
      this.message = `${card.name} の選択を解除`;
    } else if (this.focusedCard !== index) {
      this.focusedCard = index;
      this.message = `${card.name}: ${card.description} — もう一度タップで選択`;
    } else if (canAppendSelection(this.customHand, this.selected, index)) {
      this.selected = [...this.selected, index];
      this.focusedCard = null;
      this.message = `${card.name} を ${this.selected.length} 番目に選択`;
    } else this.message = "選択できるカードは最大5枚です";
    this.notify();
  }
  private confirmCustom(): void {
    if (this.mode !== "custom" || this.selected.length === 0) {
      this.message = "カードを1枚以上選択してください";
      this.notify();
      return;
    }
    this.queue = this.selected.map(index => this.customHand[index]);
    this.focusedCard = null;
    this.mode = "battle";
    this.clock.discardPendingTime();
    this.customRemaining = CUSTOM_INTERVAL_SECONDS;
    this.gauge = 0;
    this.message = `WAVE 0${this.wave} — 接続開始`;
    const now = this.gameTimeMs;
    this.enemies.forEach((enemy, index) => {
      if (enemy.state !== "deleted") enemy.nextAttackAt = now + 1050 + index * 510;
    });
    this.notify();
  }
  private finishWave(): void {
    if (this.mode !== "battle") return;
    this.score += 250 + Math.max(0, this.playerHp);
    this.pendingShots = [];
    this.hitstopRemainingMs = 0;
    this.cancelCharge();
    this.clock.discardPendingTime();
    this.objectSystem.reset();
    this.panelSystem.reset();
    this.syncBoardOccupancy();
    this.mode = this.wave >= FINAL_WAVE ? "result" : "intermission";
    if (this.mode === "intermission") {
      this.playerHp = Math.min(PLAYER_MAX_HP, this.playerHp + 32);
      this.message = `WAVE 0${this.wave} 完了 — 耐久+32`;
    } else this.finishRun(true);
    this.notify();
  }
  private nextWave(): void {
    if (this.mode !== "intermission") return;
    this.wave += 1;
    this.clock.discardPendingTime();
    this.playerGrid = { col: 1, row: 1 };
    this.gauge = 0;
    this.sync = false;
    this.charging = 0;
    this.isCharging = false;
    this.barrier = 0;
    this.invincibleUntil = 0;
    this.retaliateDamage = 0;
    this.nextCardBoost = 1;
    this.hitstopRemainingMs = 0;
    this.pendingShots = [];
    this.queue = [];
    this.selected = [];
    this.focusedCard = null;
    this.customRemaining = CUSTOM_INTERVAL_SECONDS;
    this.round += 1;
    this.customHand = drawHand(this.round);
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
    this.playerGrid = { col: 1, row: 1 };
    this.gauge = 0;
    this.sync = false;
    this.charging = 0;
    this.isCharging = false;
    this.barrier = 0;
    this.invincibleUntil = 0;
    this.retaliateDamage = 0;
    this.nextCardBoost = 1;
    this.wave = 1;
    this.score = 0;
    this.customHand = drawHand(0);
    this.selected = [];
    this.focusedCard = null;
    this.queue = [];
    this.message = "カードを選択してください";
    this.elapsed = 0;
    this.counters = 0;
    this.rank = "—";
    this.round = 0;
    this.pendingShots = [];
    this.customRemaining = CUSTOM_INTERVAL_SECONDS;
    this.nextFireAt = 0;
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
    this.pendingShots = [];
    this.hitstopRemainingMs = 0;
    this.cancelCharge();
    this.objectSystem.reset();
    this.panelSystem.reset();
    this.syncBoardOccupancy();
    this.mode = "result";
    if (victory) {
      this.score += this.counters * 80 + Math.ceil(this.playerHp / 10);
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
    const factory = (id: string, name: string, pattern: Pattern, hp: number, grid: GridPosition, damage: number, windupMs: number, cooldownMs: number): Enemy => ({
      id,
      name,
      pattern,
      hp: Math.round(hp * scale),
      maxHp: Math.round(hp * scale),
      grid,
      state: "idle",
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
    });
    const layouts: (() => Enemy[])[] = [
      () => [factory("bulwark", "BULWARK-3", "lane-sweep", 132, { col: 4, row: 1 }, 24, 1080, 1550), factory("scanner", "SCANNER-8", "column-scan", 90, { col: 5, row: 0 }, 18, 820, 1150)],
      () => [factory("razor", "RAZOR-6", "pursuit-dash", 84, { col: 4, row: 0 }, 22, 600, 850), factory("mortar", "MORTAR-NODE", "mortar-spread", 152, { col: 5, row: 1 }, 25, 1320, 1800), factory("scanner", "SCANNER-8", "column-scan", 96, { col: 3, row: 2 }, 19, 840, 1120)],
      () => [factory("bulwark", "BULWARK-3", "lane-sweep", 150, { col: 4, row: 1 }, 26, 1060, 1480), factory("razor", "RAZOR-6", "pursuit-dash", 98, { col: 3, row: 0 }, 24, 570, 760), factory("sentinel", "VOLT-SENTINEL", "pulse-grid", 118, { col: 5, row: 2 }, 21, 980, 1040)],
      () => [factory("mortar", "MORTAR-NODE", "mortar-spread", 170, { col: 5, row: 0 }, 29, 1280, 1680), factory("sentinel", "VOLT-SENTINEL", "pulse-grid", 142, { col: 4, row: 2 }, 23, 920, 920), factory("bulwark", "BULWARK-3", "lane-sweep", 166, { col: 3, row: 1 }, 30, 980, 1320), factory("razor", "RAZOR-6", "pursuit-dash", 110, { col: 5, row: 2 }, 26, 540, 700)],
    ];
    return layouts[Math.min(wave - 1, layouts.length - 1)]();
  }
  private notify(): void {
    const now = this.gameTimeMs;
    this.onSnapshot({
      mode: this.mode,
      playerHp: this.playerHp,
      playerMaxHp: PLAYER_MAX_HP,
      playerGrid: { ...this.playerGrid },
      gauge: this.gauge,
      sync: this.sync,
      charging: this.charging,
      barrier: this.barrier,
      invincible: now < this.invincibleUntil,
      invincibleRemaining: Math.max(0, (this.invincibleUntil - now) / 1000),
      customHand: this.customHand,
      selected: this.selected,
      focusedCard: this.focusedCard,
      queue: this.queue,
      enemies: this.enemies.map(({ windupUntil: _w, recoverUntil: _r, stunnedUntil: _s, nextAttackAt: _n, attackDamage: _d, windupMs: _wm, cooldownMs: _c, lockedTargets: _l, cycle: _cy, burnUntil: _b, nextBurnAt: _nb, slowUntil: _sl, rootUntil: _rt, ...enemy }) => ({ ...enemy, grid: { ...enemy.grid } })),
      panels: this.panelSystem.snapshot(),
      objects: this.objectSystem.snapshot(),
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
