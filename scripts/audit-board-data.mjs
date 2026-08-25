import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const panels = read("client/src/game/systems/PanelSystem.ts");
const objects = read("client/src/game/systems/ObjectSystem.ts");
const types = read("client/src/game/types.ts");
const world = read("client/src/game/GameWorld.ts");

const expectedTerrains = [
  "normal",
  "cracked",
  "hole",
  "grass",
  "ice",
  "lava",
  "poison",
  "holy",
];
const expectedObjects = [
  "bomb",
  "mine",
  "turret",
  "cube",
  "stake",
  "field-device",
];
const missingTerrains = expectedTerrains.filter(
  terrain => !panels.includes(`"${terrain}"`)
);
const missingObjects = expectedObjects.filter(
  kind => !`${types}\n${objects}\n${world}`.includes(`"${kind}"`)
);
const requiredWorldHooks = [
  "panelSystem",
  "objectSystem",
  "resetBoard",
  "returnPlayerToSafeTerritory",
  "syncBoardOccupancy",
];
const missingWorldHooks = requiredWorldHooks.filter(
  hook => !world.includes(hook)
);

console.log(`盤面: ${missingTerrains.length ? "不足あり" : "8種類"}`);
console.log(`設置物: ${missingObjects.length ? "不足あり" : "6種類"}`);
console.log(
  `GameWorld接続: ${missingWorldHooks.length ? "不足あり" : "接続済み"}`
);
console.log(
  `不足パネル: ${missingTerrains.length ? missingTerrains.join(", ") : "なし"}`
);
console.log(
  `不足設置物: ${missingObjects.length ? missingObjects.join(", ") : "なし"}`
);
console.log(
  `不足接続: ${missingWorldHooks.length ? missingWorldHooks.join(", ") : "なし"}`
);

if (
  missingTerrains.length ||
  missingObjects.length ||
  missingWorldHooks.length ||
  !world.includes("TERRITORY_EXPANSION_DURATION_MS")
)
  process.exitCode = 1;
