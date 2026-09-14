import { describe, expect, it } from "vitest";
import { GAME_URL, homeShareText, resultShareText } from "./platform";

describe("マスメンのシェア文", () => {
  it("uses a plain URL and the requested game invitation", () => {
    expect(homeShareText()).toBe(
      `【マスメン】カードを使いながら5ウェーブを戦い抜け！\n${GAME_URL}`
    );
    expect(homeShareText()).not.toContain("#");
  });

  it("keeps result sharing to the invitation, score, and plain URL", () => {
    expect(
      resultShareText({
        score: 1234,
        rank: "A",
        elapsed: 42,
        reachedWave: 4,
        counters: 3,
        simultaneousDefeats: 1,
        cardsUsed: 5,
      })
    ).toBe(
      `【マスメン】カードを使いながら5ウェーブを戦い抜け！\nスコア：1,234点\n${GAME_URL}`
    );
  });
});
