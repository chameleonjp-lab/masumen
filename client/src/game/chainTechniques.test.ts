import { describe, expect, it } from "vitest";
import { CARD_CATALOG } from "./deck";
import {
  CHAIN_TECHNIQUES,
  createChainCard,
  findChainTechnique,
} from "./data/chainTechniques";
import type { Card, ConnectionCode } from "./types";

function cards(
  ids: readonly string[],
  selectedCodes?: readonly ConnectionCode[]
): Card[] {
  return ids.map((id, index) => {
    const card = CARD_CATALOG.find(candidate => candidate.id === id);
    if (!card) throw new Error(`Missing card: ${id}`);
    return {
      ...card,
      selectedCode: selectedCodes?.[index] ?? (card.code as ConnectionCode),
    };
  });
}

describe("PR9連結技データ", () => {
  it("定義を8種類だけ持つ", () => {
    expect(CHAIN_TECHNIQUES).toHaveLength(8);
    expect(new Set(CHAIN_TECHNIQUES.map(technique => technique.id)).size).toBe(8);
  });

  it("選択順と選択コードを全体で検証する", () => {
    expect(
      findChainTechnique(cards(["ember", "fireline", "timer"], ["F", "F", "F"]))?.id
    ).toBe("fire-requiem");
    expect(
      findChainTechnique(cards(["timer", "fireline", "ember"], ["F", "F", "F"]))
    ).toBeUndefined();
    expect(
      findChainTechnique(cards(["ember", "fireline", "timer"], ["A", "F", "F"]))
    ).toBeUndefined();
  });

  it("同名の連射弾と共通コードを含む連結を扱う", () => {
    expect(findChainTechnique(cards(["rapid", "rapid", "rapid"]))?.id).toBe(
      "rapid-barrage"
    );
    expect(
      findChainTechnique(cards(["rectify", "repair", "sanctum"], ["*", "*", "A"]))?.id
    ).toBe("full-repair");
  });

  it("構成カードを連結カードへ変換して消費情報を残す", () => {
    const source = cards(["slash", "sweep", "moonblade"], ["A", "A", "A"]);
    const technique = findChainTechnique(source);
    if (!technique) throw new Error("chain not found");
    const chain = createChainCard(technique, source);
    expect(chain.id).toBe("chain-triple-moon");
    expect(chain.chainTechniqueId).toBe("triple-moon");
    expect(chain.chainCardIds).toEqual(["slash", "sweep", "moonblade"]);
    expect(chain.name).toBe("三重月断");
  });
});
