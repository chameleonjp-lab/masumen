import { describe, expect, it } from "vitest";
import {
  CARD_CATALOG,
  canAppendSelection,
  drawHand,
  validateSelection,
} from "./deck";

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

  it("keeps the current selection cap at five cards", () => {
    const hand = drawHand(0);
    expect(canAppendSelection(hand, [], 0)).toBe(true);
    expect(canAppendSelection(hand, [0, 1, 2, 3, 4], 0)).toBe(false);
  });

  it("validates the whole selected set using name, code, and wildcard rules", () => {
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
      rule: "name",
    });
    expect(validateSelection(hand, [0, 2, 3])).toMatchObject({
      valid: true,
      rule: "wildcard",
    });
    expect(validateSelection(hand, [3, 4])).toMatchObject({
      valid: true,
      rule: "wildcard",
    });
    expect(validateSelection(hand, [0, 5])).toMatchObject({
      valid: false,
    });
  });
});
