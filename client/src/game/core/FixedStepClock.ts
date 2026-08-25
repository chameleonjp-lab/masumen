/**
 * Keeps battle simulation time independent from the browser render rate.
 *
 * The renderer may run at 30, 60, or 120 frames per second, but the battle
 * rules are always advanced in fixed 60 Hz steps. A long gap (for example a
 * hidden Safari tab becoming visible again) is discarded instead of being
 * replayed as a burst of simulation steps.
 */
export interface FixedStepClockOptions {
  stepSeconds?: number;
  maxFrameDeltaSeconds?: number;
  maxStepsPerAdvance?: number;
}

export interface FixedStepAdvanceResult {
  steps: number;
  simulatedSeconds: number;
  discardedSeconds: number;
  accumulatorSeconds: number;
}

const EPSILON = 1e-9;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export class FixedStepClock {
  public readonly stepSeconds: number;
  public readonly maxFrameDeltaSeconds: number;
  public readonly maxStepsPerAdvance: number;

  private accumulatorSeconds = 0;
  private simulatedSeconds = 0;
  private paused = false;

  public constructor(options: FixedStepClockOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / 60;
    this.maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? 0.25;
    this.maxStepsPerAdvance = options.maxStepsPerAdvance ?? 16;

    if (
      !(this.stepSeconds > 0) ||
      !(this.maxFrameDeltaSeconds > 0) ||
      !(this.maxStepsPerAdvance > 0)
    ) {
      throw new Error("固定更新時計の設定値は正数である必要があります。");
    }
  }

  public advance(
    realDeltaSeconds: number,
    update: (stepSeconds: number) => void
  ): FixedStepAdvanceResult {
    const delta = finiteNonNegative(realDeltaSeconds);
    if (delta === 0) return this.result(0, 0);

    if (this.paused) {
      return this.result(0, delta);
    }

    // A long frame is treated as an interruption. Do not allow a background
    // tab to make enemies, projectiles, or gauges jump when it resumes.
    if (delta > this.maxFrameDeltaSeconds) {
      const discarded = delta + this.accumulatorSeconds;
      this.accumulatorSeconds = 0;
      return this.result(0, discarded);
    }

    this.accumulatorSeconds += delta;
    let steps = 0;
    while (
      this.accumulatorSeconds + EPSILON >= this.stepSeconds &&
      steps < this.maxStepsPerAdvance
    ) {
      update(this.stepSeconds);
      this.accumulatorSeconds -= this.stepSeconds;
      this.simulatedSeconds += this.stepSeconds;
      steps += 1;
    }

    let discarded = 0;
    if (
      steps === this.maxStepsPerAdvance &&
      this.accumulatorSeconds + EPSILON >= this.stepSeconds
    ) {
      discarded = this.accumulatorSeconds;
      this.accumulatorSeconds = 0;
    }

    return this.result(steps, discarded);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.discardPendingTime();
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public discardPendingTime(): void {
    this.accumulatorSeconds = 0;
  }

  public reset(): void {
    this.accumulatorSeconds = 0;
    this.simulatedSeconds = 0;
    this.paused = false;
  }

  public getSimulationSeconds(): number {
    return this.simulatedSeconds;
  }

  public getAccumulatorSeconds(): number {
    return this.accumulatorSeconds;
  }

  private result(
    steps: number,
    discardedSeconds: number
  ): FixedStepAdvanceResult {
    return {
      steps,
      simulatedSeconds: steps * this.stepSeconds,
      discardedSeconds,
      accumulatorSeconds: this.accumulatorSeconds,
    };
  }
}
