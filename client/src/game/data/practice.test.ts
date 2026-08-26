import { describe, expect, it } from "vitest";
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
      stage.actionHint.length > 0
    )).toBe(true);
  });

  it("clamps requests outside the available stages", () => {
    expect(getPracticeStage(0).stage).toBe(1);
    expect(getPracticeStage(99).stage).toBe(7);
  });
});
