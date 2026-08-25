import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const deck = read("client/src/game/deck.ts");
const codes = read("client/src/game/data/cardCodes.ts");
const folder = read("client/src/game/folder.ts");
const world = read("client/src/game/GameWorld.ts");

const cardIds = [...deck.matchAll(/id: "([a-z]+)"/g)].map(match => match[1]);
const uniqueCardIds = new Set(cardIds);
const standardSection = folder.match(
  /const STANDARD_FOLDER_CARD_IDS = \[(.*?)\] as const/s
);
const standardIds = standardSection
  ? [...standardSection[1].matchAll(/"([a-z]+)"/g)].map(match => match[1])
  : [];
const codeIds = [...codes.matchAll(/^\s{2}([a-z]+): \[/gm)].map(match => match[1]);
const missingStandardCards = standardIds.filter(id => !uniqueCardIds.has(id));
const missingCodeEntries = cardIds.filter(id => !codeIds.includes(id));
const requiredHooks = [
  "SaveDataV1",
  "createStandardFolder",
  "validateFolder",
  "BattleDeck",
  "commitSelection",
  "returnOffered",
  "loadSaveData",
];
const missingHooks = requiredHooks.filter(hook => !folder.includes(hook));

console.log(`カードカタログ: ${cardIds.length}枚 / 一意${uniqueCardIds.size}枚`);
console.log(`標準フォルダ: ${standardIds.length}枚`);
console.log(`接続コード定義: ${codeIds.length}件`);
console.log(`フォルダ処理: ${missingHooks.length ? "不足あり" : "接続済み"}`);
console.log(`不足する標準カード: ${missingStandardCards.length ? missingStandardCards.join(", ") : "なし"}`);
console.log(`不足する接続コード: ${missingCodeEntries.length ? missingCodeEntries.join(", ") : "なし"}`);
console.log(`共通コード*: ${codes.includes('"*"') ? "定義済み" : "不足"}`);
console.log(`GameWorld接続: ${world.includes("battleDeck.commitSelection") ? "接続済み" : "不足"}`);

if (
  cardIds.length !== 50 ||
  uniqueCardIds.size !== 50 ||
  standardIds.length !== 30 ||
  missingStandardCards.length ||
  missingCodeEntries.length ||
  missingHooks.length ||
  !codes.includes('"*"') ||
  !world.includes("battleDeck.commitSelection")
) {
  process.exitCode = 1;
}
