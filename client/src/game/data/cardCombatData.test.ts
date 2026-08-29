import { describe, expect, it } from "vitest";
import { CARD_CATALOG } from "../deck";
import {
  CARD_COMBAT_PROFILES,
  PR7_CARD_IDS,
  PR8_CARD_IDS,
  cardPlacementTarget,
  cardPreviewTiles,
  cardTransferTarget,
  getElementalMultiplier,
  nearestEnemyPosition,
} from "./cardCombatData";
import type { PanelState } from "../types";

function panel(overrides: Partial<PanelState>): PanelState {
  return {
    col: 0,
    row: 0,
    owner: "enemy",
    terrain: "normal",
    occupantId: null,
    objectId: null,
    expiresAt: null,
    ...overrides,
  };
}

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

  it("keeps each melee card label aligned with its preview tiles", () => {
    const origin = { col: 1, row: 1 };
    const enemies = [{ col: 4, row: 1 }];
    const cards = new Map(
      ["slash", "sweep", "dashslash", "gridcut", "moonblade"].map(id => [
        id,
        CARD_CATALOG.find(card => card.id === id),
      ])
    );

    expect([...cards.values()].map(card => card?.rangeLabel)).toEqual([
      "正面1マス",
      "正面の縦3マス",
      "最も近い敵のマス",
      "最も近い敵中心の十字",
      "正面の同じ行2マス",
    ]);
    expect(cardPreviewTiles(cards.get("slash"), origin, enemies)).toEqual([{ col: 2, row: 1 }]);
    expect(cardPreviewTiles(cards.get("sweep"), origin, enemies)).toEqual([
      { col: 2, row: 0 },
      { col: 2, row: 1 },
      { col: 2, row: 2 },
    ]);
    expect(cardPreviewTiles(cards.get("dashslash"), origin, enemies)).toEqual([{ col: 4, row: 1 }]);
    expect(cardPreviewTiles(cards.get("gridcut"), origin, enemies)).toEqual([
      { col: 3, row: 1 },
      { col: 4, row: 1 },
      { col: 5, row: 1 },
      { col: 4, row: 0 },
      { col: 4, row: 2 },
    ]);
    expect(cardPreviewTiles(cards.get("moonblade"), origin, enemies)).toEqual([
      { col: 2, row: 1 },
      { col: 3, row: 1 },
    ]);
  });

  it("shares the nearest target and available placement between preview helpers", () => {
    const origin = { col: 1, row: 1 };
    const enemies = [{ col: 2, row: 0 }, { col: 5, row: 1 }];
    const timer = CARD_CATALOG.find(card => card.id === "timer");
    const rush = CARD_CATALOG.find(card => card.id === "rush");
    const panels = [
      panel({ col: 2, row: 0, occupantId: "scanner" }),
      panel({ col: 3, row: 0 }),
      panel({ col: 3, row: 1 }),
      panel({ col: 2, row: 1, owner: "player", occupantId: "player" }),
    ];

    expect(nearestEnemyPosition(origin, enemies)).toEqual({ col: 2, row: 0 });
    expect(cardPlacementTarget(origin, enemies, panels)).toEqual({ col: 3, row: 0 });
    expect(cardPreviewTiles(timer, origin, enemies, panels)).toEqual([
      { col: 3, row: 0 },
    ]);
    expect(cardTransferTarget(origin, enemies, panels)).toEqual({ col: 3, row: 0 });
    expect(cardPreviewTiles(rush, origin, enemies, panels)).toEqual([
      { col: 3, row: 0 },
    ]);
  });

  it("previews only the empty panels selected by the reverse-phase hole", () => {
    const hole = CARD_CATALOG.find(card => card.id === "hole");
    const panels = [
      panel({ col: 3, row: 0 }),
      panel({ col: 3, row: 1, occupantId: "enemy-a" }),
      panel({ col: 3, row: 2 }),
      panel({ col: 4, row: 0 }),
    ];

    expect(cardPreviewTiles(hole, { col: 1, row: 1 }, [], panels)).toEqual([
      { col: 3, row: 0 },
      { col: 3, row: 2 },
      { col: 4, row: 0 },
      { col: 3, row: 1 },
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
