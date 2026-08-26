import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const world = read("client/src/game/GameWorld.ts");
const enemyData = read("client/src/game/data/enemies.ts");
const encounterData = read("client/src/game/data/encounters.ts");

const expectedNormals = [
  ["bulwark", "BULWARK-3"],
  ["scanner", "SCANNER-8"],
  ["razor", "RAZOR-6"],
  ["mortar", "MORTAR-NODE"],
  ["sentinel", "VOLT-SENTINEL"],
  ["wave-runner", "WAVE-RUNNER"],
  ["boomer-arc", "BOOMER-ARC"],
  ["hopper-bomb", "HOPPER-BOMB"],
  ["gaia-hammer", "GAIA-HAMMER"],
  ["weather-core", "WEATHER-CORE"],
  ["support-relay", "SUPPORT-RELAY"],
  ["mirror-node", "MIRROR-NODE"],
];
const expectedBosses = [
  ["bastion-prime", "BASTION PRIME"],
  ["prism-hunter", "PRISM HUNTER"],
  ["climate-engine", "CLIMATE ENGINE"],
  ["core-arbiter", "CORE ARBITER"],
];
const expectedActions = [
  "bulwark-lane-cannon",
  "bulwark-shield-bash",
  "scanner-column-scan",
  "scanner-signal-lock",
  "razor-dash-cut",
  "razor-cross-slash",
  "mortar-shell",
  "mortar-triple-shell",
  "mortar-mine-drop",
  "sentinel-alternating-pulse",
  "sentinel-chain-bolt",
  "wave-runner-water-wave",
  "wave-runner-frost-surge",
  "boomer-arc-outbound",
  "boomer-arc-return",
  "hopper-jump-land",
  "hopper-bomb-drop",
  "gaia-hammer-strike",
  "gaia-earthquake",
  "weather-firefront",
  "weather-waterfront",
  "weather-electric-pulse",
  "weather-wood-root",
  "support-relay-heal",
  "support-relay-barrier",
  "support-relay-shot",
  "mirror-reflect-stance",
  "mirror-mimic-shot",
  "bastion-lane-cannon",
  "bastion-shield-bash",
  "bastion-obstacle-deploy",
  "bastion-territory-siege",
  "bastion-open-barrage",
  "prism-teleport-cut",
  "prism-front-cut",
  "prism-cross-cut",
  "prism-triple-cut",
  "climate-firefront",
  "climate-waterfront",
  "climate-electric-pulse",
  "climate-wood-root",
  "climate-dual-storm",
  "arbiter-tracking-shot",
  "arbiter-stake-field",
  "arbiter-close-cut",
  "arbiter-territory-take",
  "arbiter-orbit-mine",
];

const missingNormals = expectedNormals
  .filter(([id, name]) =>
    !enemyData.includes('id: "' + id + '"') ||
    !enemyData.includes('name: "' + name + '"')
  )
  .map(([id]) => id);
const missingBosses = expectedBosses
  .filter(([id, name]) =>
    !enemyData.includes('id: "' + id + '"') ||
    !enemyData.includes('name: "' + name + '"')
  )
  .map(([id]) => id);
const missingActions = expectedActions.filter(
  actionId => !enemyData.includes('id: "' + actionId + '"')
);
const counterWindows = [...enemyData.matchAll(/counterWindowMs: (\d+)/g)].map(
  match => Number(match[1])
);
const encounterCount =
  (encounterData.match(/id: "wave-[123]-formation-[abc]"/g) ?? []).length;
const phaseCount = (enemyData.match(/phases: \[/g) ?? []).length;
const hasPhaseFlow =
  world.includes("refreshEnemyPhase") &&
  world.includes("availableEnemyActions") &&
  world.includes("actionPhase = isCounterWindowOpen") &&
  world.includes("executeEnemyAction") &&
  world.includes("activeUntil");
const hasDistinctBehavior =
  world.includes('enemy.movement === "outer"') &&
  world.includes('enemy.movement === "row-align"') &&
  world.includes('enemy.defense === "armor"') &&
  world.includes('enemy.definitionId === "mirror-node"') &&
  world.includes("resolveEnemyMelee");
const hasObjectFlow =
  world.includes('effectId: "enemy-mine"') &&
  world.includes('effectId: "enemy-bomb"') &&
  world.includes("triggerEnemyObjectExplosion");
const hasBossFlow =
  world.includes("BOSS_ENEMY_IDS") &&
  world.includes("bossHistory") &&
  world.includes("saveBossHistory");
const hasSafeRoute =
  world.includes("encounterHasSafeStart") &&
  world.includes("ensurePlayerEscapeRoute") &&
  world.includes("stealPlayerFront");
const allCounterWindowsValid =
  counterWindows.length >= 40 &&
  counterWindows.every(value => value >= 100 && value <= 180);

console.log("通常敵定義: " + expectedNormals.length);
console.log("不足する通常敵: " + (missingNormals.length ? missingNormals.join(", ") : "なし"));
console.log("ボス定義: " + expectedBosses.length);
console.log("不足するボス: " + (missingBosses.length ? missingBosses.join(", ") : "なし"));
console.log("不足する行動: " + (missingActions.length ? missingActions.join(", ") : "なし"));
console.log("個別カウンター受付: " + counterWindows.length);
console.log("編成テンプレート: " + encounterCount);
console.log("ボス段階表: " + phaseCount);
console.log("行動フェーズ処理: " + (hasPhaseFlow ? "あり" : "不足"));
console.log("移動・防御・反射の分離: " + (hasDistinctBehavior ? "あり" : "不足"));
console.log("敵設置物・爆弾処理: " + (hasObjectFlow ? "あり" : "不足"));
console.log("ボス履歴処理: " + (hasBossFlow ? "あり" : "不足"));
console.log("安全経路処理: " + (hasSafeRoute ? "あり" : "不足"));

if (
  missingNormals.length ||
  missingBosses.length ||
  missingActions.length ||
  !allCounterWindowsValid ||
  encounterCount !== 9 ||
  phaseCount !== 4 ||
  !hasPhaseFlow ||
  !hasDistinctBehavior ||
  !hasObjectFlow ||
  !hasBossFlow ||
  !hasSafeRoute
) process.exitCode = 1;
