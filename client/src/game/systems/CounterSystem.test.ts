import { describe, expect, it } from "vitest";
import { createCounterWindow, isCounterWindowOpen } from "./CounterSystem";

describe("CounterSystem", () => {
  it("opens only during the short attack-specific interval", () => {
    const window = createCounterWindow(1000, 2000, 150, 20);
    expect(window).toEqual({ startAt: 1850, endAt: 1980 });
    expect(isCounterWindowOpen(1849, window)).toBe(false);
    expect(isCounterWindowOpen(1850, window)).toBe(true);
    expect(isCounterWindowOpen(1980, window)).toBe(true);
    expect(isCounterWindowOpen(1981, window)).toBe(false);
  });

  it("handles attacks shorter than the requested window without moving before startup", () => {
    const window = createCounterWindow(1000, 1080, 150, 20);
    expect(window.startAt).toBe(1000);
    expect(window.endAt).toBe(1060);
  });
});
