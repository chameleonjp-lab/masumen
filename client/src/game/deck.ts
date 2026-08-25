/** Signal Relay Tactical deck: every Japanese battle-chip card can be freely routed together, up to five cards. */
import type { Card, ConnectionCode } from "./types";

const standardCards: Card[] = [
  { id: "rapid", name: "連射弾", code: "A", tier: "standard", family: "射撃", target: "front", power: 30, description: "3連射の基本弾" },
  { id: "lance", name: "貫通槍", code: "A", tier: "standard", family: "射撃", target: "front", power: 58, description: "高出力の直線射撃" },
  { id: "seeker", name: "直撃弾", code: "B", tier: "standard", family: "射撃", target: "front", power: 42, description: "正面マスを直進する" },
  { id: "triplet", name: "三連砲", code: "B", tier: "standard", family: "射撃", target: "front", power: 45, description: "低出力3ヒット" },
  { id: "wide", name: "広角弾", code: "C", tier: "standard", family: "範囲", target: "row", power: 36, description: "プレイヤー行をまとめて攻撃" },
  { id: "column", name: "縦列砲", code: "C", tier: "standard", family: "範囲", target: "column", power: 44, description: "前方列をまとめて攻撃" },
  { id: "cross", name: "十字砲", code: "D", tier: "standard", family: "範囲", target: "cross", power: 38, description: "十字方向に攻撃" },
  { id: "fan", name: "扇状弾", code: "D", tier: "standard", family: "範囲", target: "cross", power: 30, description: "広がる低出力射撃" },
  { id: "ember", name: "炎脈弾", code: "A", tier: "standard", family: "属性", target: "front", power: 36, status: "burn", durationMs: 2200, description: "燃焼を付与する直線弾" },
  { id: "fireline", name: "火炎列", code: "B", tier: "standard", family: "属性", target: "row", power: 32, status: "burn", durationMs: 1900, description: "横列へ燃焼攻撃" },
  { id: "frost", name: "凍結波", code: "C", tier: "standard", family: "属性", target: "row", power: 30, status: "slow", durationMs: 2300, description: "横列を減速させる" },
  { id: "icewall", name: "氷壁弾", code: "C", tier: "standard", family: "属性", target: "column", power: 34, status: "slow", durationMs: 2300, description: "縦列を減速させる" },
  { id: "volt", name: "電撃鎖", code: "D", tier: "standard", family: "属性", target: "front", power: 40, status: "stun", durationMs: 620, description: "麻痺を付与する" },
  { id: "thunderline", name: "雷列", code: "D", tier: "standard", family: "属性", target: "column", power: 34, status: "stun", durationMs: 520, description: "縦列を麻痺させる" },
  { id: "root", name: "根絡み", code: "E", tier: "standard", family: "属性", target: "front", power: 28, status: "root", durationMs: 2200, description: "敵の移動を拘束" },
  { id: "web", name: "樹網", code: "E", tier: "standard", family: "属性", target: "enemy-field", power: 18, status: "root", durationMs: 1500, description: "敵領域を短く拘束" },
  { id: "slash", name: "近接斬", code: "A", tier: "standard", family: "近接", target: "near", power: 64, description: "目の前横一列を切り払う" },
  { id: "sweep", name: "横薙ぎ", code: "A", tier: "standard", family: "近接", target: "row", power: 48, description: "行に沿って切り払う" },
  { id: "dashslash", name: "突進斬", code: "B", tier: "standard", family: "近接", target: "near", power: 78, description: "目の前横一列へ踏み込む一閃" },
  { id: "gridcut", name: "格子断", code: "B", tier: "standard", family: "近接", target: "cross", power: 45, description: "十字方向を切り裂く" },
  { id: "moonblade", name: "月光剣", code: "C", tier: "standard", family: "近接", target: "near", power: 86, description: "目の前横一列へ重い月光斬" },
  { id: "timer", name: "時限地雷", code: "A", tier: "standard", family: "設置", target: "cross", power: 52, status: "burn", durationMs: 1500, description: "十字範囲へ時限爆発" },
  { id: "watchmine", name: "監視地雷", code: "A", tier: "standard", family: "設置", target: "enemy-field", power: 34, status: "burn", durationMs: 1800, description: "敵領域へ燃焼地雷" },
  { id: "turret", name: "砲台ポッド", code: "B", tier: "standard", family: "設置", target: "column", power: 52, description: "前方列へ追撃する" },
  { id: "stake", name: "拘束杭", code: "C", tier: "standard", family: "設置", target: "front", power: 28, status: "root", durationMs: 2600, description: "敵を長く拘束する杭" },
  { id: "breakpillar", name: "破砕柱", code: "C", tier: "standard", family: "設置", target: "column", power: 62, status: "stun", durationMs: 420, description: "縦列に強い衝撃波" },
  { id: "block", name: "遮断キューブ", code: "D", tier: "standard", family: "設置", target: "self", power: 0, status: "barrier", effectValue: 48, description: "使い捨て障壁を生成" },
  { id: "toxic", name: "毒霧装置", code: "D", tier: "standard", family: "設置", target: "enemy-field", power: 12, status: "burn", durationMs: 2800, description: "敵全体へ短い燃焼" },
  { id: "sanctum", name: "聖域セル", code: "A", tier: "standard", family: "地形", target: "self", power: 0, status: "recover", effectValue: 24, description: "小回復と障壁を得る" },
  { id: "crack", name: "亀裂線", code: "B", tier: "standard", family: "地形", target: "row", power: 34, status: "slow", durationMs: 2400, description: "横列の攻撃を遅らせる" },
  { id: "rush", name: "強襲転送", code: "B", tier: "standard", family: "地形", target: "self", power: 0, status: "invincible", durationMs: 5000, description: "5秒間の無敵を得る" },
  { id: "sector", name: "区画拡張", code: "C", tier: "standard", family: "地形", target: "self", power: 0, status: "gauge", effectValue: 42, description: "回復しカスタムを加速" },
  { id: "gravity", name: "引力場", code: "C", tier: "standard", family: "地形", target: "cross", power: 22, status: "slow", durationMs: 2600, description: "十字対象を減速" },
  { id: "gustwall", name: "乱流壁", code: "D", tier: "standard", family: "地形", target: "row", power: 25, status: "root", durationMs: 1800, description: "行への接近を拘束" },
  { id: "hole", name: "逆位相穴", code: "E", tier: "standard", family: "地形", target: "enemy-field", power: 16, status: "slow", durationMs: 2900, description: "敵全体を減速" },
  { id: "prism", name: "プリズムガード", code: "A", tier: "standard", family: "防御", target: "self", power: 0, status: "barrier", effectValue: 72, description: "中量の障壁を得る" },
  { id: "phase", name: "位相迷彩", code: "B", tier: "standard", family: "防御", target: "self", power: 0, status: "invincible", durationMs: 5000, description: "5秒間の無敵を得る" },
  { id: "return", name: "返し手裏剣", code: "C", tier: "standard", family: "反撃", target: "self", power: 0, status: "counter", effectValue: 58, description: "次の被弾時に反撃する" },
  { id: "substitute", name: "身代わり膜", code: "D", tier: "standard", family: "防御", target: "self", power: 0, status: "barrier", effectValue: 105, description: "大きな一回限りの障壁" },
  { id: "magguard", name: "電磁防壁", code: "E", tier: "standard", family: "防御", target: "self", power: 0, status: "barrier", effectValue: 56, description: "障壁と近い敵への麻痺" },
  { id: "premonition", name: "予知反撃", code: "E", tier: "standard", family: "反撃", target: "self", power: 0, status: "counter", effectValue: 76, description: "次の予兆へ反撃準備" },
  { id: "rectify", name: "整流回復", code: "A", tier: "standard", family: "回復", target: "self", power: 0, status: "recover", effectValue: 38, description: "小回復を行う" },
  { id: "repair", name: "応急修復", code: "B", tier: "standard", family: "回復", target: "self", power: 0, status: "recover", effectValue: 68, description: "中回復を行う" },
  { id: "fastsync", name: "速攻同期", code: "C", tier: "standard", family: "補助", target: "self", power: 0, status: "gauge", effectValue: 65, description: "カスタムを即時加速" },
  { id: "stamp", name: "出力印", code: "D", tier: "standard", family: "補助", target: "self", power: 0, status: "boost", effectValue: 150, description: "次カードの出力を強化" },
  { id: "reroute", name: "再送回路", code: "E", tier: "standard", family: "補助", target: "self", power: 0, status: "gauge", effectValue: 32, description: "次の手札への到達を早める" },
];

