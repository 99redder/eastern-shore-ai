// Meta (Facebook / Instagram Shop) catalog feed for the Survival Node:
// meta-catalog.csv, served at https://www.easternshore.ai/meta-catalog.csv and
// fetched on a schedule by Commerce Manager.
//
// Price and sale dates come from the sale schedule in worker/src/node-price.js,
// the same source checkout and tools/node-price-pages.mjs use. The description
// and photos come from the Product JSON-LD in node.html. Meta takes one sale
// window per item, so the feed carries the running sale or the next one, and
// leaves both sale columns blank once the last sale has ended. Meta switches
// prices on the dates itself; the feed only changes when a window passes.
// .github/workflows/node-price.yml runs this just after midnight Eastern.
//
// Columns follow Meta's catalog field reference:
// https://developers.facebook.com/docs/commerce-platform/catalog/fields/
//
//   node tools/meta-catalog.mjs                     write today's feed
//   node tools/meta-catalog.mjs --date 2026-12-05   write the feed as of that day
//   node tools/meta-catalog.mjs --check             exit 1 if meta-catalog.csv is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentOrNextSale, NODE_REGULAR_CENTS, NODE_SALE_CENTS } from '../worker/src/node-price.js';

// Same values as the item first added by hand in Commerce Manager. Meta ignores
// every copy of an id that appears more than once in a catalog, so delete the
// hand-made item before this feed's first upload.
export const ITEM = {
  id: 'survival-node-gen2',
  title: 'Survival Node Gen 2 - Offline AI Emergency Preparedness Kit',
  link: 'https://www.easternshore.ai/node.html',
  availability: 'in stock',
  // Meta's listing says new; merchant-feed.xml (Google) says used on purpose.
  condition: 'new',
  brand: 'Eastern Shore AI',
  // Facebook product category 1930
  fb_product_category: 'Sporting Goods > Emergency Preparedness > Emergency Tools & Kits'
};

export const COLUMNS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'sale_price_effective_date', 'link', 'image_link', 'additional_image_link', 'brand',
  'fb_product_category'
];

const usd = (cents) => `${(cents / 100).toFixed(2)} USD`;

// "-05:00" / "-04:00" for a day in Eastern time (read at midday, after any DST change)
export function easternOffset(day) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === 'timeZoneName').value;
  return name.replace('GMT', '');
}

// Meta's format: two ISO 8601 timestamps, start/end, e.g.
// 2020-04-30T09:30-08:00/2020-05-30T23:59-08:00. Sale days are inclusive.
export function saleEffectiveDate(sale) {
  return `${sale.start}T00:00${easternOffset(sale.start)}/${sale.end}T23:59${easternOffset(sale.end)}`;
}

// The Product object in node.html's JSON-LD (top level, in @graph, or in an array).
export function productFromPage(html) {
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(body); } catch { continue; }
    const nodes = Array.isArray(data) ? data : (data['@graph'] || [data]);
    const product = nodes.find((n) => n && n['@type'] === 'Product');
    if (!product) continue;
    const description = String(product.description || '').trim();
    const images = (Array.isArray(product.image) ? product.image : [product.image]).filter(Boolean);
    if (!description || /<[a-z]/i.test(description) || description.length > 9999) {
      throw new Error('meta-catalog: node.html Product description is missing, has HTML, or is over 9,999 characters');
    }
    if (!images.length || !images.every((u) => /^https:\/\//.test(u))) {
      throw new Error('meta-catalog: node.html Product images are missing or not absolute https URLs');
    }
    return { description, images };
  }
  throw new Error("meta-catalog: couldn't find the Product JSON-LD in node.html");
}

function csvField(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildFeed(html, now = new Date()) {
  const { description, images } = productFromPage(html);
  const sale = currentOrNextSale(now);
  const row = {
    ...ITEM,
    description,
    price: usd(NODE_REGULAR_CENTS),
    sale_price: sale ? usd(NODE_SALE_CENTS) : '',
    sale_price_effective_date: sale ? saleEffectiveDate(sale) : '',
    image_link: images[0],
    // Meta: a comma-separated list, the whole list in double quotes
    additional_image_link: images.slice(1).join(', ')
  };
  return `${COLUMNS.join(',')}\n${COLUMNS.map((c) => csvField(row[c])).join(',')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dateArg = args[args.indexOf('--date') + 1];
  // midday UTC is the same calendar day in Eastern time
  const now = args.includes('--date') ? new Date(`${dateArg}T16:00:00Z`) : new Date();

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const feedPath = join(root, 'meta-catalog.csv');
  const after = buildFeed(readFileSync(join(root, 'node.html'), 'utf8'), now);
  const before = existsSync(feedPath) ? readFileSync(feedPath, 'utf8') : '';
  const sale = currentOrNextSale(now);
  const state = sale ? `${sale.name} ${saleEffectiveDate(sale)}` : 'no sale price (no sale running or coming up)';

  if (after === before) {
    console.log(`Meta catalog feed: ${state}. Already up to date.`);
    return;
  }
  if (check) {
    console.log(`Meta catalog feed: ${state}. Out of date: meta-catalog.csv`);
    process.exit(1);
  }
  writeFileSync(feedPath, after);
  console.log(`Meta catalog feed: ${state}. Updated: meta-catalog.csv`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
