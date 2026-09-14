import { beforeEach, describe, expect, it } from "vitest";
import { CARD_CATALOG } from "./deck";
import { getAllowedCodes } from "./data/cardCodes";
import {
  BattleDeck,
  createStandardFolder,
  defaultSaveData,
  folderHandSignature,
  HAND_SIZE,
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
  it("replays the same ten-card hand from the same seed", () => {
    const folder = createStandardFolder("replay");
    const first = new BattleDeck(folder, 12345).drawHand();
    const second = new BattleDeck(folder, 12345).drawHand();
    expect(first.map(card => `${card.id}:${card.selectedCode}`)).toEqual(
      second.map(card => `${card.id}:${card.selectedCode}`)
    );
    expect(first).toHaveLength(HAND_SIZE);
    expect(new Set(first.map(card => card.instanceId)).size).toBe(HAND_SIZE);
  });

  it("does not repeat a physical hand while the Wave is being offered", () => {
    const folder = createStandardFolder("variation");
    const deck = new BattleDeck(folder, 12345);
    const hands = Array.from({ length: 3 }, () => deck.drawHand());
    const signatures = hands.map(hand => folderHandSignature(hand));

    expect(hands.slice(0, 2).every(hand => hand.length === HAND_SIZE)).toBe(true);
    expect(
      hands.every(
        hand => new Set(hand.map(card => card.instanceId)).size === hand.length
      )
    ).toBe(true);
    expect(new Set(signatures).size).toBe(hands.length);
    const shownIds = hands.flatMap(hand => hand.map(card => card.id));
    expect(new Set(shownIds).size).toBe(shownIds.length);

    const finalHand = deck.drawHand();
    expect(finalHand.length).toBeLessThanOrEqual(HAND_SIZE);
    expect(finalHand.every(card => !shownIds.includes(card.id))).toBe(true);
  });

  it("keeps hand variation deterministic for a seeded run", () => {
    const folder = createStandardFolder("variation-replay");
    const drawSequence = () => {
      const deck = new BattleDeck(folder, 90210);
      return Array.from({ length: 6 }, () =>
        folderHandSignature(deck.drawHand())
      );
    };

    expect(drawSequence()).toEqual(drawSequence());
  });

  it("resets the presented catalog for each Wave", () => {
    const deck = new BattleDeck(createStandardFolder("wave-reset"), 90210, {
      pool: CARD_CATALOG,
    });
    const firstWave = deck.drawHand();
    deck.resetWave(90210);
    const secondWave = deck.drawHand();

    expect(firstWave).toHaveLength(HAND_SIZE);
    expect(secondWave).toHaveLength(HAND_SIZE);
    expect(secondWave.map(card => card.id)).toEqual(firstWave.map(card => card.id));
  });

  it("draws ten unique catalog cards without repeating an ID in the run", () => {
    const deck = new BattleDeck(createStandardFolder("catalog"), 314159, {
      pool: CARD_CATALOG,
    });
    const hands = Array.from({ length: 4 }, () => deck.drawHand());
    const ids = hands.flatMap(hand => hand.map(card => card.id));

    expect(hands.every(hand => hand.length === HAND_SIZE)).toBe(true);
    expect(hands.every(hand => new Set(hand.map(card => card.id)).size === HAND_SIZE)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("moves only selected cards to used and returns the rest", () => {
    const deck = new BattleDeck(createStandardFolder("used"), 7);
    const hand = deck.drawHand();
    expect(hand).toHaveLength(HAND_SIZE);
    expect(deck.counts()).toEqual({ remaining: 20, offered: HAND_SIZE, used: 0 });
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
