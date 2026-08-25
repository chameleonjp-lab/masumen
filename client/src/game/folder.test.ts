import { beforeEach, describe, expect, it } from "vitest";
import { CARD_CATALOG } from "./deck";
import { getAllowedCodes } from "./data/cardCodes";
import {
  BattleDeck,
  createStandardFolder,
  defaultSaveData,
  loadSaveData,
  validateFolder,
} from "./folder";
import type { Card, ConnectionCode } from "./types";

function entry(cardId: string, index: number, code?: ConnectionCode) {
  const card = CARD_CATALOG.find(item => item.id === cardId);
  if (!card) throw new Error(`missing card ${cardId}`);
  return {
    instanceId: `test-${index}`,
    cardId,
    code: code ?? getAllowedCodes(card)[0],
  };
}

function installStorage(): Map<string, string> {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    },
  });
  return storage;
}

describe("30枚フォルダと保存データ", () => {
  beforeEach(() => installStorage());

  it("creates a valid standard folder with exactly 30 entries", () => {
    const folder = createStandardFolder();
    expect(folder.cards).toHaveLength(30);
    expect(validateFolder(folder)).toEqual({ valid: true, errors: [] });
  });

  it("enforces standard, upper, and trump limits", () => {
    const folder = createStandardFolder("limits");
    const tooManyStandard = {
      ...folder,
      cards: Array.from({ length: 30 }, (_, index) => entry("rapid", index)),
    };
    expect(validateFolder(tooManyStandard).errors).toContain(
      "連射弾は標準カードの上限4枚を超えています"
    );

    const upperCards = ["meteor", "dream", "sanctuary", "meteor", "dream", "sanctuary"];
    const tooManyUpper = {
      ...folder,
      cards: [
        ...upperCards.map((cardId, index) => entry(cardId, index)),
        ...folder.cards.slice(6).map((item, index) => ({
          ...item,
          instanceId: `upper-${index + 6}`,
        })),
      ],
    };
    expect(validateFolder(tooManyUpper).errors).toContain(
      "上位カードは合計5枚までです（現在6枚）"
    );

    const tooManyTrump = {
      ...folder,
      cards: [
        entry("overdrive", 0),
        entry("overdrive", 1),
        ...folder.cards.slice(2).map((item, index) => ({
          ...item,
          instanceId: `trump-${index + 2}`,
        })),
      ],
    };
    expect(validateFolder(tooManyTrump).errors).toContain(
      "切札カードは1枚までです（現在2枚）"
    );
  });

  it("falls back to the standard save when local data is broken", () => {
    const storage = installStorage();
    storage.set("grid-signal-arena-save-v1", "{broken json");
    const saveData = loadSaveData();
    expect(saveData.version).toBe(1);
    expect(saveData.folders).toHaveLength(3);
    expect(saveData.folders[0].cards).toHaveLength(30);
    expect(validateFolder(saveData.folders[0]).valid).toBe(true);
  });

  it("ships three playable folder slots from the first launch", () => {
    const saveData = defaultSaveData();
    expect(saveData.folders.map(folder => folder.id)).toEqual([
      "standard",
      "custom-1",
      "custom-2",
    ]);
    expect(saveData.folders.every(folder => validateFolder(folder).valid)).toBe(true);
  });
});

describe("再現可能な戦闘デッキ", () => {
  it("replays the same five-card hand from the same seed", () => {
    const folder = createStandardFolder("replay");
    const first = new BattleDeck(folder, 12345).drawHand();
    const second = new BattleDeck(folder, 12345).drawHand();
    expect(first.map(card => `${card.id}:${card.selectedCode}`)).toEqual(
      second.map(card => `${card.id}:${card.selectedCode}`)
    );
    expect(new Set(first.map(card => card.instanceId)).size).toBe(5);
  });

  it("moves only selected cards to used and returns the rest", () => {
    const deck = new BattleDeck(createStandardFolder("used"), 7);
    const hand = deck.drawHand();
    expect(hand).toHaveLength(5);
    expect(deck.counts()).toEqual({ remaining: 25, offered: 5, used: 0 });
    const selected = deck.commitSelection([0, 2]);
    expect(selected).toHaveLength(2);
    expect(deck.counts()).toEqual({ remaining: 28, offered: 0, used: 2 });
  });

  it("returns every offered card when the player sends zero cards", () => {
    const deck = new BattleDeck(createStandardFolder("empty"), 9);
    deck.drawHand();
    expect(deck.commitSelection([])).toHaveLength(0);
    expect(deck.counts()).toEqual({ remaining: 30, offered: 0, used: 0 });
  });
});

describe("接続コードの型", () => {
  it("materialized cards keep the chosen code and catalog metadata", () => {
    const card: Card = CARD_CATALOG.find(item => item.id === "return")!;
    expect(getAllowedCodes(card)).toEqual(["C", "*"]);
  });
});
