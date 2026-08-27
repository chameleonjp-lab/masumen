import { describe, expect, it, vi } from "vitest";
import {
  createMovementRepeat,
  MOVEMENT_INITIAL_DELAY_MS,
  MOVEMENT_REPEAT_INTERVAL_MS,
} from "./movementRepeat";
import type { TimerHost } from "./movementRepeat";

describe("movement repeat", () => {
  it("moves once immediately, then repeats after the initial delay", () => {
    vi.useFakeTimers();
    const moves: number[] = [];
    const repeat = createMovementRepeat(globalThis as unknown as TimerHost);

    repeat.start(() => moves.push(moves.length + 1));
    expect(moves).toHaveLength(1);

    vi.advanceTimersByTime(MOVEMENT_INITIAL_DELAY_MS - 1);
    expect(moves).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(moves).toHaveLength(2);
    vi.advanceTimersByTime(MOVEMENT_REPEAT_INTERVAL_MS * 2);
    expect(moves).toHaveLength(4);
    repeat.stop();
    vi.advanceTimersByTime(MOVEMENT_REPEAT_INTERVAL_MS * 2);
    expect(moves).toHaveLength(4);
    vi.useRealTimers();
  });

  it("restarting the repeat cancels the previous schedule", () => {
    vi.useFakeTimers();
    const moves: string[] = [];
    const repeat = createMovementRepeat(globalThis as unknown as TimerHost);

    repeat.start(() => moves.push("old"));
    vi.advanceTimersByTime(100);
    repeat.start(() => moves.push("new"));
    vi.advanceTimersByTime(MOVEMENT_INITIAL_DELAY_MS);
    expect(moves).toEqual(["old", "new", "new"]);
    repeat.stop();
    vi.useRealTimers();
  });
});
