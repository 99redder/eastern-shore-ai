// Meta catalog feed (tools/meta-catalog.mjs -> meta-catalog.csv): the columns
// Meta reads, the item values that match the hand-made Commerce Manager item,
// and sale columns that are filled only while a sale in src/node-price.js is running.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFeed, activeSale, saleEffectiveDate, COLUMNS, META_IMAGES, metaImageUrls, imageInfo, productFromPage } from '../../tools/meta-catalog.mjs';
import { NODE_SALES } from '../src/node-price.js';

const root = new URL('../../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const nodeHtml = read('node.html');

// Minimal CSV reader for the two-line feed (quoted fields, "" escapes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  return rows;
}

const feedOn = (day) => {
  const [header, item, ...rest] = parseCsv(buildFeed(nodeHtml, new Date(`${day}T16:00:00Z`)));
  assert.equal(rest.length, 0, 'one item');
  assert.deepEqual(header, COLUMNS);
  return Object.fromEntries(header.map((h, i) => [h, item[i]]));
};

test('feed item matches the Commerce Manager item and node.html', () => {
  const row = feedOn('2026-11-11');
  assert.equal(row.id, 'survival-node-gen2');
  assert.equal(row.title, 'Survival Node Gen 2 - Offline AI Emergency Preparedness Kit');
  assert.equal(row.link, 'https://www.easternshore.ai/node.html');
  assert.equal(row.price, '349.99 USD');
  assert.equal(row.availability, 'in stock');
  assert.equal(row.condition, 'new');
  assert.equal(row.brand, 'Eastern Shore AI');
  assert.equal(row.fb_product_category, 'Sporting Goods > Emergency Preparedness > Emergency Tools & Kits');
  assert.equal(row.image_link, 'https://www.easternshore.ai/images/carousel/entirenode/wholekit-gen2.jpg');
  const additional = row.additional_image_link.split(', ');
  assert.equal(additional.length, 14);
  assert.deepEqual(additional, META_IMAGES.slice(1).map((p) => `https://www.easternshore.ai/${p}`));
  assert.equal(additional[0], 'https://www.easternshore.ai/images/carousel/entirenode/survival-node-kit-closed-white.jpg');
  assert.equal(additional[13], 'https://www.easternshore.ai/images/carousel/phone/background.jpg');
  assert.match(row.description, /^A hardened smartphone pre-loaded with offline AI/);
  assert.doesNotMatch(row.description, /<|https?:/);
});

test('every Meta photo exists and is within Meta\'s limits', () => {
  assert.equal(META_IMAGES.length, 15);
  assert.equal(new Set(META_IMAGES).size, 15, 'no duplicates');
  assert.equal(metaImageUrls().length, 15);
  const kit = imageInfo(readFileSync(new URL(META_IMAGES[0], root)));
  assert.deepEqual(kit, { type: 'jpeg', width: 1329, height: 1600 });
});

test('a missing or undersized photo stops the feed instead of shipping it', () => {
  assert.throws(() => metaImageUrls(['images/carousel/entirenode/wholekit-gen2.jpg', 'images/carousel/nope.jpg']), /nope\.jpg: file not found/);
  assert.throws(() => metaImageUrls(['images/carousel/entirenode/wholekit-gen2.jpg', 'images/carousel/case/case1.png']), /case1\.png: 422x345, under 500 x 500/);
});

test('Google is untouched: node.html JSON-LD photos still match merchant-feed.xml', () => {
  const jsonLd = productFromPage(nodeHtml).image;
  const feed = read('merchant-feed.xml');
  const google = [
    ...[...feed.matchAll(/<g:image_link>([^<]+)<\/g:image_link>/g)].map((m) => m[1]),
    ...[...feed.matchAll(/<g:additional_image_link>([^<]+)<\/g:additional_image_link>/g)].map((m) => m[1])
  ];
  assert.deepEqual(jsonLd, google);
  assert.equal(google.length, 4);
});

test('sale columns are filled only while a sale is running, blank before, between and after', () => {
  const blackFriday = '2026-11-27T00:00-05:00/2026-11-30T23:59-05:00';
  const christmas = '2026-12-12T00:00-05:00/2026-12-18T23:59-05:00';
  const cases = [
    ['2026-10-31', '2026-10-01T00:00-04:00/2026-10-31T23:59-04:00'],
    ['2026-11-01', ''],
    ['2026-11-13', ''],
    ['2026-11-26', ''],
    ['2026-11-27', blackFriday],
    ['2026-11-30', blackFriday],
    ['2026-12-01', ''],
    ['2026-12-11', ''],
    ['2026-12-12', christmas],
    ['2026-12-18', christmas],
    ['2026-12-19', ''],
    ['2027-03-01', '']
  ];
  for (const [day, dates] of cases) {
    const row = feedOn(day);
    assert.equal(row.sale_price_effective_date, dates, day);
    assert.equal(row.sale_price, dates ? '299.99 USD' : '', day);
    assert.equal(row.price, '349.99 USD', day);
  }
});

test('sale columns switch at midnight Eastern, not midnight UTC', () => {
  const salePrice = (iso) => {
    const [header, item] = parseCsv(buildFeed(nodeHtml, new Date(iso)));
    return item[header.indexOf('sale_price')];
  };
  // 11:59 PM EST on Nov 26 is already Nov 27 in UTC: still no sale
  assert.equal(salePrice('2026-11-26T23:59:00-05:00'), '');
  assert.equal(salePrice('2026-11-27T00:00:00-05:00'), '299.99 USD');
  assert.equal(salePrice('2026-11-30T23:59:00-05:00'), '299.99 USD');
  assert.equal(salePrice('2026-12-01T00:00:00-05:00'), '');
  assert.equal(activeSale(new Date('2026-12-12T00:05:00-05:00')).key, 'christmas');
  assert.equal(activeSale(new Date('2026-12-19T00:05:00-05:00')), null);
});

test('effective dates use the Eastern offset for each end (EDT in October)', () => {
  const halloween = NODE_SALES.find((s) => s.key === 'halloween');
  assert.equal(saleEffectiveDate(halloween), '2026-10-01T00:00-04:00/2026-10-31T23:59-04:00');
  assert.equal(saleEffectiveDate({ start: '2026-10-30', end: '2026-11-02' }), '2026-10-30T00:00-04:00/2026-11-02T23:59-05:00');
});
