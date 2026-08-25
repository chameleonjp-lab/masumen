import { describe, expect, it } from "vitest";
import { FixedStepClock } from "./FixedStepClock";

function runForRenderRate(
  renderRate: number,
  seconds: number
): { steps: number; simulation: number } {
  const clock = new FixedStepClock();
  let steps = 0;
  const frames = Math.round(renderRate * seconds);
  for (let frame = 0; frame < frames; frame += 1) {
    clock.advance(1 / renderRate, () => {
      steps += 1;
    });
  }
  return { steps, simulation: clock.getSimulationSeconds() };
}

describe("FixedStepClock", () => {
  it("produces the same 60 Hz simulation at 30, 60, and 120 render rates", () => {
    const thirty = runForRenderRate(30, 2);
    const sixty = runForRenderRate(60, 2);
    const oneTwenty = runForRenderRate(120, 2);

    expect(thirty.steps).toBe(120);
    expect(sixty.steps).toBe(120);
    expect(oneTwenty.steps).toBe(120);
    expect(thirty.simulation).toBeCloseTo(2, 8);
    expect(sixty.simulation).toBeCloseTo(2, 8);
    expect(oneTwenty.simulation).toBeCloseTo(2, 8);
  });

  it("discards a long interruption instead of replaying it", () => {
    const clock = new FixedStepClock();
    let steps = 0;

    clock.advance(1 / 60, () => {
      steps += 1;
    });
    const result = clock.advance(4.5, () => {
      steps += 1;
    });

    expect(steps).toBe(1);
    expect(result.steps).toBe(0);
    expect(result.discardedSeconds).toBeGreaterThan(4.49);
    expect(clock.getAccumulatorSeconds()).toBe(0);
  });

  it("does not accumulate time while paused and resumes without catch-up", () => {
    const clock = new FixedStepClock();
    let steps = 0;
    clock.setPaused(true);
    clock.advance(1, () => {
      steps += 1;
    });
    clock.setPaused(false);
    clock.advance(1 / 60, () => {
      steps += 1;
    });

    expect(steps).toBe(1);
    expect(clock.getSimulationSeconds()).toBeCloseTo(1 / 60, 8);
  });
});
