/** Optional real-browser checks. Start `npm run dev -- --port 4175`, then run this script.
 * Install Playwright 1.62.1 separately, or set PLAYWRIGHT_PACKAGE to its installed module path.
 * Every ranking request is intercepted: this test never writes production scores.
 */
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const baseUrl = process.env.MASUMEN_TEST_URL || 'http://localhost:4175/masumen/';
const artifacts = process.env.MASUMEN_TEST_ARTIFACTS || '/tmp/masumen-browser-artifacts';
mkdirSync(artifacts, { recursive: true });
const languages = ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th'];
const opened = new Set();
async function languageModule(page) {
  await page.evaluate(async () => {
    const source = performance.getEntriesByType('resource').find(entry => /\/src\/i18n\/index\.ts(?:\?|$)/.test(entry.name));
    if (!source) throw Error('Run this optional check against the Vite development server');
    window.__testLanguage = await import(source.name);
  });
}
async function setRenderLanguage(page, language) {
  await page.evaluate(code => window.__testLanguage.setLanguage(code), language);
  await page.waitForFunction(code => document.documentElement.lang === code, language);
}
async function run() {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true }); opened.add(browser);
    const page = await browser.newPage({ viewport: { width: 393, height: 852 }, hasTouch: true });
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://mlpnjgezrnhdxsxolyzj.supabase.co/**', route => {
      const url = route.request().url(), body = route.request().postDataJSON(); calls.push({ url, body });
      let payload = [];
      if (url.endsWith('start_masumen_play_v1')) payload = { accepted: true, duplicate: false, start_id: body.p_start_id, play_id: '30000000-0000-4000-8000-000000000003', game_slug: 'masumen', display_name: body.p_display_name, normalized_name: body.p_display_name, client_version: body.p_client_version };
      if (url.endsWith('finish_masumen_play_v1')) payload = { accepted: true, duplicate: true, play_id: body.p_play_id, game_slug: 'masumen', result_type: body.p_result_type, reached_wave: body.p_reached_wave, score: body.p_score };
      if (url.endsWith('get_best_score_ranking')) payload = Array.from({ length: 30 }, (_, index) => ({ rank_no: index + 1, display_name: `Player ${index} <b>`, best_score: 900 - index }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });
    await page.goto(baseUrl); await page.locator('#masumen-language').waitFor({ timeout: 90000 });
    await languageModule(page);
    await page.evaluate(() => { window.__testShares = []; window.open = url => { window.__testShares.push(url); return { opener: null }; }; });
    for (const language of languages) {
      await page.locator('#masumen-language').selectOption(language);
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.equal(await page.evaluate(() => localStorage.getItem('masumen.language.v1')), language);
      const expected = await page.evaluate(() => window.__testLanguage.t('Xでシェア'));
      assert.equal(await page.locator('.name-gate .x-share-action').innerText(), expected);
      await page.locator('.name-gate .x-share-action').click();
      const text = await page.evaluate(() => new URL(window.__testShares.at(-1)).searchParams.get('text'));
      assert.match(text, /https:\/\/chameleonjp-lab.github.io\/masumen\/$/);
      assert.ok(!text.includes('{0}')); assert.equal(calls.length, 0);
    }
    await page.locator('#masumen-language').selectOption('en');
    await page.reload(); await page.locator('#masumen-language').waitFor({ timeout: 90000 });
    assert.equal(await page.locator('#masumen-language').inputValue(), 'en');
    await languageModule(page);
    await page.locator('#masumen-player-name').fill('');
    await page.locator('.name-gate__submit').click();
    await page.locator('.signal-card').first().waitFor();
    assert.equal(await page.locator('.signal-card').count(), 10);
    await page.locator('.signal-card').first().click();
    const hand = await page.locator('.signal-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-describedby')));
    const selected = await page.locator('.signal-card[aria-pressed="true"]').getAttribute('aria-describedby');
    for (const language of languages) {
      await setRenderLanguage(page, language);
      assert.deepEqual(await page.locator('.signal-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-describedby'))), hand);
      assert.equal(await page.locator('.signal-card[aria-pressed="true"]').getAttribute('aria-describedby'), selected);
      assert.equal(calls.length, 0);
      const text = await page.locator('.custom-console').innerText();
      assert.doesNotMatch(text, /\{\d+\}/);
      if (language !== 'ja') assert.doesNotMatch(text, /[\u3040-\u30ff]/);
    }
    await page.screenshot({ path: resolve(artifacts, `masumen-${engine.name()}-cards-th.png`) });
    await page.evaluate(() => {
      localStorage.setItem('masumen.language.v1', 'en');
      localStorage.setItem('masumen.pending-play.v1:10000000-0000-4000-8000-000000000001', JSON.stringify({ startId: '10000000-0000-4000-8000-000000000001', playerName: '連射弾 <b>Alice</b>', clientVersion: 'captured-version', result: { score: 321, resultType: 'clear', reachedWave: 5 } }));
    });
    await page.reload(); await page.locator('#masumen-language').waitFor({ timeout: 90000 }); await languageModule(page);
    await page.locator('.pending-results button').click();
    await page.getByText('Score sent.', { exact: true }).waitFor();
    await page.locator('.online-ranking li').first().waitFor();
    const count = calls.length;
    await page.evaluate(() => { window.open = () => ({ opener: null }); });
    for (const language of languages) {
      await setRenderLanguage(page, language);
      assert.equal(await page.locator('.online-ranking li').count(), 30);
      assert.equal(await page.locator('.result-platform__player b').count(), 0);
      assert.match(await page.locator('.result-platform__player').innerText(), /連射弾 <b>Alice<\/b>/);
      assert.doesNotMatch(await page.locator('.result-share-text').inputValue(), /Alice|連射弾|\{\d+\}/);
      assert.match(await page.locator('.result-share-text').inputValue(), /321/);
      await page.locator('.result-share-button').click();
      assert.ok((await page.locator('.ranking-status').innerText()).trim());
      assert.ok((await page.locator('.share-status').innerText()).trim());
      assert.equal(calls.length, count);
    }
    for (const size of [{ width: 393, height: 600 }, { width: 852, height: 393 }]) {
      await page.setViewportSize(size);
      const bounds = await page.locator('.result-console').evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight, right: element.getBoundingClientRect().right, width: innerWidth }));
      assert.ok(bounds.right <= bounds.width + 1); assert.ok(bounds.scroll >= bounds.client);
      await page.locator('.result-actions button').last().scrollIntoViewIfNeeded();
      assert.equal(await page.locator('.result-actions button').last().isVisible(), true);
    }
    assert.deepEqual(errors, []);
    await browser.close(); opened.delete(browser);
    console.log(`PASS ${engine.name()}: all 15 languages home/share/card choice/result/30 rows, same hand and selected card, literal names, no duplicate RPCs, saved language, portrait/short/landscape`);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { for (const browser of opened) await browser.close(); });
