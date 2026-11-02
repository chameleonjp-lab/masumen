const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const html = readFileSync('client/index.html', 'utf8');
const canonical = 'https://chameleonjp-lab.github.io/masumen/';
const image = canonical + 'assets/masumen-og-v1.png';
function meta(key) {
  const tag = [...html.matchAll(/<meta\s[^>]*>/g)].map(match => match[0]).find(tag => tag.includes(`property="${key}"`) || tag.includes(`name="${key}"`));
  return tag?.match(/content="([^"]*)"/)?.[1];
}
test('social link previews use the actual-scene PNG and official canonical URL', () => {
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
  assert.equal(meta('og:url'), canonical);
  assert.equal(meta('og:title'), 'マスメン');
  assert.equal(meta('og:image'), image);
  assert.equal(meta('twitter:image'), image);
  assert.equal(meta('twitter:card'), 'summary_large_image');
  assert.equal(meta('og:image:type'), 'image/png');
  assert.equal(meta('og:image:width'), '1200');
  assert.equal(meta('og:image:height'), '630');
  assert.ok(meta('og:image:alt')?.includes('盤面'));
});
test('the preview asset is a real 1200 by 630 PNG, not renamed SVG or missing file', () => {
  const png = readFileSync('client/public/assets/masumen-og-v1.png');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.subarray(12, 16).toString(), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length > 10000);
});
