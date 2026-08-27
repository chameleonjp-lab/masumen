import { describe, expect, it } from "vitest";
import {
  beginTouchAction,
  createTouchInputState,
  endTouchAction,
} from "./touchInputGuard";

describe("touch input guard", () => {
  it("同時の二本目のタッチを受け付けない", () => {
    const first = beginTouchAction(
      createTouchInputState(),
      11,
      "fire",
      1000,
    );
    expect(first.accepted).toBe(true);

    const second = beginTouchAction(first.state, 12, "fire", 1001);
    expect(second.accepted).toBe(false);
    expect(second.state.activePointerId).toBe(11);
  });

  it("通常攻撃の短い二重入力を抑止する", () => {
    const first = beginTouchAction(
      createTouchInputState(),
      11,
      "fire",
      1000,
    );
    const released = endTouchAction(first.state, 11);
    const second = beginTouchAction(released, 12, "fire", 1100);

    expect(second.accepted).toBe(false);
    expect(second.state.activePointerId).toBeNull();
  });

  it("通常攻撃は十分な間隔があれば受け付ける", () => {
    const first = beginTouchAction(
      createTouchInputState(),
      11,
      "fire",
      1000,
    );
    const released = endTouchAction(first.state, 11);
    const second = beginTouchAction(released, 12, "fire", 1140);

    expect(second.accepted).toBe(true);
    expect(second.state.activePointerId).toBe(12);
  });

  it("チャージは対応する指の終了でだけ解除できる", () => {
    const first = beginTouchAction(
      createTouchInputState(),
      21,
      "charge",
      2000,
    );
    expect(endTouchAction(first.state, 99)).toEqual(first.state);

    const released = endTouchAction(first.state, 21);
    expect(released.activePointerId).toBeNull();
    expect(released.activeAction).toBeNull();
  });
});
