import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  DEFAULT_HOLE_DURATION_MS,
  ENEMY_FRONT_COLUMN,
  PanelSystem,
} from "./PanelSystem";
import type { PanelTerrain } from "../types";

describe("PanelSystem", () => {
  it("creates the complete 6 by 3 board with split ownership", () => {
    const system = new PanelSystem();
    const panels = system.snapshot();

    expect(panels).toHaveLength(BOARD_COLUMNS * BOARD_ROWS);
    expect(new Set(panels.map(panel => `${panel.col}:${panel.row}`)).size).toBe(
      18
    );
    expect(panels.filter(panel => panel.owner === "player")).toHaveLength(9);
    expect(panels.filter(panel => panel.owner === "enemy")).toHaveLength(9);
    expect(
      panels.every(
        panel =>
          panel.terrain === "normal" &&
          panel.occupantId === null &&
          panel.objectId === null
      )
    ).toBe(true);
  });

  it("supports every terrain and expires temporary terrain", () => {
    const system = new PanelSystem();
    const terrains: PanelTerrain[] = [
      "normal",
      "cracked",
      "hole",
      "grass",
      "ice",
      "lava",
      "poison",
      "holy",
    ];
    terrains.forEach((terrain, index) => {
      const position = {
        col: index % BOARD_COLUMNS,
        row: Math.floor(index / BOARD_COLUMNS),
      };
      system.setTerrain(position, terrain, 0, terrain === "ice" ? 100 : null);
    });

    expect(new Set(system.snapshot().map(panel => panel.terrain))).toEqual(
      new Set(terrains)
    );
    expect(system.get({ col: 4, row: 0 })?.terrain).toBe("ice");
    system.update(100);
    expect(system.get({ col: 4, row: 0 })?.terrain).toBe("normal");
  });

  it("turns a vacated cracked panel into a hole, then restores it", () => {
    const system = new PanelSystem();
    const position = { col: 1, row: 1 };
    expect(system.occupy(position, "player")).toBe(true);
    expect(system.crack(position)).toBe(true);
    system.vacate(position, 120);

    expect(system.get(position)?.terrain).toBe("hole");
    expect(system.get(position)?.expiresAt).toBe(
      120 + DEFAULT_HOLE_DURATION_MS
    );
    expect(system.canEnter(position, "player")).toBe(false);
    system.update(120 + DEFAULT_HOLE_DURATION_MS - 1);
    expect(system.get(position)?.terrain).toBe("hole");
    system.update(120 + DEFAULT_HOLE_DURATION_MS);
    expect(system.get(position)?.terrain).toBe("normal");
  });

  it("slides across ice and stops at territory or obstacle boundaries", () => {
    const system = new PanelSystem();
    system.setTerrain({ col: 1, row: 1 }, "ice");
    system.setTerrain({ col: 2, row: 1 }, "ice");

    expect(
      system.resolveMovement({ col: 0, row: 1 }, { col: 1, row: 0 }, "player")
    ).toEqual({ col: 2, row: 1 });
    expect(
      system.resolveMovement(
        { col: 0, row: 1 },
        { col: 1, row: 0 },
        "player",
        position => position.col === 2
      )
    ).toEqual({ col: 1, row: 1 });
    expect(
      system.resolveMovement({ col: 2, row: 1 }, { col: 1, row: 0 }, "player")
    ).toBeNull();
  });

  it("temporarily expands the enemy front column and restores the default owner", () => {
    const system = new PanelSystem();
    system.expandEnemyFront(500, 1000);
    expect(
      system
        .snapshot()
        .filter(panel => panel.col === ENEMY_FRONT_COLUMN)
        .every(panel => panel.owner === "player")
    ).toBe(true);

    const update = system.update(1500);
    expect(update.restoredTerritoryColumns).toEqual([ENEMY_FRONT_COLUMN]);
    expect(
      system
        .snapshot()
        .filter(panel => panel.col === ENEMY_FRONT_COLUMN)
        .every(panel => panel.owner === "enemy")
    ).toBe(true);
    expect(
      system.findNearestSafePosition(
        { col: ENEMY_FRONT_COLUMN, row: 1 },
        "player"
      )
    ).toEqual({ col: 2, row: 1 });
  });
});
