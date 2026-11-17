// ChatGPT shopping feed (tools/chatgpt-feed.mjs -> chatgpt-feed.jsonl): OpenAI's
// required fields, the same title/description as the Google feed, and a sale
// price only while a sale in src/node-price.js is running (OpenAI has no sale dates).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFeed, textFromGoogleFeed, FIELDS } from '../../tools/chatgpt-feed.mjs';
import { META_IMAGES } from '../../tools/meta-catalog.mjs';

const root = new URL('../../', import.meta.url);
const googleFeed = readFileSync(new URL('merchant-feed.xml', root), 'utf8');

const feedOn = (day) => {
  const lines = buildFeed(googleFeed, new Date(`${day}T16:00:00Z`)).split('\n');
  assert.equal(lines.length, 2, 'one item, newline at the end');
  assert.equal(lines[1], '');
  return JSON.parse(lines[0]);
};

test('feed item has OpenAI\'s required fields and matches the Google feed', () => {
  const item = feedOn('2026-11-17');
  for (const f of ['item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price', 'target_countries', 'store_country']) {
    assert.ok(item[f] !== undefined && item[f] !== '', `required field ${f}`);
  }
  assert.deepEqual(Object.keys(item), FIELDS.filter((f) => f in item), 'fields in schema order');
  assert.equal(item.item_id, 'SN-GEN2');
  assert.match(googleFeed, /<g:id>SN-GEN2<\/g:id>/, 'same id as merchant-feed.xml');
  const { title, description } = textFromGoogleFeed(googleFeed);
  assert.equal(item.title, title);
  assert.equal(item.description, description);
  assert.ok(item.title.length <= 150 && item.description.length <= 5000);
  assert.equal(item.availability, 'in_stock');
  assert.equal(item.condition, 'used', 'same condition as merchant-feed.xml');
  assert.match(googleFeed, /<g:condition>used<\/g:condition>/);
  assert.deepEqual(item.target_countries, ['US']);
  assert.equal(item.store_country, 'US');
  assert.equal(item.is_eligible_search, true);
  assert.equal(item.is_eligible_checkout, undefined, 'checkout stays on our site');
  assert.equal(item.image_url, `https://www.easternshore.ai/${META_IMAGES[0]}`);
  assert.deepEqual(item.additional_image_urls, META_IMAGES.slice(1).map((p) => `https://www.easternshore.ai/${p}`));
  assert.equal(item.return_deadline_in_days, 30);
  for (const f of ['url', 'image_url', 'seller_url', 'return_policy', 'seller_privacy_policy', 'seller_tos']) {
    assert.match(item[f], /^https:\/\/www\.easternshore\.ai\//, f);
  }
});

test('sale price only while a sale is running, never ahead of it', () => {
  const cases = [
    ['2026-11-01', null],
    ['2026-11-26', null], // day before Black Friday: no early announcement
    ['2026-11-27', '299.99 USD'],
    ['2026-11-30', '299.99 USD'],
    ['2026-12-01', null],
    ['2026-12-11', null],
    ['2026-12-12', '299.99 USD'],
    ['2026-12-18', '299.99 USD'],
    ['2026-12-19', null]
  ];
  for (const [day, sale] of cases) {
    const item = feedOn(day);
    assert.equal(item.price, '349.99 USD', `${day} price`);
    assert.equal(item.sale_price, sale ?? undefined, `${day} sale_price`);
  }
});

test('textFromGoogleFeed unescapes XML and refuses HTML', () => {
  const xml = '<g:title>A &amp; B</g:title><g:description>Kits &gt; tools</g:description>';
  assert.deepEqual(textFromGoogleFeed(xml), { title: 'A & B', description: 'Kits > tools' });
  assert.throws(() => textFromGoogleFeed('<g:title>x</g:title><g:description>&lt;b&gt;hi</g:description>'), /has HTML/);
  assert.throws(() => textFromGoogleFeed('<g:title>x</g:title>'), /description/);
});
