import { describe, expect, it } from "vitest";
import { ALL_ENEMY_IDS } from "../data/enemies";
import {
  calculateScoreTotal,
  createScoreBreakdown,
  enemyDefeatScore,
  rankForScore,
  scoreRate,
  scoreWaveCompletion,
} from "./ScoreSystem";

describe("ScoreSystem", () => {
  it("calculates wave clear, time, and no-damage points independently", () => {
    const fast = scoreWaveCompletion({
      wave: 1,
      elapsedSeconds: 40,
      damageTaken: 0,
    });
    expect(fast.waveClearPoints).toBe(300);
    expect(fast.timePoints).toBe(100);
    expect(fast.noDamagePoints).toBe(500);
    expect(fast.total).toBe(900);

    const slow = scoreWaveCompletion({
      wave: 2,
      elapsedSeconds: 70,
      damageTaken: 8,
    });
    expect(slow.waveClearPoints).toBe(600);
    expect(slow.timePoints).toBe(0);
    expect(slow.noDamagePoints).toBe(0);
    expect(slow.total).toBe(600);
  });

  it("keeps the total score at zero instead of going negative", () => {
    const breakdown = createScoreBreakdown();
    breakdown.damagePenalty = 9999;
    breakdown.overloadPenalty = 9999;
    breakdown.total = calculateScoreTotal(breakdown);
    expect(breakdown.total).toBe(0);
  });

  it("uses a stable positive defeat value for every normal enemy and boss", () => {
    ALL_ENEMY_IDS.forEach(enemyId => {
      expect(enemyDefeatScore(enemyId)).toBeGreaterThan(0);
    });
  });

  it("maps score rate to S through D ranks", () => {
    expect(scoreRate(8000)).toBe(1);
    expect(rankForScore(7200)).toBe("S");
    expect(rankForScore(6000)).toBe("A");
    expect(rankForScore(4800)).toBe("B");
    expect(rankForScore(3600)).toBe("C");
    expect(rankForScore(3599)).toBe("D");
  });
});
