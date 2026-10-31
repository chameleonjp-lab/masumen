import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GAME_URL,
  CLIENT_VERSION,
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

  it("ランキングは上位30件だけを表示する", () => {
    const rows = Array.from({ length: 32 }, (_, index) => ({
      rank_no: index + 1,
      display_name: `プレイヤー${index + 1}`,
      best_score: 12000 - index,
    }));

    const ranking = normalizeRanking(rows);

    expect(ranking).toHaveLength(30);
    expect(ranking.at(-1)).toEqual({
      rank: 30,
      displayName: "プレイヤー30",
      score: 11971,
    });
  });

  it("ランキング取得を上位30件で依頼する", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await loadRanking();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/rpc/get_best_score_ranking");
    expect(JSON.parse(String(init?.body))).toEqual({
      p_game_slug: "masumen",
      p_limit: 30,
    });
  });

  it("開始時RPCでplay_idを受け取り、終了時RPCへ渡せる", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, duplicate: false, start_id: "10000000-0000-4000-8000-000000000001",play_id: "30000000-0000-4000-8000-000000000003",game_slug:"masumen",display_name:"テスト名",normalized_name:"テスト名",client_version:CLIENT_VERSION }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, duplicate:false,play_id:"30000000-0000-4000-8000-000000000003",game_slug:"masumen",result_type:"game_over",reached_wave:3,score:4321 }),
      } as Response);

    await expect(startMasumenPlay("  テスト名  ","10000000-0000-4000-8000-000000000001")).resolves.toBe("30000000-0000-4000-8000-000000000003");
    await expect(
      finishMasumenPlay({
        playId: "30000000-0000-4000-8000-000000000003",
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
      p_play_id: "30000000-0000-4000-8000-000000000003",
      p_display_name: "テスト名",
      p_result_type: "game_over",
      p_reached_wave: 3,
      p_score: 4321,
    });
  });
});

describe('saved sound preferences', () => {
  it('keeps explicit off and zero and defaults only invalid values', async () => {
    const {readSoundPreferences, saveSoundPreferences}=await import('./platform');
    const values = new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
    expect(readSoundPreferences()).toEqual({enabled:true,volume:70});
    saveSoundPreferences({enabled:false,volume:0});
    expect(readSoundPreferences()).toEqual({enabled:false,volume:0});
    saveSoundPreferences({enabled:true,volume:35});
    expect(readSoundPreferences()).toEqual({enabled:true,volume:35});
    vi.unstubAllGlobals();
  });
});

describe('strict acknowledgements for the existing idempotent protocol',()=>{
  it('does not accept an unrelated start ID/name/version',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({accepted:true,duplicate:false,start_id:'wrong',play_id:'30000000-0000-4000-8000-000000000003',game_slug:'masumen',display_name:'Bob',normalized_name:'Bob',client_version:'new'})} as Response);
    await expect(startMasumenPlay('Alice','10000000-0000-4000-8000-000000000001','captured')).rejects.toThrow();
  });
  it('does not acknowledge a different result even when accepted is true',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:true,json:async()=>({accepted:true,duplicate:true,play_id:'30000000-0000-4000-8000-000000000003',game_slug:'masumen',result_type:'clear',reached_wave:5,score:999})} as Response);
    await expect(finishMasumenPlay({playId:'30000000-0000-4000-8000-000000000003',playerName:'Alice',resultType:'clear',reachedWave:5,score:100,clientVersion:'captured'})).rejects.toThrow();
  });
});
