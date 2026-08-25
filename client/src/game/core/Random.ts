/** A small deterministic random source for reproducible battle tests. */
export class Random {
  private state: number;

  public constructor(seed: number) {
    const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 1;
    this.state = normalized >>> 0 || 0x6d2b79f5;
  }

  public next(): number {
    // Mulberry32 gives a stable, fast sequence and does not use Math.random.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  public int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  public range(minInclusive: number, maxInclusive: number): number {
    if (maxInclusive <= minInclusive) return minInclusive;
    return minInclusive + this.int(maxInclusive - minInclusive + 1);
  }

  public pick<T>(values: readonly T[]): T | undefined {
    return values.length === 0 ? undefined : values[this.int(values.length)];
  }

  public shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  public getState(): number {
    return this.state >>> 0;
  }
}
