import { describe, expect, it } from "vitest";
import type { ProjectileState } from "../types";
import { projectileRenderPosition, projectileRenderScale, projectileRenderSpan } from "./projectileVisuals";

const projectile = (overrides: Partial<ProjectileState> = {}): ProjectileState => ({
  id: "projectile-test",
  owner: "enemy",
  motion: "straight",
  position: { col: 3, row: 1 },
  direction: { col: -1, row: 0 },
  origin: { col: 3, row: 1 },
  target: null,
  damage: 10,
  sourceId: "scanner",
  sourceActionId: "scanner-signal-lock",
  sourceCardId: null,
  charged: false,
  activeAt: 1000,
  expiresAt: 2000,
  speedCellsPerSecond: 8,
  travelProgress: 0.5,
  flightMs: 0,
  bouncesRemaining: 0,
  rowSpan: false,
  splashRadius: 0,
  splashShape: "square",
  affectsObjects: true,
  stopOnObject: true,
  hitTargets: [],
  hitObjects: [],
  ...overrides,
});

describe("実弾からの表示位置", () => {
  it("直進弾は実際のセル位置と進行率から表示する", () => {
    expect(projectileRenderPosition(projectile(), 1200)).toEqual({ col: 2.5, row: 1, height: 0.74 });
  });
  it("発射待ちの弾は移動せず、投擲弾は実際の飛行時間で着地点へ向かう", () => {
    const thrown = projectile({
      motion: "thrown", origin: { col: 1, row: 1 }, position: { col: 1, row: 1 },
      direction: { col: 1, row: 0 }, target: { col: 5, row: 2 }, activeAt: 500,
      flightMs: 1000, travelProgress: 0,
    });
    expect(projectileRenderPosition(thrown, 400)).toEqual({ col: 1, row: 1, height: 0.74 });
    const middle = projectileRenderPosition(thrown, 1000);
    expect(middle.col).toBe(3); expect(middle.row).toBe(1.5); expect(middle.height).toBeCloseTo(1.18);
    expect(projectileRenderPosition(thrown, 1600).col).toBe(5);
  });
  it("行攻撃と範囲攻撃の大きさも実弾の属性から決める", () => {
    const row = projectile({ rowSpan: true, charged: true, splashRadius: 1 });
    expect(projectileRenderScale(row)).toEqual({ width: 1, height: 1.28 });
    expect(projectileRenderSpan(row)).toBe(25);
    expect(projectileRenderSpan(projectile({ motion: "wave" }))).toBe(2.4);
  });
});
