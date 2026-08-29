import { describe, expect, it } from "vitest";
import {
  URGENT_WARNING_PROGRESS,
  warningProgress,
  warningRemainingMs,
  warningStage,
} from "./WarningSystem";

describe("WarningSystem", () => {
  it("clamps progress to the attack interval", () => {
    expect(warningProgress(900, 1000, 2000)).toBe(0);
    expect(warningProgress(1500, 1000, 2000)).toBeCloseTo(0.5);
    expect(warningProgress(2200, 1000, 2000)).toBe(1);
  });

  it("changes from telegraph to urgent at the defined boundary", () => {
    expect(warningStage(URGENT_WARNING_PROGRESS - 0.001)).toBe("telegraph");
    expect(warningStage(URGENT_WARNING_PROGRESS)).toBe("urgent");
  });

  it("never exposes a negative remaining time", () => {
    expect(warningRemainingMs(1200, 2000)).toBe(800);
    expect(warningRemainingMs(2200, 2000)).toBe(0);
  });
});
