import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const read = path => readFile(resolve(root, path), "utf8");

const assets = await read("client/src/game/assets.ts");
const assetEntries = [...assets.matchAll(/^\s+(\w+):\s+"([^"]+)",?$/gm)].map(match => ({
  name: match[1],
  url: match[2],
}));
if (assetEntries.length !== 9) throw new Error(`Expected 9 runtime assets, found ${assetEntries.length}`);
const assetUrls = assetEntries.map(entry => entry.url);
if (new Set(assetUrls).size !== assetUrls.length) throw new Error("Runtime asset URLs must be unique");
for (const entry of assetEntries) {
  if (!entry.url.startsWith("/manus-storage/") || !/\.(png|webp|jpg|jpeg)$/i.test(entry.url))
    throw new Error(`Invalid runtime asset URL for ${entry.name}: ${entry.url}`);
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
for (const required of [
  "new Texture(",
  "engine.onResizeObservable.add",
  "engine.onResizeObservable.remove",
  "audio.dispose()",
  "scene.dispose()",
]) {
  if (!scene.includes(required)) throw new Error(`Scene lifecycle contract missing: ${required}`);
}
if (/console\.(log|debug)\s*\(/.test(scene))
  throw new Error("Scene must not ship debug console output");

console.log(`browser contract ok: ${assetEntries.length} assets, ${visualEntries.length} visual/audio recipes, scene cleanup covered`);
