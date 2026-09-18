import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GAME_URL,
  finishMasumenPlay,
  homeShareText,
  loadRanking,
  normalizeRanking,
  resultShareText,
  startMasumenPlay,
} from "./platform";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("ランキングは上位10件だけを表示する", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      rank_no: index + 1,
      display_name: `プレイヤー${index + 1}`,
      best_score: 12000 - index,
    }));

    const ranking = normalizeRanking(rows);

    expect(ranking).toHaveLength(10);
    expect(ranking.at(-1)).toEqual({
      rank: 10,
      displayName: "プレイヤー10",
      score: 11991,
    });
  });

  it("ランキング取得を上位10件で依頼する", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await loadRanking();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rpc/get_best_score_ranking");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_game_slug: "masumen",
      p_limit: 10,
    });
  });

  it("開始時RPCでplay_idを受け取り、終了時RPCへ渡せる", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, play_id: "play-1" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true }),
      } as Response);

    await expect(startMasumenPlay("  テスト名  ")).resolves.toBe("play-1");
    await expect(
      finishMasumenPlay({
        playId: "play-1",
        playerName: "テスト名",
        resultType: "game_over",
        reachedWave: 3,
        score: 4321,
      })
    ).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0][0]).toContain("/rpc/start_masumen_play_v1");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      p_display_name: "テスト名",
    });
    expect(fetchMock.mock.calls[1][0]).toContain("/rpc/finish_masumen_play_v1");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      p_play_id: "play-1",
      p_display_name: "テスト名",
      p_result_type: "game_over",
      p_reached_wave: 3,
      p_score: 4321,
    });
  });
});
