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
if (!(await exists(`${builtRoot}/index.html`)) throw new Error("Build output is missing index.html");
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

const outputFiles = await readdir(resolve(root, builtRoot));
if (outputFiles.length < assetFiles.length + 2)
  throw new Error("Build output is unexpectedly empty");

console.log(`build output ok: ${assetFiles.length} assets, ${outputFiles.length} top-level files`);
