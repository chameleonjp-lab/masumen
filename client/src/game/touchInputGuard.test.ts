import { describe, expect, it } from "vitest";
import {
  beginTouchAction,
  createTouchInputState,
  endTouchAction,
  touchActionForPointer,
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
    expect(second.state.actionPointerId).toBe(11);
  });

  it("チャージ中の別の指による移動を受け付ける", () => {
    const charging = beginTouchAction(
      createTouchInputState(),
      21,
      "charge",
      2000,
    );
    const moving = beginTouchAction(charging.state, 22, "move", 2001);

    expect(moving.accepted).toBe(true);
    expect(moving.state.chargePointerId).toBe(21);
    expect(moving.state.movePointerId).toBe(22);
  });

  it("移動を終えてもチャージ中の指を解除しない", () => {
    const charging = beginTouchAction(
      createTouchInputState(),
      21,
      "charge",
      2000,
    );
    const moving = beginTouchAction(charging.state, 22, "move", 2001);
    const afterMove = endTouchAction(moving.state, 22);

    expect(afterMove.movePointerId).toBeNull();
    expect(afterMove.chargePointerId).toBe(21);
  });

  it("二本の指をそれぞれの操作として識別する", () => {
    const charging = beginTouchAction(
      createTouchInputState(),
      21,
      "charge",
      2000,
    );
    const moving = beginTouchAction(charging.state, 22, "move", 2001);

    expect(touchActionForPointer(moving.state, 21)).toBe("charge");
    expect(touchActionForPointer(moving.state, 22)).toBe("move");
    expect(touchActionForPointer(moving.state, 99)).toBeNull();
  });

  it("同じ種類の二本目と競合する操作を受け付けない", () => {
    const charging = beginTouchAction(
      createTouchInputState(),
      21,
      "charge",
      2000,
    );
    expect(
      beginTouchAction(charging.state, 22, "charge", 2001).accepted,
    ).toBe(false);
    expect(
      beginTouchAction(charging.state, 23, "fire", 2001).accepted,
    ).toBe(false);
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
    expect(second.state.actionPointerId).toBeNull();
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
    expect(second.state.actionPointerId).toBe(12);
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
    expect(released.chargePointerId).toBeNull();
  });
});
