export type TouchAction = "move" | "fire" | "charge" | "skill";

export interface TouchInputState {
  activePointerId: number | null;
  activeAction: TouchAction | null;
  lastFireAt: number | null;
}

const FIRE_REPEAT_GUARD_MS = 140;

export function createTouchInputState(): TouchInputState {
  return {
    activePointerId: null,
    activeAction: null,
    lastFireAt: null,
  };
}

export function beginTouchAction(
  state: TouchInputState,
  pointerId: number,
  action: TouchAction,
  now: number,
): { accepted: boolean; state: TouchInputState } {
  if (state.activePointerId !== null) {
    return { accepted: false, state };
  }
  if (
    action === "fire" &&
    state.lastFireAt !== null &&
    now - state.lastFireAt < FIRE_REPEAT_GUARD_MS
  ) {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: {
      activePointerId: pointerId,
      activeAction: action,
      lastFireAt: action === "fire" ? now : state.lastFireAt,
    },
  };
}

export function endTouchAction(
  state: TouchInputState,
  pointerId: number,
): TouchInputState {
  if (state.activePointerId !== pointerId) return state;
  return {
    ...state,
    activePointerId: null,
    activeAction: null,
  };
}