const megaCards: Card[] = [
  { id: "meteor", name: "流星群", code: "R", tier: "mega", family: "高出力", target: "enemy-field", power: 96, status: "burn", durationMs: 1800, description: "全敵へ多段の流星攻撃" },
  { id: "dream", name: "夢幻障壁", code: "S", tier: "mega", family: "高出力", target: "self", power: 0, status: "barrier", effectValue: 180, description: "大障壁と5秒間の無敵" },
  { id: "sanctuary", name: "聖域展開", code: "H", tier: "mega", family: "高出力", target: "self", power: 0, status: "recover", effectValue: 110, description: "大回復と安全地帯" },
  { id: "overdrive", name: "超過駆動", code: "O", tier: "mega", family: "高出力", target: "cross", power: 132, status: "stun", durationMs: 850, description: "高出力＋麻痺の切り札" },
];

export const CARD_CATALOG = [...standardCards, ...megaCards];

export type SelectionRule = "name" | "code" | "wildcard" | null;
export interface SelectionValidation {
  valid: boolean;
  rule: SelectionRule;
  reason: string;
}

export function drawHand(round: number): Card[] {
  const leadIndex = (round * 7 + 3) % standardCards.length;
  const lead = standardCards[leadIndex];
  const rest = standardCards.filter((card) => card.id !== lead.id);
  const hand = [
    lead,
    lead,
    rest[(round * 11 + 4) % rest.length],
    rest[(round * 17 + 9) % rest.length],
    rest[(round * 19 + 15) % rest.length],
  ];
  if (round > 0 && round % 3 === 0) hand[4] = megaCards[Math.floor(round / 3) % megaCards.length];
  return hand;
}

