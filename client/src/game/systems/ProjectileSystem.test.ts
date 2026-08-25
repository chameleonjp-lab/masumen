import { describe, expect, it } from "vitest";
import { ProjectileSystem } from "./ProjectileSystem";
import type { GridPosition } from "../types";

function collisionFor(targets: Record<string, string>): (
  positions: GridPosition[]
) => {
  targetIds: string[];
  objectId: string | null;
  stop: boolean;
} {
  return positions => {
    const targetIds = positions.flatMap(position =>
      targets[`${position.col}:${position.row}`]
        ? [targets[`${position.col}:${position.row}`]]
        : []
    );
    return { targetIds: [...new Set(targetIds)], objectId: null, stop: false };
  };
}

describe("ProjectileSystem", () => {
  it("moves across the board and expires even when no target exists", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "straight",
      position: { col: 1, row: 1 },
      direction: { col: 1, row: 0 },
      damage: 12,
      speedCellsPerSecond: 12,
    });

    const resolutions = system.advance(1000, 1000, {
      collision: () => ({ targetIds: [], objectId: null, stop: false }),
    });

    expect(system.snapshot()).toHaveLength(0);
    expect(resolutions.some(resolution => resolution.kind === "expired")).toBe(
      true
    );
  });

  it("lets a piercing projectile hit more than one enemy", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "piercing",
      position: { col: 1, row: 1 },
      direction: { col: 1, row: 0 },
      damage: 60,
      speedCellsPerSecond: 12,
      stopOnObject: false,
    });
    const collision = collisionFor({ "3:1": "enemy-a", "4:1": "enemy-b" });

    const resolutions = system.advance(1000, 1000, {
      collision: (projectile, positions) => collision(positions),
    });

    expect(resolutions.flatMap(resolution => resolution.targetIds)).toEqual([
      "enemy-a",
      "enemy-b",
    ]);
  });

  it("stops a normal projectile at the first enemy", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "straight",
      position: { col: 1, row: 1 },
      direction: { col: 1, row: 0 },
      damage: 45,
      speedCellsPerSecond: 12,
    });
    const collision = collisionFor({ "3:1": "enemy-a", "4:1": "enemy-b" });

    const resolutions = system.advance(500, 500, {
      collision: (projectile, positions) => collision(positions),
    });

    expect(resolutions.flatMap(resolution => resolution.targetIds)).toEqual([
      "enemy-a",
    ]);
    expect(system.snapshot()).toHaveLength(0);
  });

  it("stops at a solid obstacle and reports the obstacle hit", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "straight",
      position: { col: 1, row: 1 },
      direction: { col: 1, row: 0 },
      damage: 12,
      speedCellsPerSecond: 12,
    });

    const resolutions = system.advance(500, 500, {
      collision: (_projectile, positions) =>
        positions.some(position => position.col === 3 && position.row === 1)
          ? { targetIds: [], objectId: "cube-1", stop: true }
          : { targetIds: [], objectId: null, stop: false },
    });

    expect(resolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ objectId: "cube-1", kind: "blocked" }),
      ])
    );
    expect(system.snapshot()).toHaveLength(0);
  });

  it("updates a homing direction before each movement step", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "homing",
      position: { col: 1, row: 1 },
      direction: { col: 1, row: 0 },
      damage: 45,
      speedCellsPerSecond: 10,
    });

    system.advance(100, 100, {
      collision: () => ({ targetIds: [], objectId: null, stop: false }),
      findHomingTarget: () => ({ col: 3, row: 0 }),
    });

    expect(system.snapshot()[0]?.position).toEqual({ col: 2, row: 0 });
    expect(system.snapshot()[0]?.direction).toEqual({ col: 1, row: -1 });
  });

  it("reflects at the board edge and turns an orbiting projectile", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "reflect",
      position: { col: 4, row: 1 },
      direction: { col: 1, row: 0 },
      damage: 10,
      speedCellsPerSecond: 5,
      bouncesRemaining: 1,
    });
    system.advance(200, 200, {
      collision: () => ({ targetIds: [], objectId: null, stop: false }),
    });
    system.advance(400, 200, {
      collision: () => ({ targetIds: [], objectId: null, stop: false }),
    });
    const reflected = system.snapshot()[0];

    expect(reflected?.position).toEqual({ col: 4, row: 1 });
    expect(reflected?.direction).toEqual({ col: -1, row: 0 });
  });

  it("lands a thrown attack on its target and covers a full column when requested", () => {
    const system = new ProjectileSystem();
    system.spawn({
      owner: "player",
      motion: "thrown",
      position: { col: 1, row: 1 },
      target: { col: 4, row: 1 },
      damage: 40,
      flightMs: 200,
      rowSpan: true,
    });
    const hitRows: number[] = [];

    const resolutions = system.advance(200, 200, {
      collision: (_projectile, positions) => {
        hitRows.push(
          ...positions
            .filter(position => position.col === 4)
            .map(position => position.row)
        );
        return { targetIds: [], objectId: null, stop: false };
      },
    });

    expect(resolutions).toHaveLength(1);
    expect(hitRows).toEqual([0, 1, 2]);
    expect(system.snapshot()).toHaveLength(0);
  });
});
