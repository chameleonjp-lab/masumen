import { describe, expect, it } from "vitest";
import { createMeleePlan, isCounterWindow, meleeTiles } from "./AttackSystem";

describe("AttackSystem", () => {
  it("keeps a straight melee attack on its own row", () => {
    expect(meleeTiles({ col: 1, row: 1 }, { col: 1, row: 0 }, 3)).toEqual([
      { col: 2, row: 1 },
      { col: 3, row: 1 },
      { col: 4, row: 1 },
    ]);
  });

  it("creates a dash landing and a guaranteed return position", () => {
    const plan = createMeleePlan(
      { col: 1, row: 1 },
      { col: 4, row: 1 },
      100,
      1,
      {
        dash: true,
        canEnter: position => position.col === 2 || position.col === 3,
      }
    );

    expect(plan.dashTo).toEqual({ col: 3, row: 1 });
    expect(plan.tiles).toEqual([{ col: 4, row: 1 }]);
    expect(plan.returnTo).toEqual({ col: 1, row: 1 });
  });

  it("uses only the declared counter interval", () => {
    const timing = {
      startupMs: 700,
      counterStartMs: 520,
      counterEndMs: 680,
      activeMs: 40,
      recoveryMs: 300,
    };

    expect(isCounterWindow(519, timing)).toBe(false);
    expect(isCounterWindow(520, timing)).toBe(true);
    expect(isCounterWindow(680, timing)).toBe(true);
    expect(isCounterWindow(681, timing)).toBe(false);
  });
});
