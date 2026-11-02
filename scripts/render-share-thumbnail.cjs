const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
async function renderShareThumbnail(browser, engine) {
  const svg = readFileSync(resolve('docs/share-assets/masumen-og-v1.svg'), 'utf8');
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  try {
    await context.route('**/*', route => route.abort('blockedbyclient'));
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style></head><body>' + svg + '</body></html>');
    await page.evaluate(async () => {
      await document.fonts.ready;
      const sources = [...document.querySelectorAll('svg image')].map(el => el.getAttribute('href'));
      if (sources.length !== 1) throw Error('Expected one immutable actual-scene image');
      await Promise.all(sources.map(async source => {
        if (!/^data:image\/png;base64,/.test(source)) throw Error('Non-embedded image blocked');
        const image = new Image(); image.src = source; await image.decode();
        if (image.naturalWidth !== 1200 || image.naturalHeight !== 800) throw Error('Unexpected source dimensions');
      }));
    });
    assert.equal(await page.locator('body > svg').getAttribute('width'), '1200');
    const directory = resolve(process.env.MASUMEN_TEST_ARTIFACTS || 'test-artifacts/share');
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: resolve(directory, `${engine}-thumbnail-composition.png`) });
  } finally { await context.close(); }
}
module.exports = { renderShareThumbnail };
