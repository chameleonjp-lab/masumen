import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const profileSource = read("client/src/game/data/cardCombatData.ts");
const worldSource = read("client/src/game/GameWorld.ts");
const deckSource = read("client/src/game/deck.ts");

const requiredIds = [
  "rapid", "lance", "seeker", "triplet", "wide", "column", "cross", "fan",
  "ember", "fireline", "frost", "icewall", "volt", "thunderline", "root", "web",
  "slash", "sweep", "dashslash", "gridcut", "moonblade",
  "timer", "watchmine", "turret", "stake", "breakpillar", "block", "toxic",
  "sanctum", "crack", "rush", "sector", "gravity", "gustwall", "hole",
  "prism", "phase", "return", "substitute", "magguard", "premonition",
  "rectify", "repair", "fastsync", "stamp", "reroute",
  "meteor", "dream", "sanctuary", "overdrive",
];
const missingProfiles = requiredIds.filter(id => !profileSource.includes(id + ": {"));
const hasActionHook = id =>
  worldSource.includes('action === "' + id + '"') ||
  worldSource.includes('card.id === "' + id + '"') ||
  worldSource.includes('effectId: "' + id + '"');
const missingActions = requiredIds.filter(id => !hasActionHook(id));
const missingCards = requiredIds.filter(id => !deckSource.includes('id: "' + id + '"'));
const incomplete = requiredIds.filter(id => {
  const start = profileSource.indexOf(id + ": {");
  const end = profileSource.indexOf("}", start);
  const block = start >= 0 && end >= 0 ? profileSource.slice(start, end) : "";
  return !block.includes("powerPerHit") || !block.includes("rangePreviewId");
});

console.log("PR7〜PR9対象カード: " + requiredIds.length);
console.log("不足定義: " + (missingProfiles.length ? missingProfiles.join(", ") : "なし"));
console.log("不足処理: " + (missingActions.length ? missingActions.join(", ") : "なし"));
console.log("不足デッキ登録: " + (missingCards.length ? missingCards.join(", ") : "なし"));
console.log("不完全な攻撃データ: " + (incomplete.length ? incomplete.join(", ") : "なし"));

if (missingProfiles.length || missingActions.length || missingCards.length || incomplete.length)
  process.exitCode = 1;
