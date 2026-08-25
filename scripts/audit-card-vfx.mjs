import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (relativePath) => readFileSync(resolve(root, relativePath), "utf8");
const unique = (values) => [...new Set(values)];
const idsFrom = (source, pattern) => unique([...source.matchAll(pattern)].map((match) => match[1]));

const deck = text("client/src/game/deck.ts");
const recipes = text("client/src/game/cardVisuals.ts");
const audioRecipes = text("client/src/game/cardAudioRecipes.ts");
const scene = text("client/src/game/scene.ts");

const cardIds = idsFrom(deck, /id: "([a-z]+)"/g);
const recipeIds = idsFrom(recipes, /^\s{2}([a-z]+): \{ label:/gm);
const audioRecipeIds = idsFrom(audioRecipes, /^\s{2}([a-z]+): \{ wave:/gm);
const signatureIds = idsFrom(scene, /case "([a-z]+)":/g);
const meleeIds = idsFrom(scene, /^\s{6}([a-z]+): \{\s*arcs:/gm);
const renderedIds = unique([...signatureIds, ...meleeIds]);
const missingRecipes = cardIds.filter((id) => !recipeIds.includes(id));
const orphanRecipes = recipeIds.filter((id) => !cardIds.includes(id));
const missingRenderers = cardIds.filter((id) => !renderedIds.includes(id));
const missingAudioRecipes = cardIds.filter((id) => !audioRecipeIds.includes(id));
const orphanAudioRecipes = audioRecipeIds.filter((id) => !cardIds.includes(id));
const duplicateCards = cardIds.filter((id, index) => cardIds.indexOf(id) !== index);

const report = [
  `カード定義: ${cardIds.length}`,
  `描画レシピ: ${recipeIds.length}`,
  `描画分岐: ${renderedIds.length}`,
  `音響レシピ: ${audioRecipeIds.length}`,
  `不足レシピ: ${missingRecipes.length ? missingRecipes.join(", ") : "なし"}`,
  `孤立レシピ: ${orphanRecipes.length ? orphanRecipes.join(", ") : "なし"}`,
  `不足描画分岐: ${missingRenderers.length ? missingRenderers.join(", ") : "なし"}`,
  `不足音響レシピ: ${missingAudioRecipes.length ? missingAudioRecipes.join(", ") : "なし"}`,
  `孤立音響レシピ: ${orphanAudioRecipes.length ? orphanAudioRecipes.join(", ") : "なし"}`,
  `重複カードID: ${duplicateCards.length ? duplicateCards.join(", ") : "なし"}`,
];
console.log(report.join("\n"));

if (cardIds.length !== 50 || recipeIds.length !== 50 || audioRecipeIds.length !== 50 || missingRecipes.length || orphanRecipes.length || missingRenderers.length || missingAudioRecipes.length || orphanAudioRecipes.length || duplicateCards.length) {
  process.exitCode = 1;
}
