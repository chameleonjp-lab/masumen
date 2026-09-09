import { getCardCombatProfile } from "./data/cardCombatData";
import { getCardVfxRecipe } from "./cardVisuals";
import type { AttackProperty, Card, CardElement, TargetShape } from "./types";

/** User-facing labels for the card/weapon selection screen. */
export interface CardPresentation {
  glyph: string;
  signatureLabel: string;
  roleLabel: string;
  propertyLabel: string;
  targetLabel: string;
  impactLabel: string;
  hitLabel: string | null;
  statusLabel: string | null;
  durationLabel: string | null;
  summary: string;
  accent: string;
  secondary: string;
}

const TARGET_LABELS: Record<TargetShape, string> = {
  front: "正面の直線",
  near: "近くの1マス",
  row: "横一列",
  column: "縦一列",
  cross: "十字範囲",
  "enemy-field": "敵陣全体",
  self: "自分の周囲",
};

const ELEMENT_LABELS: Record<CardElement, string | null> = {
  none: null,
  fire: "炎",
  water: "水",
  electric: "電気",
  wood: "木",
};

const STATUS_LABELS: Record<string, string> = {
  burn: "燃焼",
  stun: "麻痺",
  root: "拘束",
  slow: "減速",
  barrier: "障壁",
  invincible: "無敵",
  recover: "回復",
  boost: "強化",
  gauge: "ゲージ加速",
  counter: "反撃",
};

const PROPERTY_GLYPHS: Partial<Record<AttackProperty, string>> = {
  回復: "＋",
  剣: "⚔",
  罠: "⌂",
  地形: "▦",
  補助: "◇",
  破砕: "✣",
  風: "≋",
  射撃: "➤",
};

const DEFAULT_ACCENT = "#54F5FF";
const DEFAULT_SECONDARY = "#DDFBF4";

function formatSeconds(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}秒`;
}

function readableDescription(description: string): string {
  const normalized = description
    .replace(/(\d+(?:\.\d+)?)\s*ミリ秒/g, (_, value: string) =>
      formatSeconds(Number(value))
    )
    .replace(/\bHP(?=\d)/g, "耐久")
    .trim();
  return /[。！？]$/.test(normalized) ? normalized : `${normalized}。`;
}

function cardGlyph(card: Card, properties: readonly AttackProperty[]): string {
  for (const property of properties) {
    const glyph = PROPERTY_GLYPHS[property];
    if (glyph) return glyph;
  }
  if (card.family === "高出力") return "✦";
  if (card.family === "範囲") return "✣";
  if (card.family === "防御" || card.family === "反撃") return "◇";
  return "◆";
}

function impactLabel(card: Card): string {
  if (card.power > 0) return `威力 ${card.power}`;
  if (card.status === "recover" && card.effectValue)
    return `回復 ${card.effectValue}`;
  if (card.status === "barrier" && card.effectValue)
    return `障壁 ${card.effectValue}`;
  if (card.effectValue) return `効果 ${card.effectValue}`;
  return "補助効果";
}

export function cardTargetLabel(card: Card | undefined): string {
  if (!card) return "対象範囲";
  return card.rangeLabel ?? TARGET_LABELS[card.target] ?? "対象範囲";
}

export function cardPresentation(card: Card | undefined): CardPresentation {
  if (!card) {
    return {
      glyph: "◆",
      signatureLabel: "カードを選択",
      roleLabel: "カード",
      propertyLabel: "効果を表示",
      targetLabel: "対象範囲",
      impactLabel: "補助効果",
      hitLabel: null,
      statusLabel: null,
      durationLabel: null,
      summary: "カードを選ぶと、作用範囲と効果を確認できます。",
      accent: DEFAULT_ACCENT,
      secondary: DEFAULT_SECONDARY,
    };
  }

  const profile = getCardCombatProfile(card.id);
  const properties = card.properties?.length
    ? card.properties
    : profile.properties;
  const recipe = getCardVfxRecipe(card.id);
  const elementLabel = ELEMENT_LABELS[card.element ?? profile.element];
  const hitCount = card.hitCount ?? profile.hitCount;
  const propertyLabel =
    properties.length > 0 ? properties.join("・") : card.family;

  return {
    glyph: cardGlyph(card, properties),
    signatureLabel: recipe?.label ?? card.family,
    roleLabel: card.family,
    propertyLabel: elementLabel
      ? `${elementLabel} / ${propertyLabel}`
      : propertyLabel,
    targetLabel: cardTargetLabel(card),
    impactLabel: impactLabel(card),
    hitLabel: hitCount > 1 ? `${hitCount}回作用` : null,
    statusLabel: card.status
      ? (STATUS_LABELS[card.status] ?? card.status)
      : null,
    durationLabel: card.durationMs
      ? `時間 ${formatSeconds(card.durationMs)}`
      : null,
    summary: readableDescription(card.description),
    accent: recipe?.accent ?? DEFAULT_ACCENT,
    secondary: recipe?.secondary ?? DEFAULT_SECONDARY,
  };
}
