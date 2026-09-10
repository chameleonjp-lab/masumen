import { describe, expect, it } from "vitest";
import { CARD_CATALOG } from "./deck";
import { OVERLOAD_CARDS } from "./data/overloadCards";
import { cardPresentation, cardTargetLabel } from "./cardPresentation";

describe("カード表示用プレゼンテーション", () => {
  it("全カードに識別名・対象範囲・読みやすい説明を用意する", () => {
    for (const card of [...CARD_CATALOG, ...OVERLOAD_CARDS]) {
      const presentation = cardPresentation(card);

      expect(presentation.signatureLabel).not.toHaveLength(0);
      expect(presentation.roleLabel).toBe(card.family);
      expect(presentation.targetLabel).not.toBe("対象範囲");
      expect(presentation.summary).not.toMatch(/ミリ秒/);
      expect(presentation.summary).toMatch(/[。！？]$/);
      expect(presentation.glyph).not.toHaveLength(0);
    }
  });

  it("専門的な時間・耐久表記をプレイヤー向けに変換する", () => {
    const rapid = cardPresentation(
      CARD_CATALOG.find(card => card.id === "rapid")
    );
    const block = cardPresentation(
      CARD_CATALOG.find(card => card.id === "block")
    );
    const repair = cardPresentation(
      CARD_CATALOG.find(card => card.id === "repair")
    );

    expect(rapid.summary).toContain("0.1秒間隔");
    expect(block.summary).toContain("耐久100");
    expect(repair.summary).toContain("0.6秒");
    expect(repair.statusLabel).toBe("回復");
    expect(repair.impactLabel).toBe("回復 100");
  });

  it("効果の種類に応じて威力以外の数値も表示する", () => {
    const sanctum = cardPresentation(
      CARD_CATALOG.find(card => card.id === "sanctum")
    );
    const prism = cardPresentation(
      CARD_CATALOG.find(card => card.id === "prism")
    );
    const rapid = cardPresentation(
      CARD_CATALOG.find(card => card.id === "rapid")
    );

    expect(sanctum.impactLabel).toBe("回復 20");
    expect(prism.impactLabel).toBe("障壁 100");
    expect(rapid.impactLabel).toBe("威力 12");
    expect(rapid.hitLabel).toBe("3回作用");
  });

  it("カード固有の作用範囲を汎用形状ラベルより優先する", () => {
    const labels = [
      "icewall",
      "web",
      "turret",
      "block",
      "sector",
      "gustwall",
      "sanctuary",
      "overdrive",
    ].map(id => {
      const card = CARD_CATALOG.find(candidate => candidate.id === id);
      return [id, cardTargetLabel(card)] as const;
    });

    expect(Object.fromEntries(labels)).toEqual({
      icewall: "最寄り敵＋近くの空きマス",
      web: "最寄り敵中心の2×2",
      turret: "自陣前列",
      block: "自分の正面1マス",
      sector: "敵前列1列",
      gustwall: "敵陣全行",
      sanctuary: "全自陣",
      overdrive: "最も近い敵へ3回入力",
    });
  });

  it("未選択状態にも安全な説明を返す", () => {
    const presentation = cardPresentation(undefined);

    expect(presentation.summary).toContain("カードを選ぶと");
    expect(cardTargetLabel(undefined)).toBe("対象範囲");
  });
});
