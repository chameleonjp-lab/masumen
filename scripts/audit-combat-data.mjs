import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const idsFrom = source =>
  [...source.matchAll(/id: "([a-z]+)"/g)].map(match => match[1]);
const deck = read("client/src/game/deck.ts");
const visual = read("client/src/game/cardVisuals.ts");
const audio = read("client/src/game/cardAudioRecipes.ts");
const world = read("client/src/game/GameWorld.ts");

const cardIds = idsFrom(deck);
const uniqueIds = new Set(cardIds);
const vfxIds = new Set(
  [...visual.matchAll(/^\s{2}([a-z]+): \{ label:/gm)].map(match => match[1])
);
const audioIds = new Set(
  [...audio.matchAll(/^\s{2}([a-z]+): \{ wave:/gm)].map(match => match[1])
);
const missingVfx = cardIds.filter(id => !vfxIds.has(id));
const missingAudio = cardIds.filter(id => !audioIds.has(id));
const report = [
  `カード定義: ${cardIds.length}`,
  `一意なカードID: ${uniqueIds.size}`,
  `描写レシピ: ${vfxIds.size}`,
  `音響レシピ: ${audioIds.size}`,
  `不足描写: ${missingVfx.length ? missingVfx.join(", ") : "なし"}`,
  `不足音響: ${missingAudio.length ? missingAudio.join(", ") : "なし"}`,
  `戦闘時計の直接参照: ${world.includes("performance.now()") ? "あり" : "なし"}`,
];
console.log(report.join("\n"));

if (
  cardIds.length !== 50 ||
  uniqueIds.size !== 50 ||
  missingVfx.length ||
  missingAudio.length ||
  world.includes("performance.now()")
) {
  process.exitCode = 1;
}
