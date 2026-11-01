import { describe, it, expect } from "vitest";
import { restoreResultSnapshot, type PendingPlay } from "./playSession";
import type { BattleSnapshot } from "./types";
const base = {
  mode: "custom",
  score: 0,
  wave: 1,
  rank: "—",
  customHand: [],
  enemies: [],
  panels: [],
  objects: [],
  projectiles: [],
  queue: [],
  selected: [],
  playerGrid: { col: 1, row: 1 },
  elapsed: 0,
  counters: 0,
  highScore: 0,
  bestWave: 0,
} as unknown as BattleSnapshot;
const entry = {
  startId: "10000000-0000-4000-8000-000000000001",
  playerName: "Alice",
  clientVersion: "v1",
  result: { score: 321, resultType: "game_over", reachedWave: 2 },
} as PendingPlay;
describe("only verified result presentation can reach React", () => {
  it("never spreads untrusted gameplay objects or malformed result arrays", () => {
    const recovered = restoreResultSnapshot(
      {
        ...entry,
        presentation: {
          mode: "battle",
          score: 999,
          customHand: null,
          enemies: {},
          usedChainTechniques: {},
          elapsed: "oops",
          rank: {},
          scoreBreakdown: { total: "bad" },
          playerGrid: null,
        } as any,
      },
      base
    );
    expect(recovered).toMatchObject({
      mode: "result",
      score: 321,
      wave: 2,
      outcome: "defeat",
      rank: "R",
      elapsed: 0,
      customHand: [],
      enemies: [],
      playerGrid: { col: 1, row: 1 },
    });
    expect(recovered.usedChainTechniques).toEqual([]);
    expect(recovered.scoreBreakdown).toBeUndefined();
  });
  it("retains valid real result figures while ignoring wrong-score presentation", () => {
    const presentation = {
      mode: "result",
      score: 321,
      elapsed: 45.5,
      counters: 2,
      rank: "R",
      outcome: "draw",
      highScore: 500,
      totalDamageTaken: 220,
      usedChainTechniques: ["cross-fire"],
    } as any;
    expect(
      restoreResultSnapshot({ ...entry, presentation }, base)
    ).toMatchObject({
      elapsed: 45.5,
      counters: 2,
      outcome: "draw",
      score: 321,
      highScore: 500,
    });
    expect(
      restoreResultSnapshot(
        { ...entry, presentation: { ...presentation, score: 999 } },
        base
      )
    ).toMatchObject({ elapsed: 0, counters: 0, outcome: "defeat", score: 321 });
  });
});
