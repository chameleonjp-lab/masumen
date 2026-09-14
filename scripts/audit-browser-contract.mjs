import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const read = path => readFile(resolve(root, path), "utf8");

const assets = await read("client/src/game/assets.ts");
const assetEntries = [...assets.matchAll(/assetPath\("([^"]+)"\)/g)].map(match => match[1]);
if (assetEntries.length !== 9) throw new Error(`Expected 9 runtime assets, found ${assetEntries.length}`);
if (new Set(assetEntries).size !== assetEntries.length) throw new Error("Runtime asset filenames must be unique");
for (const file of assetEntries) {
  if (!/^[-a-z0-9]+\.svg$/i.test(file)) throw new Error(`Invalid bundled asset filename: ${file}`);
  const svg = await read(`client/public/assets/${file}`);
  if (!/<svg\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg))
    throw new Error(`Bundled asset is not a valid SVG: ${file}`);
}

const visuals = await read("client/src/game/cardVisuals.ts");
const audio = await read("client/src/game/cardAudioRecipes.ts");
const visualEntries = [...visuals.matchAll(/^\s{2}(\w+):\s+\{ label:/gm)].map(match => match[1]);
const audioEntries = [...audio.matchAll(/^\s{2}(\w+):\s+\{ wave:/gm)].map(match => match[1]);
if (visualEntries.length !== 50) throw new Error(`Expected 50 visual recipes, found ${visualEntries.length}`);
if (audioEntries.length !== 50) throw new Error(`Expected 50 audio recipes, found ${audioEntries.length}`);
if (new Set(visualEntries).size !== 50 || new Set(audioEntries).size !== 50)
  throw new Error("Visual and audio recipe IDs must be unique");
if (visualEntries.join(",") !== audioEntries.join(","))
  throw new Error("Visual and audio recipe order/coverage must match");

const scene = await read("client/src/game/scene.ts");
const projectileVisuals = await read("client/src/game/render/projectileVisuals.ts");
const gameCanvas = await read("client/src/components/GameCanvas.tsx");
const gameWorld = await read("client/src/game/GameWorld.ts");
const folder = await read("client/src/game/folder.ts");
const enemies = await read("client/src/game/data/enemies.ts");
const cardPresentation = await read("client/src/game/cardPresentation.ts");
const styles = await read("client/src/index.css");
const engine = await read("client/src/game/engine.ts");
const startup = await read("client/src/game/startup.ts");
const startupUI = await read("client/src/components/game/StartupScreen.tsx");
const resultScreen = await read("client/src/components/game/ResultScreen.tsx");
const index = await read("client/index.html");
const viteConfig = await read("vite.config.ts");
for (const required of [
  "new Texture(",
  "engine.onResizeObservable.add",
  "engine.onResizeObservable.remove",
  "audio.dispose()",
  "scene.dispose()",
]) {
  if (!scene.includes(required)) throw new Error(`Scene lifecycle contract missing: ${required}`);
}
for (const source of [assets, scene, index, viteConfig]) {
  if (source.includes("/manus-storage/") || source.includes("vitePluginManusRuntime"))
    throw new Error("Production client must not depend on Manus-only runtime or storage paths");
}
if (!index.includes("./assets/relay-mark.svg")) throw new Error("Entry page favicon must be bundled");
if (index.includes("VITE_ANALYTICS_ENDPOINT") || index.includes("/umami"))
  throw new Error("Entry page must not emit an unconfigured analytics request");
if (!viteConfig.includes('base: "./"')) throw new Error("Vite base must support repository subpaths");
if (/console\.(log|debug)\s*\(/.test(scene))
  throw new Error("Scene must not ship debug console output");
if (!startup.includes(".catch(fail)"))
  throw new Error("Game startup must expose a rejected-scene recovery path");
if (!engine.includes("try") || !engine.includes("catch") || !engine.includes("return null"))
  throw new Error("Game startup must recover from a synchronous WebGL engine failure");
if (!gameCanvas.includes("createGameEngine(canvas)") || !startup.includes("if (!engine)"))
  throw new Error("GameCanvas must expose synchronous engine failure to the startup UI");
for (const required of [
  'className="startup-error"',
  'role="alert"',
  'window.location.reload()',
]) {
  if (!startupUI.includes(required))
    throw new Error(`Startup recovery UI contract missing: ${required}`);
}

for (const required of ["createEnemyVisualMap(scene)", "transientResources.release", "objectMeshes.sync", "clearBattleVisuals()"])
  if (!scene.includes(required)) throw new Error(`Renderer ownership contract missing: ${required}`);
for (const required of ["projectileRenderPosition", "projectile.travelProgress", "projectile.flightMs", "projectile.target"])
  if (!projectileVisuals.includes(required)) throw new Error(`Projectile rendering contract missing: ${required}`);
for (const required of ["syncProjectileVisuals(snapshot)", "projectileVisuals.clear()"])
  if (!scene.includes(required)) throw new Error(`Projectile lifecycle contract missing: ${required}`);
if (!gameCanvas.includes("<StartupGate") || !startupUI.includes('state.status !== "ready"'))
  throw new Error("Startup screens must be exclusive");
for (const required of [
  "名前を入力して開始",
  "entryScreen",
  "KeyboardBindingPanel",
  "getKeyboardBindings",
  "表示された10枚を横にスライドして確認し、1〜5枚を選べます",
  "card-deck-horizontal",
  "centerCardIndex",
  "onScroll={updateCenteredCard}",
  "card-inspector-bottom",
  "custom-countdown",
  "customRemaining",
  'role="progressbar"',
  "20秒後に再選択",
  'className="action-buttons"',
]) {
  if (!gameCanvas.includes(required))
    throw new Error(`Current flow/control contract missing: ${required}`);
}
for (const forbidden of ["アリーナへようこそ", "信号を開始", "信号を入力して開始"]) {
  if (gameCanvas.includes(forbidden))
    throw new Error(`Public start flow must not ship the legacy welcome copy: ${forbidden}`);
}
for (const required of [
  "customElapsedMs",
  "20秒経過 — 次のカードを選択してください",
  "resumeBattleWithoutCards",
  "カードなしで戦闘再開",
  "COMBAT_BALANCE.normalShot.burstSize",
  "COMBAT_BALANCE.normalShot.burstIntervalMs",
]) {
  if (!gameWorld.includes(required))
    throw new Error(`Battle timing contract missing: ${required}`);
}
if (gameCanvas.includes("FolderEditor") || gameCanvas.includes("<Tutorial"))
  throw new Error("Folder editing and practice UI must stay out of the public flow");
if (gameCanvas.includes("精神状態") || gameCanvas.includes("emotionLabels"))
  throw new Error("Mental-state labels must stay out of the public HUD");
if (!folder.includes("createCatalogEntries") || !folder.includes("presentedCardIds"))
  throw new Error("Catalog offer must track previously presented card IDs");
if (/[A-Z]{3,}[- ]\d+/.test(enemies) || enemies.includes("BULWARK") || enemies.includes("SCANNER"))
  throw new Error("Enemy definitions must use Japanese player-facing names");

for (const required of [
  "beginPointerAction",
  "touchActionForPointer",
  'aria-label=\"通常攻撃\"',
  'aria-label=\"チャージショット\"',
  "controller?.toggleCard(index)",
  "data-card-index={index}",
  "cardPresentation(card)",
  "card-state",
  "card-stats",
  "customHandNumber",
  "提示 ",
  "onRetryRanking",
  "rankingRetryToken",
]) {
  if (!gameCanvas.includes(required))
    throw new Error(`Mobile input/card contract missing: ${required}`);
}
for (const forbidden of [
  "追加できません",
  "追加不可：",
  "同名・同じ接続コード・共通コード",
  "同名、同じ接続コード、または共通コード",
]) {
  if (gameCanvas.includes(forbidden))
    throw new Error(`Card selection must not ship the legacy restriction: ${forbidden}`);
}
for (const required of ["onRetryRanking", "ランキングを再試行"])
  if (!resultScreen.includes(required))
    throw new Error(`Result ranking retry contract missing: ${required}`);
if (gameCanvas.includes("preventMultiTouch"))
  throw new Error("Combat touch input must not cancel the second pointer globally");
for (const required of [
  ".game-shell .mobile-controls button",
  "touch-action: none",
  "@media (pointer: coarse) and (orientation: landscape)",
  ".dpad.dpad-large button {\n    width: 44px;\n    height: 44px;",
  ".card-sigil",
  ".card-state.is-selected",
  ".card-stats span",
  ".card-deck-horizontal",
  "overflow-x: auto",
  "flex-wrap: nowrap",
  "scroll-snap-align: center",
  "scroll-padding-inline",
  ".custom-countdown",
  ".custom-countdown-meter",
  "left: 50%",
  ".pause-button { min-height: 44px; }",
  ".feedback-controls button { min-height: 44px; }",
]) {
  if (!styles.includes(required))
    throw new Error(`Mobile layout contract missing: ${required}`);
}
for (const required of ["readableDescription", "cardTargetLabel", "getCardVfxRecipe"]) {
  if (!cardPresentation.includes(required))
    throw new Error(`Card presentation contract missing: ${required}`);
}

console.log(`browser contract ok: ${assetEntries.length} bundled assets, ${visualEntries.length} visual/audio recipes, scene cleanup covered`);
