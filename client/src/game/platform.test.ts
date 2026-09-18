import { describe, expect, it } from "vitest";
import {
  GAME_URL,
  homeShareText,
  normalizeRanking,
  resultShareText,
} from "./platform";

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

describe("Supabaseランキングの表示変換", () => {
  it("RPCのrank_noとbest_scoreを順位・スコアへ変換する", () => {
    expect(
      normalizeRanking([
        {
          rank_no: 1,
          display_name: "  アリーナ太郎  ",
          first_score: 1200,
          best_score: 3456,
          play_count: 2,
        },
        {
          rank_no: 3,
          display_name: "スコア職人",
          first_score: 800,
          best_score: 2100,
          play_count: 4,
        },
      ])
    ).toEqual([
      { rank: 1, displayName: "アリーナ太郎", score: 3456 },
      { rank: 3, displayName: "スコア職人", score: 2100 },
    ]);
  });
});
