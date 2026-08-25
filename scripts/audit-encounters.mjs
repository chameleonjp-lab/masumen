import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const world = readFileSync(
  resolve(import.meta.dirname, "../client/src/game/GameWorld.ts"),
  "utf8"
);
const expectedPatterns = [
  "lane-sweep",
  "column-scan",
  "pursuit-dash",
  "mortar-spread",
  "pulse-grid",
];
const missingPatterns = expectedPatterns.filter(
  pattern => !world.includes(`"${pattern}"`)
);
const waveLayoutCount = (world.match(/\(\) => \[/g) ?? []).length;

console.log(`Wave編成定義: ${waveLayoutCount}`);
console.log(
  `現行敵パターン: ${expectedPatterns.length - missingPatterns.length}/${expectedPatterns.length}`
);
console.log(
  `不足パターン: ${missingPatterns.length ? missingPatterns.join(", ") : "なし"}`
);

if (waveLayoutCount !== 4 || missingPatterns.length) process.exitCode = 1;
