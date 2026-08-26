import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const chainSource = read("client/src/game/data/chainTechniques.ts");
const worldSource = read("client/src/game/GameWorld.ts");

const requiredChains = [
  ["rapid-barrage", "連鎖掃射"],
  ["triple-moon", "三重月断"],
  ["fire-requiem", "火界連鎖"],
  ["tree-prison", "樹牢陣"],
  ["ground-collapse", "地盤崩壊"],
  ["magnetic-encircle", "雷磁包囲"],
  ["layered-defense", "多層防衛"],
  ["full-repair", "完全修復"],
];

const missingDefinitions = requiredChains
  .filter(([id, name]) =>
    !chainSource.includes(`id: "${id}"`) ||
    !chainSource.includes(`name: "${name}"`)
  )
  .map(([id]) => id);
const missingSequences = requiredChains
  .filter(([id]) => !chainSource.includes(`id: "${id}"`) || !chainSource.includes("cardIds: ["))
  .map(([id]) => id);
const missingDispatch = requiredChains
  .filter(([id]) => !worldSource.includes(`technique.id === "${id}"`))
  .map(([id]) => id);
const hasSelectionConversion =
  worldSource.includes("findChainTechnique(orderedCards)") &&
  worldSource.includes("createChainCard(chainTechnique, orderedCards)");
const hasUsageRecord = worldSource.includes("usedChainTechniques.push(technique.id)");
const hasVisualSources = worldSource.includes("card.chainCardIds ?? [card.id]");

console.log("連結技定義: " + requiredChains.length);
console.log("不足する定義: " + (missingDefinitions.length ? missingDefinitions.join(", ") : "なし"));
console.log("不足する変換処理: " + (!hasSelectionConversion ? "選択変換" : "なし"));
console.log("不足する個別処理: " + (missingDispatch.length ? missingDispatch.join(", ") : "なし"));
console.log("不足する使用記録: " + (!hasUsageRecord ? "使用記録" : "なし"));
console.log("不足する構成カード演出参照: " + (!hasVisualSources ? "構成カード演出" : "なし"));

if (
  missingDefinitions.length ||
  missingSequences.length ||
  missingDispatch.length ||
  !hasSelectionConversion ||
  !hasUsageRecord ||
  !hasVisualSources
)
  process.exitCode = 1;
