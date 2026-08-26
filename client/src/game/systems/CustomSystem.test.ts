import { describe, expect, it } from "vitest";
import { CustomSystem } from "./CustomSystem";

describe("CustomSystem", () => {
  it("advances from game time and reaches full after the configured interval", () => {
    const custom = new CustomSystem(10000, 100);
    custom.advance(5, 5000);
    expect(custom.value).toBeCloseTo(50, 5);
    expect(custom.remainingSeconds()).toBeCloseTo(5, 5);
    custom.advance(5, 10000);
    expect(custom.value).toBeCloseTo(100, 5);
    expect(custom.isFull()).toBe(true);
    expect(custom.remainingSeconds()).toBe(0);
  });

  it("keeps an added value instead of rebuilding the gauge from elapsed time", () => {
    const custom = new CustomSystem(10000, 100);
    custom.advance(1, 1000);
    custom.add(35);
    custom.advance(1, 2000);
    expect(custom.value).toBeCloseTo(55, 5);
  });

  it("supports persistent and temporary speed modifiers", () => {
    const custom = new CustomSystem(10000, 100);
    custom.setBaseMultiplier(0.8);
    custom.setTemporaryMultiplier(2, 8000, 0);
    custom.advance(1, 1000);
    expect(custom.value).toBeCloseTo(16, 5);
    custom.advance(1, 9000);
    expect(custom.value).toBeCloseTo(24, 5);
  });
});
