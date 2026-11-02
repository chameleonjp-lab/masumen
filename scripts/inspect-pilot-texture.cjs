// Read-only diagnostics in the anonymous isolated fixture; no production URLs or console dump.
async function inspectPilotTexture(page, engine, warnings) {
  const data = await page.evaluate(async () => {
    const entry = performance.getEntriesByType('resource').find(item => /\/@babylonjs_core_Engines_engine\.js(?:\?|$)/.test(new URL(item.name).pathname + new URL(item.name).search));
    let material = { unavailable: true };
    if (entry) {
      const module = await import(entry.name);
      const scene = module.Engine?.LastCreatedScene;
      const mesh = scene?.getMeshByName('pilot-plane');
      const mat = mesh?.material, texture = mat?.diffuseTexture;
      if (texture) material = {
        ready: texture.isReady(), size: texture.getSize(), baseSize: texture.getBaseSize(),
        hasAlpha: texture.hasAlpha, useAlphaFromDiffuseTexture: mat.useAlphaFromDiffuseTexture,
        transparencyMode: mat.transparencyMode, alphaMode: mat.alphaMode,
        textureBasename: new URL(texture.url, location.href).pathname.split('/').pop(),
      };
    }
    let decoded;
    try {
      const image = new Image(); image.src = new URL('assets/pilot.svg', location.href).href;
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 128, 128);
      const pixels = context.getImageData(0, 0, 128, 128).data;
      let transparent = 0, opaque = 0, colored = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) transparent++;
        if (pixels[i + 3] === 255) opaque++;
        if (pixels[i + 3] && pixels[i + 1] > 100 && pixels[i + 2] > 100) colored++;
      }
      decoded = { width: image.naturalWidth, height: image.naturalHeight, transparent, opaque, colored };
    } catch (error) { decoded = { unavailable: true, errorType: error.name }; }
    return { material, decoded };
  });
  console.log(JSON.stringify({ engine, pilotTextureDiagnostic: data, warningCategories: [...new Set(warnings)] }));
}
module.exports = { inspectPilotTexture };
