const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { isolateBrowserNetwork, localTestURL } = require('./browser-network-safety.cjs');

// Separate, short genuine play; never changes the mobile defeat/retry context.
async function captureThumbnailScene(browser, engine, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, locale: 'ja-JP', serviceWorkers: 'block' });
  try {
    await isolateBrowserNetwork(context, localTestURL(baseUrl));
    const calls = [];
    await context.route('https://*.supabase.co/**', route => {
      const name = route.request().url().split('/').pop();
      const body = route.request().postDataJSON();
      calls.push(name);
      if (name !== 'start_masumen_play_v1') throw Error('Unexpected RPC during scene capture');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ accepted: true, duplicate: false, start_id: body.p_start_id, play_id: '40000000-0000-4000-8000-000000000004', game_slug: 'masumen', display_name: body.p_display_name, normalized_name: body.p_display_name, client_version: body.p_client_version }) });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl + '?seed=12345');
    await page.locator('#masumen-language').waitFor({ timeout: 90000 });
    await page.locator('#masumen-language').selectOption('ja');
    await page.locator('#masumen-player-name').fill('素材確認');
    await page.locator('.name-gate .sound-toggle').click();
    await page.locator('.name-gate__submit').click();
    await page.locator('.signal-card').first().waitFor();
    await page.locator('.signal-card').first().click();
    await page.locator('.custom-console .engage-button').click();
    await page.waitForFunction(() => document.querySelector('.game-shell')?.dataset.mode === 'battle');
    await page.waitForFunction(() => {
      const logo = document.querySelector('img[src$="/assets/relay-mark.svg"]');
      const canvas = document.querySelector('.game-canvas');
      return logo && logo.complete && logo.naturalWidth > 0 && canvas && canvas.width > 0 && canvas.height > 0;
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const directory = resolve(process.env.MASUMEN_TEST_ARTIFACTS || 'test-artifacts/share');
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, `${engine}-thumbnail-source.png`) });
    assert.deepEqual(calls, ['start_masumen_play_v1']);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine}: genuine Japanese battle source captured; image content still requires visual review`);
  } finally { await context.close(); }
}
module.exports = { captureThumbnailScene };
