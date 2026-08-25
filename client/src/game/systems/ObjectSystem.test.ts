import { describe, expect, it } from "vitest";
import { MAX_OBJECTS_PER_SIDE, ObjectSystem } from "./ObjectSystem";

function placement(index: number, owner: "player" | "enemy" = "player") {
  return {
    id: `${owner}-object-${index}`,
    owner,
    kind: "cube" as const,
    panel: {
      col: owner === "player" ? index % 3 : 3 + (index % 3),
      row: Math.floor(index / 3),
    },
    hp: 20,
    expiresAt: null,
    collision: "solid" as const,
    trigger: "damage" as const,
  };
}

describe("ObjectSystem", () => {
  it("keeps six objects per side and removes the oldest one first", () => {
    const system = new ObjectSystem();
    for (let index = 0; index < MAX_OBJECTS_PER_SIDE; index += 1)
      expect(system.place(placement(index)).object).not.toBeNull();
    const result = system.place(placement(MAX_OBJECTS_PER_SIDE));

    expect(result.removed?.id).toBe("player-object-0");
    expect(system.snapshot()).toHaveLength(MAX_OBJECTS_PER_SIDE);
    expect(system.get("player-object-0")).toBeUndefined();
  });

  it("rejects overlapping objects, blocks solid objects, and allows passable objects", () => {
    const system = new ObjectSystem();
    expect(system.place(placement(0)).object).not.toBeNull();
    expect(
      system.place({ ...placement(1), panel: { col: 0, row: 0 } }).object
    ).toBeNull();
    expect(system.isSolidAt({ col: 0, row: 0 })).toBe(true);

    system.remove("player-object-0");
    expect(
      system.place({
        ...placement(2),
        panel: { col: 0, row: 0 },
        collision: "passable",
      }).object
    ).not.toBeNull();
    expect(system.isSolidAt({ col: 0, row: 0 })).toBe(false);
  });

  it("supports damage destruction and expiry cleanup", () => {
    const system = new ObjectSystem();
    system.place({ ...placement(0), expiresAt: 100 });
    expect(system.damage("player-object-0", 8).destroyed).toBe(false);
    expect(system.damage("player-object-0", 12).destroyed).toBe(true);
    expect(system.get("player-object-0")).toBeUndefined();

    system.place({ ...placement(1), expiresAt: 100 });
    expect(system.update(99)).toHaveLength(0);
    expect(system.update(100).map(object => object.id)).toEqual([
      "player-object-1",
    ]);
    expect(system.snapshot()).toHaveLength(0);
  });
});
