import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = relativePath => readFileSync(resolve(root, relativePath), "utf8");
const types = read("client/src/game/types.ts");
const balance = read("client/src/game/data/balance.ts");
const attacks = read("client/src/game/systems/AttackSystem.ts");
const projectiles = read("client/src/game/systems/ProjectileSystem.ts");
const world = read("client/src/game/GameWorld.ts");

const requiredMotions = [
  "straight",
  "piercing",
  "wave",
  "thrown",
  "homing",
  "reflect",
  "orbit",
];
const missingFiles = [
  "client/src/game/data/balance.ts",
  "client/src/game/systems/AttackSystem.ts",
  "client/src/game/systems/ProjectileSystem.ts",
].filter(relativePath => !existsSync(resolve(root, relativePath)));
const missingMotions = requiredMotions.filter(motion => !types.includes(`"${motion}"`));
const requiredWorldHooks = [
  "projectileSystem.advance",
  "resolveProjectileCollision",
  "applyProjectileResolution",
  "dispatchCardAttack",
  "dispatchMeleeCard",
  "updateFieldObjects",
];
const missingWorldHooks = requiredWorldHooks.filter(hook => !world.includes(hook));
const missingTiming = [
  "AttackTiming",
  "counterStartMs",
  "counterEndMs",
  "isCounterWindow",
].filter(token => !`${types}\n${attacks}\n${world}`.includes(token));

console.log(`攻撃物方式: ${missingMotions.length ? "不足あり" : `${requiredMotions.length}方式`}`);
console.log(`共通処理: ${missingWorldHooks.length ? "不足あり" : "接続済み"}`);
console.log(`攻撃時間: ${missingTiming.length ? "不足あり" : "定義済み"}`);
console.log(`調整値: ${balance.includes("fullChargeMs") && balance.includes("intervalByDistanceMs") ? "集約済み" : "不足あり"}`);
console.log(`不足ファイル: ${missingFiles.length ? missingFiles.join(", ") : "なし"}`);
console.log(`不足方式: ${missingMotions.length ? missingMotions.join(", ") : "なし"}`);
console.log(`不足接続: ${missingWorldHooks.length ? missingWorldHooks.join(", ") : "なし"}`);
console.log(`不足時間定義: ${missingTiming.length ? missingTiming.join(", ") : "なし"}`);

if (
  missingFiles.length ||
  missingMotions.length ||
  missingWorldHooks.length ||
  missingTiming.length ||
  !balance.includes("fullChargeMs") ||
  !balance.includes("intervalByDistanceMs") ||
  projectiles.includes("performance.now")
)
  process.exitCode = 1;
