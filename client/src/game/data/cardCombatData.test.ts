import { describe, expect, it } from "vitest";
import { CARD_CATALOG } from "../deck";
import {
  CARD_COMBAT_PROFILES,
  PR7_CARD_IDS,
  PR8_CARD_IDS,
  cardPreviewTiles,
  getElementalMultiplier,
} from "./cardCombatData";

describe("card combat data", () => {
  it("defines all 21 PR7 cards with power and range metadata", () => {
    expect(PR7_CARD_IDS).toHaveLength(21);
    PR7_CARD_IDS.forEach(id => {
      const profile = CARD_COMBAT_PROFILES[id];
      const card = CARD_CATALOG.find(candidate => candidate.id === id);
      expect(profile).toBeDefined();
      expect(card?.actionId).toBe(id);
      expect(profile?.powerPerHit).toBeGreaterThan(0);
      expect(profile?.rangePreviewId).toBeTruthy();
    });
  });

  it("defines all 25 PR8 cards with executable metadata", () => {
    expect(PR8_CARD_IDS).toHaveLength(25);
    PR8_CARD_IDS.forEach(id => {
      const profile = CARD_COMBAT_PROFILES[id];
      const card = CARD_CATALOG.find(candidate => candidate.id === id);
      expect(profile).toBeDefined();
      expect(card?.actionId).toBe(id);
      expect(card?.description).toBeTruthy();
      expect(profile?.rangePreviewId).toBeTruthy();
      expect(profile?.powerPerHit).toBeGreaterThanOrEqual(0);
    });
  });

  it("keeps installation, terrain, and self-card previews distinct", () => {
    const origin = { col: 1, row: 1 };
    const enemy = { col: 4, row: 1 };
    const watchmine = CARD_CATALOG.find(card => card.id === "watchmine");
    const timer = CARD_CATALOG.find(card => card.id === "timer");
    const sanctum = CARD_CATALOG.find(card => card.id === "sanctum");
    const gustwall = CARD_CATALOG.find(card => card.id === "gustwall");

    expect(cardPreviewTiles(watchmine, origin)).toHaveLength(9);
    expect(cardPreviewTiles(watchmine, origin).every(tile => tile.col >= 3)).toBe(true);
    expect(cardPreviewTiles(timer, origin, [enemy])).toEqual([enemy]);
    expect(cardPreviewTiles(sanctum, origin)).toEqual(expect.arrayContaining([
      { col: 1, row: 1 },
      { col: 0, row: 1 },
      { col: 2, row: 1 },
    ]));
    expect(cardPreviewTiles(gustwall, origin)).toHaveLength(18);
  });

  it("uses current enemies for a target column and a current position for melee range", () => {
    const origin = { col: 1, row: 1 };
    const column = CARD_CATALOG.find(card => card.id === "column");
    const sweep = CARD_CATALOG.find(card => card.id === "sweep");
    expect(cardPreviewTiles(column, origin, [{ col: 3, row: 2 }, { col: 5, row: 0 }])).toEqual([
      { col: 3, row: 0 },
      { col: 3, row: 1 },
      { col: 3, row: 2 },
    ]);
    expect(cardPreviewTiles(sweep, origin)).toEqual([
      { col: 2, row: 0 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
    ]);
  });

  it("keeps cross splash away from diagonal cells and applies element rules", () => {
    const cross = CARD_CATALOG.find(card => card.id === "cross");
    expect(cardPreviewTiles(cross, { col: 1, row: 1 })).not.toContainEqual({ col: 3, row: 0 });
    expect(getElementalMultiplier("fire", "wood", "grass")).toBe(4);
    expect(getElementalMultiplier("electric", "water", "ice")).toBe(4);
    expect(getElementalMultiplier("water", "none", "lava")).toBe(1);
  });
});
