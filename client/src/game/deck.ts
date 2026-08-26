/** Signal Relay Tactical deck: every Japanese battle-chip card can be freely routed together, up to five cards. */
import type { Card, ConnectionCode } from "./types";
import { enrichCard } from "./data/cardCombatData";

const standardCards: Card[] = [
  { id: "rapid", name: "連射弾", code: "A", tier: "standard", family: "射撃", target: "front", power: 12, description: "同じ行へ12ダメージの弾を90ミリ秒間隔で3発撃つ" },
  { id: "lance", name: "貫通槍", code: "A", tier: "standard", family: "射撃", target: "front", power: 60, description: "同じ行を貫通する60ダメージ弾" },
  { id: "seeker", name: "直撃弾", code: "B", tier: "standard", family: "射撃", target: "front", power: 45, description: "同じ行を進み、最初の対象へ45ダメージ" },
  { id: "triplet", name: "三連砲", code: "A", tier: "standard", family: "射撃", target: "front", power: 20, description: "20ダメージの弾を160ミリ秒間隔で3発撃つ" },
  { id: "wide", name: "広角弾", code: "B", tier: "standard", family: "範囲", target: "enemy-field", power: 40, description: "上中下3行を覆う波が前進し、各敵へ40ダメージ" },
  { id: "column", name: "縦列砲", code: "C", tier: "standard", family: "範囲", target: "column", power: 55, description: "最も近い敵がいる列を予告し、縦3マスへ55ダメージ" },
  { id: "cross", name: "十字砲", code: "D", tier: "standard", family: "範囲", target: "cross", power: 40, description: "直進40ダメージと着弾地点の上下左右へ追加20ダメージ" },
  { id: "fan", name: "扇状弾", code: "B", tier: "standard", family: "範囲", target: "front", power: 30, description: "正面、斜め上、斜め下へ30ダメージ弾を1発ずつ撃つ" },
  { id: "ember", name: "炎脈弾", code: "A", tier: "standard", family: "属性", target: "front", power: 50, status: "burn", durationMs: 2200, description: "50ダメージの直進炎弾。草を燃やし、燃焼を付与" },
  { id: "fireline", name: "火炎列", code: "D", tier: "standard", family: "属性", target: "column", power: 40, status: "burn", durationMs: 900, description: "2列前の縦3マスへ40ダメージの炎柱" },
  { id: "frost", name: "凍結波", code: "B", tier: "standard", family: "属性", target: "enemy-field", power: 35, description: "縦3行を覆う35ダメージ波。空きパネルを氷へ変える" },
  { id: "icewall", name: "氷壁弾", code: "C", tier: "standard", family: "属性", target: "column", power: 40, description: "指定マスへ40ダメージの氷塊を投げ、HP70の障害物として残る" },
  { id: "volt", name: "電撃鎖", code: "C", tier: "standard", family: "属性", target: "front", power: 45, status: "stun", durationMs: 500, description: "最も近い敵を追尾し、45ダメージと500ミリ秒麻痺。近接敵へ半威力連鎖" },
  { id: "thunderline", name: "雷列", code: "D", tier: "standard", family: "属性", target: "column", power: 40, status: "stun", durationMs: 400, description: "敵がいる列へ40ダメージ。400ミリ秒麻痺" },
  { id: "root", name: "根絡み", code: "A", tier: "standard", family: "属性", target: "front", power: 45, status: "root", durationMs: 1200, description: "地面を進み、最初の敵へ45ダメージと1.2秒拘束" },
  { id: "web", name: "樹網", code: "E", tier: "standard", family: "属性", target: "enemy-field", power: 25, status: "root", durationMs: 1500, description: "指定地点を中心とする2×2範囲へ25ダメージと1.5秒拘束" },
  { id: "slash", name: "近接斬", code: "A", tier: "standard", family: "近接", target: "near", power: 80, description: "自分の直前1マスへ80ダメージ" },
  { id: "sweep", name: "横薙ぎ", code: "A", tier: "standard", family: "近接", target: "column", power: 70, description: "自分の直前列3マスへ70ダメージ" },
  { id: "dashslash", name: "突進斬", code: "B", tier: "standard", family: "近接", target: "near", power: 100, description: "最も近い敵の手前へ一時移動して100ダメージ後、安全位置へ戻る" },
  { id: "gridcut", name: "格子断", code: "C", tier: "standard", family: "近接", target: "cross", power: 50, description: "指定地点へ横斬り50、続けて縦斬り50。交点は2回命中" },
  { id: "moonblade", name: "月光剣", code: "A", tier: "standard", folderClass: "upper", family: "近接", target: "near", power: 140, description: "同じ行の前方2マスへ140ダメージ。長い準備時間" },
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
  { id: "sector", name: "区画拡張", code: "C", tier: "standard", family: "地形", target: "self", power: 0, description: "敵前列を一時的に自陣化" },
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

export const CARD_CATALOG = [...standardCards, ...megaCards].map(enrichCard);

export type SelectionRule = "name" | "code" | "wildcard" | "overload" | null;
export interface SelectionValidation {
  valid: boolean;
  rule: SelectionRule;
  reason: string;
}

export function drawHand(round: number): Card[] {
  const standardPool = standardCards.map(enrichCard);
  const megaPool = megaCards.map(enrichCard);
  const leadIndex = (round * 7 + 3) % standardPool.length;
  const lead = standardPool[leadIndex];
  const rest = standardPool.filter((card) => card.id !== lead.id);
  const hand = [
    lead,
    lead,
    rest[(round * 11 + 4) % rest.length],
    rest[(round * 17 + 9) % rest.length],
    rest[(round * 19 + 15) % rest.length],
  ];
  if (round > 0 && round % 3 === 0) hand[4] = megaPool[Math.floor(round / 3) % megaPool.length];
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
  const overloadCards = cards.filter(card => card.isOverload);
  if (overloadCards.length > 0) {
    return overloadCards.length === 1 && cards.length === 1
      ? { valid: true, rule: "overload", reason: "過負荷カードを単独で接続" }
      : {
          valid: false,
          rule: null,
          reason: "過負荷カードは他のカードと同時選択できません",
        };
  }
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
