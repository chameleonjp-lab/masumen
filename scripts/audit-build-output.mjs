import { access, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const read = path => readFile(resolve(root, path), "utf8");
const exists = async path => {
  try {
    await access(resolve(root, path));
    return true;
  } catch {
    return false;
  }
};

const assets = await read("client/src/game/assets.ts");
const assetFiles = [...assets.matchAll(/assetPath\("([^"]+)"\)/g)].map(match => match[1]);
if (assetFiles.length !== 9) throw new Error(`Expected 9 bundled assets, found ${assetFiles.length}`);

const builtRoot = "dist/public";
if (!(await exists(`${builtRoot}/index.html`))) throw new Error("Build output is missing index.html");
const builtIndex = await read(`${builtRoot}/index.html`);
if (builtIndex.includes("/manus-storage/") || builtIndex.includes("__manus__"))
  throw new Error("Build output still contains a Manus-only reference");
if (builtIndex.includes("VITE_ANALYTICS_ENDPOINT") || builtIndex.includes("/umami"))
  throw new Error("Build output still contains an unconfigured analytics reference");
if (!/<script[^>]+src=["'][^"']+assets\/[^"']+\.js["']/i.test(builtIndex))
  throw new Error("Build output is missing the bundled JavaScript entry");

for (const file of assetFiles) {
  if (!(await exists(`${builtRoot}/assets/${file}`)))
    throw new Error(`Build output is missing asset: ${file}`);
}

const builtAssetFiles = await readdir(resolve(root, `${builtRoot}/assets`));
if (builtAssetFiles.filter(file => /\.svg$/i.test(file)).length < assetFiles.length)
  throw new Error("Build output is missing bundled SVG assets");

console.log(`build output ok: ${assetFiles.length} assets, ${builtAssetFiles.length} asset files`);

// Link previews must ship in the same static package as the game, not just source metadata.
const shareImage = "assets/masumen-og-v1.png";
if (!builtIndex.includes(`https://chameleonjp-lab.github.io/masumen/${shareImage}`))
  throw new Error("Build output is missing the canonical share image metadata");
const preview = await readFile(resolve(root, builtRoot, shareImage));
if (preview.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || preview.readUInt32BE(16) !== 1200 || preview.readUInt32BE(20) !== 630)
  throw new Error("Build output share image is not a 1200 by 630 PNG");
console.log("share preview output ok: 1200 x 630 actual-scene PNG");
