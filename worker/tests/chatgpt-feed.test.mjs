// ChatGPT shopping feed (tools/chatgpt-feed.mjs -> chatgpt-feed.csv): OpenAI's
// required fields, the same title/description as the Google feed, and a sale
// price only while a sale in src/node-price.js is running (OpenAI has no sale dates).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFeed, buildItem, textFromGoogleFeed, FIELDS } from '../../tools/chatgpt-feed.mjs';
import { META_IMAGES } from '../../tools/meta-catalog.mjs';

const root = new URL('../../', import.meta.url);
const googleFeed = readFileSync(new URL('merchant-feed.xml', root), 'utf8');
const at = (day) => new Date(`${day}T16:00:00Z`);

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

const rowOn = (day) => {
  const [header, item, ...rest] = parseCsv(buildFeed(googleFeed, at(day)));
  assert.equal(rest.length, 0, 'one product row');
  assert.deepEqual(header, FIELDS);
  return Object.fromEntries(header.map((h, i) => [h, item[i]]));
};

test('feed row has OpenAI\'s required fields and matches the Google feed', () => {
  const row = rowOn('2026-11-17');
  for (const f of ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price', 'target_countries', 'store_country']) {
    assert.ok(row[f], `required field ${f}`);
  }
  assert.equal(row.item_id, 'SN-GEN2');
  assert.match(googleFeed, /<g:id>SN-GEN2<\/g:id>/, 'same id as merchant-feed.xml');
  const { title, description } = textFromGoogleFeed(googleFeed);
  assert.equal(row.title, title);
  assert.equal(row.description, description);
  assert.ok(row.title.length <= 150 && row.description.length <= 5000);
  assert.equal(row.availability, 'in_stock');
  assert.equal(row.condition, 'used', 'same condition as merchant-feed.xml');
  assert.match(googleFeed, /<g:condition>used<\/g:condition>/);
  assert.equal(row.target_countries, '["US"]', 'JSON in its cell');
  assert.deepEqual(JSON.parse(row.dimensions), { length: '14.96', width: '11.81', height: '5.51', unit: 'in' }, 'hard case size, JSON in its cell');
  assert.equal(row.store_country, 'US');
  assert.equal(row.is_eligible_search, 'true');
  assert.ok(!FIELDS.includes('is_eligible_checkout'), 'checkout stays on our site');
  assert.equal(row.image_url, `https://www.easternshore.ai/${META_IMAGES[0]}`);
  assert.equal(row.additional_image_urls, META_IMAGES.slice(1).map((p) => `https://www.easternshore.ai/${p}`).join(','));
  assert.doesNotMatch(row.additional_image_urls, /\s/, 'no spaces between photo links');
  assert.equal(row.accepts_returns, 'true');
  assert.equal(row.return_deadline_in_days, '30');
  for (const f of ['url', 'image_url', 'seller_url', 'return_policy', 'seller_privacy_policy', 'seller_tos']) {
    assert.match(row[f], /^https:\/\/www\.easternshore\.ai\//, f);
  }
  assert.equal(buildItem(googleFeed, at('2026-11-17')).price, row.price);
});

test('sale price only while a sale is running, never ahead of it', () => {
  const cases = [
    ['2026-11-01', ''],
    ['2026-11-26', ''], // day before Black Friday: no early announcement
    ['2026-11-27', '299.99 USD'],
    ['2026-11-30', '299.99 USD'],
    ['2026-12-01', ''],
    ['2026-12-11', ''],
    ['2026-12-12', '299.99 USD'],
    ['2026-12-18', '299.99 USD'],
    ['2026-12-19', '']
  ];
  for (const [day, sale] of cases) {
    const row = rowOn(day);
    assert.equal(row.price, '349.99 USD', `${day} price`);
    assert.equal(row.sale_price, sale, `${day} sale_price`);
  }
});

test('textFromGoogleFeed unescapes XML and refuses HTML', () => {
  const xml = '<g:title>A &amp; B</g:title><g:description>Kits &gt; tools</g:description>';
  assert.deepEqual(textFromGoogleFeed(xml), { title: 'A & B', description: 'Kits > tools' });
  assert.throws(() => textFromGoogleFeed('<g:title>x</g:title><g:description>&lt;b&gt;hi</g:description>'), /has HTML/);
  assert.throws(() => textFromGoogleFeed('<g:title>x</g:title>'), /description/);
});
