import { describe, expect, it } from "vitest";
import { CARD_CATALOG } from "../deck";
import {
  CARD_COMBAT_PROFILES,
  PR7_CARD_IDS,
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
