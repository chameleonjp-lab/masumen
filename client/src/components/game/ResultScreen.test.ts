import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BattleSnapshot } from "@/game/types";
import ResultScreen from "./ResultScreen";

const resultSnapshot: BattleSnapshot = {
  mode: "result",
  playerHp: 100,
  playerMaxHp: 100,
  playerGrid: { col: 0, row: 0 },
  gauge: 0,
  sync: false,
  emotion: "normal",
  emotionRemaining: 0,
  corruption: 0,
  charging: 0,
  barrier: 0,
  invincible: false,
  invincibleRemaining: 0,
  customHand: [],
  customHandNumber: 1,
  selected: [],
  focusedCard: null,
  selectionError: null,
  queue: [],
  enemies: [],
  panels: [],
  objects: [],
  projectiles: [],
  message: "",
  elapsed: 42,
  counters: 0,
  rank: "A",
  wave: 4,
  score: 1234,
  highScore: 1234,
  bestWave: 4,
  paused: false,
  customRemaining: 0,
  outcome: "victory",
};

function renderResult(rankingStatus: string) {
  return renderToStaticMarkup(
    createElement(ResultScreen, {
      snapshot: resultSnapshot,
      playerName: "テスト隊員",
      ranking: [],
      rankingStatus,
      onRestart: vi.fn(),
      onFolderEdit: vi.fn(),
      onHome: vi.fn(),
      onRetryRanking: vi.fn(),
    })
  );
}

describe("結果画面のランキング通信復帰", () => {
  it("通信失敗時は再試行ボタンを表示する", () => {
    const html = renderResult(
      "ランキングは現在利用できません（結果は表示されています）"
    );

    expect(html).toContain("ランキングを再試行");
    expect(html).toContain('role="status"');
  });

  it("通信成功時は再試行ボタンを表示しない", () => {
    const html = renderResult("オンラインランキングに反映しました");

    expect(html).not.toContain("ランキングを再試行");
  });
});