export function canAppendSelection(hand: Card[], selected: number[], candidate: number): boolean {
  if (!hand[candidate] || selected.includes(candidate)) return false;
  return validateSelection(hand, [...selected, candidate]).valid;
}

export function validateSelection(
  hand: readonly Card[],
  selected: readonly number[]
): SelectionValidation {
  if (selected.length === 0)
    return { valid: true, rule: null, reason: "カードを選ばず戦闘へ戻れます" };
  if (selected.length > 5)
    return { valid: false, rule: null, reason: "選択できるカードは最大5枚です" };
  if (new Set(selected).size !== selected.length)
    return { valid: false, rule: null, reason: "同じ手札を重ねて選べません" };

  const cards = selected.map(index => hand[index]);
  if (cards.some(card => !card))
    return { valid: false, rule: null, reason: "存在しないカードが選ばれています" };
  const names = new Set(cards.map(card => card.name));
  const codes = cards.map(card => card.selectedCode ?? card.code);
  const uniqueCodes = new Set(codes);
  if (names.size === 1)
    return { valid: true, rule: "name", reason: "同名カードで接続" };
  if (codes.every(code => code === "*"))
    return { valid: true, rule: "wildcard", reason: "共通コード*で接続" };
  if (uniqueCodes.size === 1)
    return { valid: true, rule: "code", reason: `接続コード${codes[0]}で接続` };

  const normalCodes = new Set(
    codes.filter((code): code is ConnectionCode => code !== "*")
  );
  if (
    normalCodes.size === 0 ||
    (normalCodes.size === 1 &&
      codes.every(code => code === "*" || code === Array.from(normalCodes)[0]))
  )
    return { valid: true, rule: "wildcard", reason: "共通コードで接続" };

  return {
    valid: false,
    rule: null,
    reason: "同名、同じ接続コード、または共通コード*でそろえてください",
  };
}
