/** Fixed-step custom gauge. It never reads wall-clock time and only advances when the battle calls it. */
export class CustomSystem {
  private readonly intervalMs: number;
  private readonly maxValue: number;
  private readonly initialBaseMultiplier: number;
  private gaugeValue = 0;
  private baseMultiplier = 1;
  private temporaryMultiplier = 1;
  private temporaryUntilMs = 0;

  public constructor(intervalMs = 10000, maxValue = 100, baseMultiplier = 1) {
    this.intervalMs = intervalMs;
    this.maxValue = maxValue;
    this.initialBaseMultiplier = Math.max(0, baseMultiplier);
    this.baseMultiplier = this.initialBaseMultiplier;
  }

  public get value(): number {
    return this.gaugeValue;
  }

  public get multiplier(): number {
    return this.baseMultiplier * this.temporaryMultiplier;
  }

  public reset(): void {
    this.gaugeValue = 0;
    this.baseMultiplier = this.initialBaseMultiplier;
    this.temporaryMultiplier = 1;
    this.temporaryUntilMs = 0;
  }

  public resetGauge(): void {
    this.gaugeValue = 0;
  }

  public advance(deltaSeconds: number, nowMs: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.temporaryUntilMs > 0 && nowMs >= this.temporaryUntilMs) {
      this.temporaryMultiplier = 1;
      this.temporaryUntilMs = 0;
    }
    const percentPerSecond = (this.maxValue * 1000) / this.intervalMs;
    this.gaugeValue = Math.min(
      this.maxValue,
      this.gaugeValue + deltaSeconds * percentPerSecond * this.multiplier
    );
  }

  public add(value: number): void {
    if (!Number.isFinite(value)) return;
    this.gaugeValue = Math.min(
      this.maxValue,
      Math.max(0, this.gaugeValue + value)
    );
  }

  public fill(): void {
    this.gaugeValue = this.maxValue;
  }

  public setBaseMultiplier(multiplier: number): void {
    this.baseMultiplier = Math.max(0, multiplier);
  }

  public setTemporaryMultiplier(
    multiplier: number,
    durationMs: number,
    nowMs: number
  ): void {
    this.temporaryMultiplier = Math.max(0, multiplier);
    this.temporaryUntilMs = Math.max(0, nowMs + durationMs);
  }

  public isFull(): boolean {
    return this.gaugeValue >= this.maxValue;
  }

  public remainingSeconds(): number {
    if (this.isFull()) return 0;
    const rate = (this.maxValue / (this.intervalMs / 1000)) * this.multiplier;
    return rate > 0 ? (this.maxValue - this.gaugeValue) / rate : Infinity;
  }
}
