export const MOVEMENT_INITIAL_DELAY_MS = 220;
export const MOVEMENT_REPEAT_INTERVAL_MS = 130;

export interface TimerHost {
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
}

export interface MovementRepeat {
  start(callback: () => void): void;
  stop(): void;
}

export function createMovementRepeat(timer: TimerHost = window): MovementRepeat {
  let timeoutId: number | null = null;
  let intervalId: number | null = null;

  const stop = (): void => {
    if (timeoutId !== null) timer.clearTimeout(timeoutId);
    if (intervalId !== null) timer.clearInterval(intervalId);
    timeoutId = null;
    intervalId = null;
  };

  return {
    start(callback) {
      stop();
      callback();
      timeoutId = timer.setTimeout(() => {
        timeoutId = null;
        callback();
        intervalId = timer.setInterval(callback, MOVEMENT_REPEAT_INTERVAL_MS);
      }, MOVEMENT_INITIAL_DELAY_MS);
    },
    stop,
  };
}
