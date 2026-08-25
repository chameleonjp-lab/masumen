import { COMBAT_BALANCE } from "../data/balance";
import type { EmotionState } from "../types";

export interface EmotionSnapshot {
  state: EmotionState;
  remainingMs: number;
  corruption: number;
  maxHpReduction: number;
  rageReady: boolean;
}

/** Run-scoped emotion rules. Corruption is intentionally reset with a new run, not persisted. */
export class EmotionSystem {
  private current: EmotionState = "normal";
  private corruptionValue = 0;
  private maxHpReductionValue = 0;
  private recentDamageAt: number[] = [];
  private lastDamageAt = -Infinity;
  private shakenUntil = 0;
  private rageUntil = 0;
  private rageReadyValue = false;
  private enragedUsed = false;
  private lowHpTriggered = false;

  public resetRun(): void {
    this.current = "normal";
    this.corruptionValue = 0;
    this.maxHpReductionValue = 0;
    this.resetWaveTracking();
  }

  public resetWave(): void {
    this.resetWaveTracking();
    this.current = this.corruptionValue > 0 ? "corrupted" : "normal";
  }

  private resetWaveTracking(): void {
    this.recentDamageAt = [];
    this.lastDamageAt = -Infinity;
    this.shakenUntil = 0;
    this.rageUntil = 0;
    this.rageReadyValue = false;
    this.enragedUsed = false;
    this.lowHpTriggered = false;
  }

  public update(
    nowMs: number,
    playerHp: number,
    playerMaxHp: number,
    synchronized: boolean
  ): void {
    this.recentDamageAt = this.recentDamageAt.filter(
      time => nowMs - time <= COMBAT_BALANCE.emotion.damageWindowMs
    );
    if (synchronized) {
      this.current = "synchronized";
      return;
    }
    if (playerHp > playerMaxHp * COMBAT_BALANCE.emotion.lowHpRatio)
      this.lowHpTriggered = false;
    if (this.current === "synchronized") this.current = this.baseState();
    if (
      this.current === "shaken" &&
      nowMs >= this.shakenUntil &&
      nowMs - this.lastDamageAt >= COMBAT_BALANCE.emotion.shakenDurationMs
    )
      this.current = this.baseState();
    if (
      !this.rageReadyValue &&
      !this.lowHpTriggered &&
      playerHp <= playerMaxHp * COMBAT_BALANCE.emotion.lowHpRatio
    ) {
      this.lowHpTriggered = true;
      this.enterShaken(nowMs);
    }
  }

  public recordDamage(
    nowMs: number,
    damage: number,
    playerHp: number,
    playerMaxHp: number
  ): void {
    this.recentDamageAt.push(nowMs);
    this.recentDamageAt = this.recentDamageAt.filter(
      time => nowMs - time <= COMBAT_BALANCE.emotion.damageWindowMs
    );
    this.lastDamageAt = nowMs;
    if (playerHp <= playerMaxHp * COMBAT_BALANCE.emotion.lowHpRatio)
      this.lowHpTriggered = true;
    if (
      !this.enragedUsed &&
      damage >= playerMaxHp * COMBAT_BALANCE.emotion.rageDamageRatio
    ) {
      this.enragedUsed = true;
      this.rageReadyValue = true;
      this.rageUntil = nowMs + COMBAT_BALANCE.emotion.rageStaggerMs;
      this.current = "enraged";
      return;
    }
    if (
      !this.rageReadyValue &&
      (this.recentDamageAt.length >=
        COMBAT_BALANCE.emotion.damageCountForShaken ||
        playerHp <= playerMaxHp * COMBAT_BALANCE.emotion.lowHpRatio)
    )
      this.enterShaken(nowMs);
  }

  private enterShaken(nowMs: number): void {
    this.current = "shaken";
    this.shakenUntil = nowMs + COMBAT_BALANCE.emotion.shakenDurationMs;
  }

  public recover(): void {
    if (this.current === "shaken") {
      this.current = this.baseState();
      this.shakenUntil = 0;
    }
  }

  public counterSuccess(): boolean {
    if (this.rageReadyValue) return false;
    this.current = "synchronized";
    return true;
  }

  public consumePower(syncActive: boolean): "synchronized" | "enraged" | null {
    if (syncActive) {
      this.current = this.baseState();
      return "synchronized";
    }
    if (this.rageReadyValue) {
      this.rageReadyValue = false;
      this.rageUntil = 0;
      this.current = this.baseState();
      return "enraged";
    }
    return null;
  }

  public registerOverload(): {
    corruption: number;
    appliedMaxHpReduction: number;
  } {
    const canReduceMaxHp =
      this.corruptionValue < COMBAT_BALANCE.overload.maxCorruption;
    this.corruptionValue = Math.min(
      COMBAT_BALANCE.overload.maxCorruption,
      this.corruptionValue + 1
    );
    if (canReduceMaxHp)
      this.maxHpReductionValue += COMBAT_BALANCE.overload.maxHpReduction;
    this.current = "corrupted";
    this.shakenUntil = 0;
    return {
      corruption: this.corruptionValue,
      appliedMaxHpReduction: canReduceMaxHp
        ? COMBAT_BALANCE.overload.maxHpReduction
        : 0,
    };
  }

  public overloadChance(): number {
    if (this.corruptionValue > 0) return 1;
    return this.current === "shaken" ? COMBAT_BALANCE.overload.shakenChance : 0;
  }

  public healMultiplier(): number {
    return Math.max(
      0,
      1 -
        this.corruptionValue *
          COMBAT_BALANCE.overload.healReductionPerCorruption
    );
  }

  public isRageStaggerImmune(nowMs: number): boolean {
    return this.rageReadyValue && nowMs < this.rageUntil;
  }

  private baseState(): EmotionState {
    return this.corruptionValue > 0 ? "corrupted" : "normal";
  }

  public snapshot(nowMs: number): EmotionSnapshot {
    return {
      state: this.current,
      remainingMs:
        this.current === "shaken"
          ? Math.max(0, this.shakenUntil - nowMs)
          : this.current === "enraged"
            ? Math.max(0, this.rageUntil - nowMs)
            : 0,
      corruption: this.corruptionValue,
      maxHpReduction: this.maxHpReductionValue,
      rageReady: this.rageReadyValue,
    };
  }
}
