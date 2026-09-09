export type TouchAction = "move" | "fire" | "charge" | "skill";

export interface TouchInputState {
  movePointerId: number | null;
  chargePointerId: number | null;
  actionPointerId: number | null;
  action: Exclude<TouchAction, "move" | "charge"> | null;
  lastFireAt: number | null;
}

const FIRE_REPEAT_GUARD_MS = 140;

export function createTouchInputState(): TouchInputState {
  return {
    movePointerId: null,
    chargePointerId: null,
    actionPointerId: null,
    action: null,
    lastFireAt: null,
  };
}

export function touchActionForPointer(
  state: TouchInputState,
  pointerId: number,
): TouchAction | null {
  if (state.movePointerId === pointerId) return "move";
  if (state.chargePointerId === pointerId) return "charge";
  if (state.actionPointerId === pointerId) return state.action;
  return null;
}

export function beginTouchAction(
  state: TouchInputState,
  pointerId: number,
  action: TouchAction,
  now: number,
): { accepted: boolean; state: TouchInputState } {
  if (
    action === "fire" &&
    state.lastFireAt !== null &&
    now - state.lastFireAt < FIRE_REPEAT_GUARD_MS
  ) {
    return { accepted: false, state };
  }

  const hasActionPointer = state.actionPointerId !== null;
  if (action === "move") {
    if (state.movePointerId !== null || hasActionPointer) {
      return { accepted: false, state };
    }
    return {
      accepted: true,
      state: { ...state, movePointerId: pointerId },
    };
  }

  if (action === "charge") {
    if (state.chargePointerId !== null || hasActionPointer) {
      return { accepted: false, state };
    }
    return {
      accepted: true,
      state: { ...state, chargePointerId: pointerId },
    };
  }

  if (
    state.movePointerId !== null ||
    state.chargePointerId !== null ||
    hasActionPointer
  ) {
    return { accepted: false, state };
  }

  return {
    accepted: true,
    state: {
      ...state,
      actionPointerId: pointerId,
      action,
      lastFireAt: action === "fire" ? now : state.lastFireAt,
    },
  };
}

export function endTouchAction(
  state: TouchInputState,
  pointerId: number,
): TouchInputState {
  if (state.movePointerId === pointerId) {
    return { ...state, movePointerId: null };
  }
  if (state.chargePointerId === pointerId) {
    return { ...state, chargePointerId: null };
  }
  if (state.actionPointerId !== pointerId) return state;
  return {
    ...state,
    actionPointerId: null,
    action: null,
  };
}
