import { describe, expect, it } from "vitest";
import {
  CARD_CATALOG,
  canAppendSelection,
  MAX_CARD_SELECTION,
  drawHand,
  validateSelection,
} from "./deck";
import { OVERLOAD_CARDS } from "./data/overloadCards";

describe("現行カードカタログの基準", () => {
  it("contains the protected 50-card catalog", () => {
    expect(CARD_CATALOG).toHaveLength(50);
    expect(new Set(CARD_CATALOG.map(card => card.id)).size).toBe(50);
  });

  it("draws five cards for each protected wave seed", () => {
    for (let waveSeed = 0; waveSeed < 4; waveSeed += 1) {
      expect(drawHand(waveSeed)).toHaveLength(5);
    }
  });

  it("allows every selection size from one through five and caps only at five", () => {
    const hand = CARD_CATALOG.slice(0, MAX_CARD_SELECTION + 1);
    for (let count = 1; count <= MAX_CARD_SELECTION; count += 1) {
      const selected = Array.from({ length: count }, (_, index) => index);
      expect(validateSelection(hand, selected)).toMatchObject({
        valid: true,
        rule: null,
      });
    }
    expect(canAppendSelection(hand, [], 0)).toBe(true);
    expect(canAppendSelection(hand, [0, 1, 2, 3], 4)).toBe(true);
    expect(canAppendSelection(hand, [0, 1, 2, 3, 4], 5)).toBe(false);
    expect(validateSelection(hand, []).valid).toBe(false);
    expect(validateSelection(hand, [0, 1, 2, 3, 4, 5]).valid).toBe(false);
  });

  it("allows every displayed card regardless of name or connection code", () => {
    const card = (id: string, selectedCode: string) => ({
      ...CARD_CATALOG.find(item => item.id === id)!,
      selectedCode: selectedCode as "A" | "B" | "*",
    });
    const hand = [
      card("rapid", "A"),
      card("rapid", "B"),
      card("triplet", "A"),
      card("return", "*"),
      card("rectify", "*"),
      card("seeker", "B"),
    ];
    expect(validateSelection(hand, [0, 1])).toMatchObject({
      valid: true,
      rule: null,
    });
    expect(validateSelection(hand, [0, 2, 3])).toMatchObject({
      valid: true,
      rule: null,
    });
    expect(validateSelection(hand, [3, 4])).toMatchObject({
      valid: true,
      rule: null,
    });
    expect(validateSelection(hand, [0, 5]).valid).toBe(true);
  });

  it("allows an overload card to be selected with the other displayed cards", () => {
    const overload = OVERLOAD_CARDS[0];
    const hand = [overload, CARD_CATALOG[0]];
    expect(validateSelection(hand, [0])).toMatchObject({ valid: true, rule: null });
    expect(validateSelection(hand, [0, 1]).valid).toBe(true);
  });
});
