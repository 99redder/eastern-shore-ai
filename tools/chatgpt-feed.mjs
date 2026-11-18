// ChatGPT shopping product feed for the Survival Node: chatgpt-feed.csv,
// served at https://www.easternshore.ai/chatgpt-feed.csv and given to
// OpenAI's Business Hub (chatgpt.com/business-hub) as a hosted feed URL.
//
// Fields follow OpenAI's product feed schema:
// https://developers.openai.com/commerce/specs/file-upload/products
// CSV because the hosted-URL option takes plain .csv/.tsv but only gzipped
// JSONL: a header row, one product per row, UTF-8. Booleans are lowercase
// strings, target_countries is JSON in its cell, additional_image_urls is a
// comma-separated list (no spaces), and optional fields are left empty.
//
// - Title and description come from merchant-feed.xml (the Google feed), so
//   ChatGPT and Google describe the kit the same way. Edit them there.
// - Photos are META_IMAGES from tools/meta-catalog.mjs (the full Gen 2 set),
//   checked against the same JPEG/PNG and 500 x 500 px limits.
// - Price comes from the sale schedule in worker/src/node-price.js. OpenAI's
//   schema has no sale dates ("update the feed when a sale starts or ends"),
//   so sale_price is in the file only while a sale is running, like the Meta
//   feed: never announce a sale early. .github/workflows/node-price.yml runs
//   this just after midnight Eastern (started by the API worker at 12:01 AM on
//   sale nights), so the file changes on each sale's first day and the day
//   after its last.
// - condition is "used", like merchant-feed.xml (the phone box is opened to
//   debloat it); OpenAI asks for used or refurbished to be stated.
// - Checkout stays on our site: no is_eligible_checkout.
//
//   node tools/chatgpt-feed.mjs                     write today's feed
//   node tools/chatgpt-feed.mjs --date 2026-11-28   write the feed as of that day
//   node tools/chatgpt-feed.mjs --check             exit 1 if chatgpt-feed.csv is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodePrice, NODE_REGULAR_CENTS, NODE_SALE_CENTS } from '../worker/src/node-price.js';
import { metaImageUrls } from './meta-catalog.mjs';
import { aggregateFromPage } from './node-reviews.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.easternshore.ai';

export const ITEM = {
  item_id: 'SN-GEN2', // same id as merchant-feed.xml
  url: `${SITE}/node.html`,
  brand: 'Eastern Shore AI',
  seller_name: 'Eastern Shore AI',
  seller_url: `${SITE}/`,
  availability: 'in_stock',
  condition: 'used',
  product_category: 'Home & Garden > Emergency Preparedness > Emergency Tools & Kits',
  // the hard case the kit comes in (testing.html); no net weight is published, so no `weight`
  dimensions: { length: '14.96', width: '11.81', height: '5.51', unit: 'in' },
  target_countries: ['US'],
  store_country: 'US',
  is_eligible_search: true,
  // free ground shipping to the 48 contiguous states + DC (the only places we ship)
  shipping_price: '0.00 USD',
  // terms.html's return section (Google-verified): 30 days, by mail
  accepts_returns: true,
  return_deadline_in_days: 30,
  return_policy: `${SITE}/terms.html`,
  seller_privacy_policy: `${SITE}/privacy.html`,
  seller_tos: `${SITE}/terms.html`
};

// The order fields are written in (OpenAI's schema order).
export const FIELDS = [
  'item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability',
  'price', 'sale_price', 'target_countries', 'store_country', 'is_eligible_search', 'condition',
  'product_category', 'dimensions', 'additional_image_urls', 'seller_url', 'shipping_price', 'accepts_returns',
  'return_deadline_in_days', 'return_policy', 'review_count', 'star_rating', 'seller_privacy_policy', 'seller_tos'
];

const usd = (cents) => `${(cents / 100).toFixed(2)} USD`;

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// <g:title> and <g:description> from merchant-feed.xml
export function textFromGoogleFeed(xml) {
  const pick = (tag, max) => {
    const m = xml.match(new RegExp(`<g:${tag}>([\\s\\S]*?)</g:${tag}>`));
    const text = m ? unescapeXml(m[1]).replace(/\s+/g, ' ').trim() : '';
    if (!text || /<[a-z]/i.test(text) || text.length > max) {
      throw new Error(`chatgpt-feed: merchant-feed.xml <g:${tag}> is missing, has HTML, or is over ${max} characters`);
    }
    return text;
  };
  return { title: pick('title', 150), description: pick('description', 5000) };
}

// The sale running now (Eastern date), or null between sales and after the last.
export function activeSale(now = new Date()) {
  return nodePrice(now).sale;
}

function csvField(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// How OpenAI wants each value written in a CSV cell.
function cell(value) {
  if (Array.isArray(value)) return null; // handled per field below
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value ?? '';
}

// The item as an object (what goes in the row), for tests and the CSV writer.
function reviewFields(nodeHtml) {
  const agg = aggregateFromPage(nodeHtml);
  return agg && agg.count > 0
    ? { review_count: agg.count, star_rating: agg.average.toFixed(2) }
    : { review_count: '', star_rating: '' };
}

// nodeHtml: node.html, whose Product JSON-LD carries the approved reviews' aggregateRating
// (tools/node-reviews.mjs); without one, review_count and star_rating stay empty (unknown).
export function buildItem(googleFeedXml, now = new Date(), nodeHtml = '') {
  const { title, description } = textFromGoogleFeed(googleFeedXml);
  const images = metaImageUrls();
  const sale = activeSale(now);
  const item = {
    ...ITEM,
    title,
    description,
    image_url: images[0],
    additional_image_urls: images.slice(1),
    price: usd(NODE_REGULAR_CENTS),
    sale_price: sale ? usd(NODE_SALE_CENTS) : '',
    ...reviewFields(nodeHtml)
  };
  const extra = Object.keys(item).filter((k) => !FIELDS.includes(k));
  if (extra.length) throw new Error(`chatgpt-feed: fields missing from FIELDS: ${extra.join(', ')}`);
  return item;
}

export function buildFeed(googleFeedXml, now = new Date(), nodeHtml = '') {
  const item = buildItem(googleFeedXml, now, nodeHtml);
  const values = FIELDS.map((f) => {
    const v = item[f];
    if (f === 'target_countries' || f === 'dimensions') return JSON.stringify(v);
    if (f === 'additional_image_urls') return v.join(',');
    return cell(v);
  });
  return `${FIELDS.join(',')}\n${values.map(csvField).join(',')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dateArg = args[args.indexOf('--date') + 1];
  // midday UTC is the same calendar day in Eastern time
  const now = args.includes('--date') ? new Date(`${dateArg}T16:00:00Z`) : new Date();

  const feedPath = join(ROOT, 'chatgpt-feed.csv');
  const after = buildFeed(readFileSync(join(ROOT, 'merchant-feed.xml'), 'utf8'), now, readFileSync(join(ROOT, 'node.html'), 'utf8'));
  const before = existsSync(feedPath) ? readFileSync(feedPath, 'utf8') : '';
  const sale = activeSale(now);
  const state = sale ? `${sale.name} running, sale_price ${usd(NODE_SALE_CENTS)}` : `no sale running, ${usd(NODE_REGULAR_CENTS)}`;

  if (after === before) {
    console.log(`ChatGPT feed: ${state}. Already up to date.`);
    return;
  }
  if (check) {
    console.log(`ChatGPT feed: ${state}. Out of date: chatgpt-feed.csv`);
    process.exit(1);
  }
  writeFileSync(feedPath, after);
  console.log(`ChatGPT feed: ${state}. Updated: chatgpt-feed.csv`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
