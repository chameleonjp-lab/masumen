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
const gameCanvas = await read("client/src/components/GameCanvas.tsx");
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
if (!gameCanvas.includes("}).catch(() => {"))
  throw new Error("Game startup must expose a rejected-scene recovery path");
for (const required of [
  'className="startup-error"',
  'role="alert"',
  'window.location.reload()',
]) {
  if (!gameCanvas.includes(required))
    throw new Error(`Startup recovery UI contract missing: ${required}`);
}

console.log(`browser contract ok: ${assetEntries.length} bundled assets, ${visualEntries.length} visual/audio recipes, scene cleanup covered`);
