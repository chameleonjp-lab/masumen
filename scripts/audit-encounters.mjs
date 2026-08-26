import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const world = read("client/src/game/GameWorld.ts");
const enemyData = read("client/src/game/data/enemies.ts");

const expectedEnemies = [
  ["bulwark", "BULWARK-3", ["bulwark-lane-cannon", "bulwark-shield-bash"]],
  ["scanner", "SCANNER-8", ["scanner-column-scan", "scanner-signal-lock"]],
  ["razor", "RAZOR-6", ["razor-dash-cut", "razor-cross-slash"]],
  ["mortar", "MORTAR-NODE", ["mortar-shell", "mortar-triple-shell", "mortar-mine-drop"]],
  ["sentinel", "VOLT-SENTINEL", ["sentinel-alternating-pulse", "sentinel-chain-bolt"]],
];

const missingDefinitions = expectedEnemies
  .filter(([id, name]) =>
    !enemyData.includes("id: \"" + id + "\"") ||
    !enemyData.includes("name: \"" + name + "\"")
  )
  .map(([id]) => id);
const missingActions = expectedEnemies
  .flatMap(([, , actions]) =>
    actions.filter(actionId => !enemyData.includes("id: \"" + actionId + "\""))
  );
const windowCount = (enemyData.match(/counterWindowMs:/g) ?? []).length;
const layoutCount = (world.match(/\(\) => \[/g) ?? []).length;
const hasPhaseFlow =
  world.includes('actionPhase = "counter-window"') &&
  world.includes("executeEnemyAction") &&
  world.includes("activeUntil");
const hasDistinctDefense =
  world.includes('enemy.defense === "guard"') &&
  world.includes('movement === "flying"') &&
  world.includes("resolveEnemyMelee");
const hasMineFlow =
  world.includes('effectId === "enemy-mine"') &&
  world.includes('owner: options.owner ?? "player"');

console.log("既存敵定義: " + expectedEnemies.length);
console.log("不足する敵定義: " + (missingDefinitions.length ? missingDefinitions.join(", ") : "なし"));
console.log("不足する行動: " + (missingActions.length ? missingActions.join(", ") : "なし"));
console.log("個別カウンター受付: " + windowCount);
console.log("Wave編成定義: " + layoutCount);
console.log("行動フェーズ処理: " + (hasPhaseFlow ? "あり" : "不足"));
console.log("防御・移動・近接の分離: " + (hasDistinctDefense ? "あり" : "不足"));
console.log("敵地雷処理: " + (hasMineFlow ? "あり" : "不足"));

if (
  missingDefinitions.length ||
  missingActions.length ||
  windowCount < 10 ||
  layoutCount !== 4 ||
  !hasPhaseFlow ||
  !hasDistinctDefense ||
  !hasMineFlow
) process.exitCode = 1;
