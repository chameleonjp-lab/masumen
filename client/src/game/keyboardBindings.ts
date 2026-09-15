export type KeyboardAction = "fire" | "charge" | "skill";
export type KeyboardBindings = Record<KeyboardAction, string>;

export const KEYBOARD_BINDINGS_KEY = "grid-signal-arena-keyboard-v1";

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBindings = {
  fire: "z",
  charge: " ",
  skill: "x",
};

const KEYBOARD_ACTIONS: readonly KeyboardAction[] = ["fire", "charge", "skill"];
const RESERVED_KEYBOARD_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "enter",
  "escape",
  "tab",
]);
const UNUSABLE_KEY_NAMES = new Set(["dead", "unidentified"]);

export function normaliseKeyboardKey(value: string): string {
  if (value === "Spacebar") return " ";
  return value === " " ? value : value.toLowerCase();
}

export function isReservedKeyboardKey(value: string): boolean {
  return RESERVED_KEYBOARD_KEYS.has(normaliseKeyboardKey(value));
}

export function isAssignableKeyboardKey(value: string): boolean {
  const key = normaliseKeyboardKey(value);
  return (
    key.length > 0 &&
    key.length <= 32 &&
    !RESERVED_KEYBOARD_KEYS.has(key) &&
    !UNUSABLE_KEY_NAMES.has(key)
  );
}

export function sanitiseKeyboardBindings(value: unknown): KeyboardBindings {
  if (!value || typeof value !== "object")
    return { ...DEFAULT_KEYBOARD_BINDINGS };
  const saved = value as Partial<Record<KeyboardAction, unknown>>;
  const next = {} as KeyboardBindings;
  const used = new Set<string>();

  for (const action of KEYBOARD_ACTIONS) {
    const raw = saved[action];
    if (typeof raw !== "string") return { ...DEFAULT_KEYBOARD_BINDINGS };
    const key = normaliseKeyboardKey(raw);
    if (!isAssignableKeyboardKey(key) || used.has(key)) {
      return { ...DEFAULT_KEYBOARD_BINDINGS };
    }
    next[action] = key;
    used.add(key);
  }
  return next;
}

export function readKeyboardBindings(): KeyboardBindings {
  if (typeof window === "undefined") return { ...DEFAULT_KEYBOARD_BINDINGS };
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(KEYBOARD_BINDINGS_KEY) ?? "null"
    ) as unknown;
    return sanitiseKeyboardBindings(saved);
  } catch {
    return { ...DEFAULT_KEYBOARD_BINDINGS };
  }
}

export function writeKeyboardBindings(bindings: KeyboardBindings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEYBOARD_BINDINGS_KEY,
      JSON.stringify(sanitiseKeyboardBindings(bindings))
    );
  } catch {
    // Private browsing may deny local storage; the current session still works.
  }
}

export function keyboardLabel(key: string): string {
  if (key === " ") return "スペース";
  if (key === "arrowup") return "上矢印";
  if (key === "arrowdown") return "下矢印";
  if (key === "arrowleft") return "左矢印";
  if (key === "arrowright") return "右矢印";
  return key.length === 1 ? key.toUpperCase() : key;
}

export function keyboardActionLabel(action: KeyboardAction): string {
  if (action === "fire") return "通常攻撃";
  if (action === "charge") return "チャージ";
  return "カード使用";
}

export function findKeyboardBindingConflict(
  action: KeyboardAction,
  key: string,
  bindings: KeyboardBindings
): KeyboardAction | null {
  const normalised = normaliseKeyboardKey(key);
  return (
    KEYBOARD_ACTIONS.find(
      candidate => candidate !== action && bindings[candidate] === normalised
    ) ?? null
  );
}
