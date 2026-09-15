import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KEYBOARD_BINDINGS,
  findKeyboardBindingConflict,
  isAssignableKeyboardKey,
  isReservedKeyboardKey,
  normaliseKeyboardKey,
  readKeyboardBindings,
  sanitiseKeyboardBindings,
  writeKeyboardBindings,
  type KeyboardBindings,
} from "./keyboardBindings";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PCキーバインド", () => {
  it("英字・記号・ファンクションキーを割り当てられる", () => {
    expect(isAssignableKeyboardKey("j")).toBe(true);
    expect(isAssignableKeyboardKey("F1")).toBe(true);
    expect(isAssignableKeyboardKey(" ")).toBe(true);
    expect(normaliseKeyboardKey("Spacebar")).toBe(" ");
  });

  it("移動・決定に使うキーと未確定キーは割り当てられない", () => {
    expect(isReservedKeyboardKey("ArrowLeft")).toBe(true);
    expect(isAssignableKeyboardKey("ArrowLeft")).toBe(false);
    expect(isAssignableKeyboardKey("Enter")).toBe(false);
    expect(isAssignableKeyboardKey("Dead")).toBe(false);
    expect(isAssignableKeyboardKey("")).toBe(false);
  });

  it("保存値が重複・不正なら安全な初期設定へ戻す", () => {
    expect(
      sanitiseKeyboardBindings({ fire: "j", charge: "k", skill: "l" })
    ).toEqual({ fire: "j", charge: "k", skill: "l" });
    expect(
      sanitiseKeyboardBindings({ fire: "j", charge: "j", skill: "l" })
    ).toEqual(DEFAULT_KEYBOARD_BINDINGS);
    expect(
      sanitiseKeyboardBindings({ fire: "ArrowUp", charge: "k", skill: "l" })
    ).toEqual(DEFAULT_KEYBOARD_BINDINGS);
  });

  it("設定を保存して次回起動時に読み戻せる", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    const bindings: KeyboardBindings = { fire: "j", charge: "k", skill: "l" };

    writeKeyboardBindings(bindings);

    expect(readKeyboardBindings()).toEqual(bindings);
  });

  it("同じキーを複数の操作へ割り当てない", () => {
    const bindings: KeyboardBindings = { fire: "j", charge: "k", skill: "l" };
    expect(findKeyboardBindingConflict("fire", "l", bindings)).toBe("skill");
    expect(findKeyboardBindingConflict("fire", "u", bindings)).toBeNull();
  });
});
