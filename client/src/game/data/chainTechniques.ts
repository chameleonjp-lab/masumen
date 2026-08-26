import type { Card, ConnectionCode, TargetShape } from "../types";

export interface ChainTechnique {
  id: string;
  name: string;
  cardIds: readonly string[];
  requiredCodes: readonly (ConnectionCode | null)[];
  target: TargetShape;
  description: string;
}

export const CHAIN_TECHNIQUES: readonly ChainTechnique[] = [
  {
    id: "rapid-barrage",
    name: "連鎖掃射",
    cardIds: ["rapid", "rapid", "rapid"],
    requiredCodes: [null, null, null],
    target: "front",
    description: "連射弾3枚を15ダメージの12発連射へ変換",
  },
  {
    id: "triple-moon",
    name: "三重月断",
    cardIds: ["slash", "sweep", "moonblade"],
    requiredCodes: ["A", "A", "A"],
    target: "front",
    description: "近接斬、横薙ぎ、月光剣の三段踏み込み斬り",
  },
  {
    id: "fire-requiem",
    name: "火界連鎖",
    cardIds: ["ember", "fireline", "timer"],
    requiredCodes: ["F", "F", "F"],
    target: "enemy-field",
    description: "炎弾、縦炎、全体爆発を順番に発生",
  },
  {
    id: "tree-prison",
    name: "樹牢陣",
    cardIds: ["root", "web", "stake"],
    requiredCodes: ["E", "E", "E"],
    target: "enemy-field",
    description: "全敵を2秒拘束後、120木属性ダメージ",
  },
  {
    id: "ground-collapse",
    name: "地盤崩壊",
    cardIds: ["crack", "breakpillar", "hole"],
    requiredCodes: ["F", "F", "F"],
    target: "enemy-field",
    description: "敵陣全体を亀裂化し、空きマスを穴へ変える",
  },
  {
    id: "magnetic-encircle",
    name: "雷磁包囲",
    cardIds: ["volt", "thunderline", "magguard"],
    requiredCodes: ["D", "D", "*"],
    target: "enemy-field",
    description: "全敵へ60電気ダメージと1秒麻痺、自分へ60障壁",
  },
  {
    id: "layered-defense",
    name: "多層防衛",
    cardIds: ["block", "prism", "substitute"],
    requiredCodes: ["E", "E", "*"],
    target: "self",
    description: "キューブ、150障壁、身代わりを同時展開",
  },
  {
    id: "full-repair",
    name: "完全修復",
    cardIds: ["rectify", "repair", "sanctum"],
    requiredCodes: ["*", "*", "A"],
    target: "self",
    description: "HP180回復、状態異常解除、自陣を6秒聖域化",
  },
];

function selectedCode(card: Card): string {
  return card.selectedCode ?? card.code;
}

export function findChainTechnique(
  cards: readonly Card[]
): ChainTechnique | undefined {
  return CHAIN_TECHNIQUES.find(technique => {
    if (cards.length !== technique.cardIds.length) return false;
    return technique.cardIds.every(
      (cardId, index) =>
        cards[index]?.id === cardId &&
        (technique.requiredCodes[index] === null ||
          selectedCode(cards[index] as Card) === technique.requiredCodes[index])
    );
  });
}

export function createChainCard(
  technique: ChainTechnique,
  cards: readonly Card[]
): Card {
  const code =
    (cards[0]?.selectedCode ?? cards[0]?.code ?? "*") as ConnectionCode;
  return {
    id: `chain-${technique.id}`,
    name: technique.name,
    code,
    selectedCode: code,
    tier: "mega",
    family: "高出力",
    target: technique.target,
    power: 1,
    description: technique.description,
    properties: ["補助"],
    actionId: `chain:${technique.id}`,
    chainTechniqueId: technique.id,
    chainCardIds: [...technique.cardIds],
    rangePreviewId: `chain-${technique.id}`,
    vfxId: cards[0]?.vfxId ?? cards[0]?.id,
    audioId: cards[0]?.audioId ?? cards[0]?.id,
  };
}
