import { describe, expect, it } from "vitest";
import { CARD_CATALOG } from "../deck";
import { OVERLOAD_CARDS } from "./overloadCards";
import { getPracticeStage, PRACTICE_STAGES } from "./practice";

describe("練習モード定義", () => {
  it("contains the seven planned lessons in order", () => {
    expect(PRACTICE_STAGES).toHaveLength(7);
    expect(PRACTICE_STAGES.map(stage => stage.stage)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(PRACTICE_STAGES.every(stage =>
      stage.title.length > 0 &&
      stage.lesson.length > 0 &&
      stage.objective.length > 0 &&
      stage.actionHint.length > 0 &&
      stage.requiredProgress.length > 0
    )).toBe(true);
  });

  it("keeps every stage supply connected to a real card definition", () => {
    const cardIds = new Set([
      ...CARD_CATALOG.map(card => card.id),
      ...OVERLOAD_CARDS.map(card => card.id),
    ]);
    expect(PRACTICE_STAGES.flatMap(stage => stage.supplyCardIds).every(id =>
      cardIds.has(id)
    )).toBe(true);
    expect(PRACTICE_STAGES.every(stage =>
      new Set(stage.requiredProgress).size === stage.requiredProgress.length
    )).toBe(true);
  });

  it("clamps requests outside the available stages", () => {
    expect(getPracticeStage(0).stage).toBe(1);
    expect(getPracticeStage(99).stage).toBe(7);
  });
});
