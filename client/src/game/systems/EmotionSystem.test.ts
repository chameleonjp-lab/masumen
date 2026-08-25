import { describe, expect, it } from "vitest";
import { EmotionSystem } from "./EmotionSystem";

describe("EmotionSystem", () => {
  it("enters shaken after three hits in six seconds and recovers after eight seconds", () => {
    const emotion = new EmotionSystem();
    emotion.recordDamage(0, 10, 210, 220);
    emotion.recordDamage(1000, 10, 200, 220);
    emotion.recordDamage(5000, 10, 190, 220);
    expect(emotion.snapshot(5000).state).toBe("shaken");
    expect(emotion.overloadChance()).toBeCloseTo(0.4, 5);
    emotion.update(13000, 190, 220, false);
    expect(emotion.snapshot(13000).state).toBe("normal");
  });

  it("grants rage once per wave for a large real hit and consumes it on an attack card", () => {
    const emotion = new EmotionSystem();
    emotion.recordDamage(100, 44, 176, 220);
    expect(emotion.snapshot(100).state).toBe("enraged");
    expect(emotion.snapshot(100).rageReady).toBe(true);
    expect(emotion.snapshot(100).remainingMs).toBe(2000);
    expect(emotion.isRageStaggerImmune(1500)).toBe(true);
    expect(emotion.counterSuccess()).toBe(false);
    expect(emotion.consumePower(false)).toBe("enraged");
    expect(emotion.snapshot(100).rageReady).toBe(false);
    emotion.recordDamage(200, 44, 132, 220);
    expect(emotion.snapshot(200).state).not.toBe("enraged");
  });

  it("keeps corruption within three stages and applies run-only healing reduction", () => {
    const emotion = new EmotionSystem();
    expect(emotion.registerOverload()).toEqual({
      corruption: 1,
      appliedMaxHpReduction: 10,
    });
    emotion.registerOverload();
    emotion.registerOverload();
    expect(emotion.registerOverload()).toEqual({
      corruption: 3,
      appliedMaxHpReduction: 0,
    });
    expect(emotion.snapshot(0).maxHpReduction).toBe(30);
    expect(emotion.overloadChance()).toBe(1);
    expect(emotion.healMultiplier()).toBeCloseTo(0.7, 5);
    emotion.resetRun();
    expect(emotion.snapshot(0)).toMatchObject({
      state: "normal",
      corruption: 0,
      maxHpReduction: 0,
    });
  });
});
