/** Signal Relay Tactical: audited, per-card visual signatures. */

export const CARD_VFX_IDS = [
  "rapid", "lance", "seeker", "triplet", "wide", "column", "cross", "fan",
  "ember", "fireline", "frost", "icewall", "volt", "thunderline", "root", "web",
  "slash", "sweep", "dashslash", "gridcut", "moonblade", "timer", "watchmine", "turret",
  "stake", "breakpillar", "block", "toxic", "sanctum", "crack", "rush", "sector",
  "gravity", "gustwall", "hole", "prism", "phase", "return", "substitute", "magguard",
  "premonition", "rectify", "repair", "fastsync", "stamp", "reroute", "meteor", "dream",
  "sanctuary", "overdrive",
] as const;

export type CardVfxId = typeof CARD_VFX_IDS[number];

export interface CardVfxRecipe {
  label: string;
  accent: string;
  secondary: string;
}

export const CARD_VFX_RECIPES: Record<CardVfxId, CardVfxRecipe> = {
  rapid: { label: "三連小弾", accent: "#54F5FF", secondary: "#DDFBF4" },
  lance: { label: "貫通槍線", accent: "#2AD4D9", secondary: "#A8F7FF" },
  seeker: { label: "照準収束球", accent: "#82F5F3", secondary: "#F2FFFF" },
  triplet: { label: "三段砲火", accent: "#4BE9F1", secondary: "#C9FFFF" },
  wide: { label: "三叉分岐", accent: "#4EE8EC", secondary: "#DCFDFD" },
  column: { label: "落下砲弾", accent: "#60E5E8", secondary: "#D5FCFC" },
  cross: { label: "十字衝撃核", accent: "#63E8ED", secondary: "#F0FFFF" },
  fan: { label: "扇状ディスク", accent: "#47DADF", secondary: "#C7FAFA" },
  ember: { label: "炎脈火球", accent: "#FF6B43", secondary: "#FFC45C" },
  fireline: { label: "火炎列柱", accent: "#FF633E", secondary: "#FFB24C" },
  frost: { label: "凍結氷波", accent: "#70DFF8", secondary: "#E1FAFF" },
  icewall: { label: "氷壁片", accent: "#89E6FF", secondary: "#DEF9FF" },
  volt: { label: "電撃鎖", accent: "#BA8CFF", secondary: "#F0DCFF" },
  thunderline: { label: "雷列落雷", accent: "#A97BFF", secondary: "#E8D5FF" },
  root: { label: "根の二重輪", accent: "#55D0A0", secondary: "#C3FFD8" },
  web: { label: "樹網格子", accent: "#45C5A0", secondary: "#B4F2C9" },
  slash: { label: "短距離二重斬", accent: "#FFF1CD", secondary: "#FF925C" },
  sweep: { label: "横薙ぎ一閃", accent: "#FFE2A0", secondary: "#FF8658" },
  dashslash: { label: "突進三連斬", accent: "#FFF5D8", secondary: "#FF6B48" },
  gridcut: { label: "格子切断線", accent: "#F5E4FF", secondary: "#C98AFF" },
  moonblade: { label: "月光弧", accent: "#F7F0C2", secondary: "#AEC6FF" },
  timer: { label: "時限地雷", accent: "#FF7B42", secondary: "#FFE27A" },
  watchmine: { label: "巡回地雷", accent: "#F49D43", secondary: "#FFE57D" },
  turret: { label: "砲台ポッド", accent: "#F2B24B", secondary: "#FFF0AE" },
  stake: { label: "拘束杭", accent: "#D89A45", secondary: "#FFF1B5" },
  breakpillar: { label: "破砕落柱", accent: "#FF8A4B", secondary: "#FFD36A" },
  block: { label: "遮断キューブ", accent: "#F1C878", secondary: "#FFF6D2" },
  toxic: { label: "毒霧オーブ", accent: "#A6C94D", secondary: "#E2F18A" },
  sanctum: { label: "聖域セル", accent: "#D9FFF2", secondary: "#7DEACB" },
  crack: { label: "地面亀裂", accent: "#DE9650", secondary: "#FFCE74" },
  rush: { label: "強襲転送", accent: "#FFB36A", secondary: "#62E9EC" },
  sector: { label: "区画枠", accent: "#8DEDD7", secondary: "#E6FFF7" },
  gravity: { label: "引力収束輪", accent: "#B58CFF", secondary: "#EBDFFF" },
  gustwall: { label: "乱流壁", accent: "#77D9BF", secondary: "#D5FFF2" },
  hole: { label: "逆位相穴", accent: "#795CF2", secondary: "#C4B6FF" },
  prism: { label: "プリズム片", accent: "#A9FFF0", secondary: "#FFFFFF" },
  phase: { label: "位相残像", accent: "#81DFF5", secondary: "#E5FBFF" },
  return: { label: "返し手裏剣", accent: "#FF7C56", secondary: "#FFE4B1" },
  substitute: { label: "身代わり膜", accent: "#C6FDF4", secondary: "#F8FFFF" },
  magguard: { label: "電磁格子", accent: "#A580FF", secondary: "#E6D9FF" },
  premonition: { label: "予知照準眼", accent: "#FF9B63", secondary: "#FFE9C5" },
  rectify: { label: "整流滴", accent: "#80F3CD", secondary: "#F0FFF8" },
  repair: { label: "補修十字", accent: "#9BF6D7", secondary: "#FFFFFF" },
  fastsync: { label: "高速同期環", accent: "#65F1D3", secondary: "#D8FFF7" },
  stamp: { label: "出力印", accent: "#FFAD5B", secondary: "#FFEAB5" },
  reroute: { label: "再送回路", accent: "#6EE5DD", secondary: "#E1FFFC" },
  meteor: { label: "流星落下", accent: "#FF9265", secondary: "#F4D3FF" },
  dream: { label: "夢幻多層ドーム", accent: "#C188FF", secondary: "#F1E5FF" },
  sanctuary: { label: "大聖域光柱", accent: "#F8FFF0", secondary: "#D6FFE9" },
  overdrive: { label: "超過十字炉", accent: "#CE91FF", secondary: "#FFF0B5" },
};

export function getCardVfxRecipe(id: string): CardVfxRecipe | undefined {
  return CARD_VFX_RECIPES[id as CardVfxId];
}

export function missingCardVfxIds(cardIds: string[]): string[] {
  return cardIds.filter((id) => !(id in CARD_VFX_RECIPES));
}
