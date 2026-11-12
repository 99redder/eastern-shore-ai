// Meta (Facebook / Instagram Shop) catalog feed for the Survival Node:
// meta-catalog.csv, served at https://www.easternshore.ai/meta-catalog.csv and
// fetched on a schedule by Commerce Manager.
//
// Price and sale dates come from the sale schedule in worker/src/node-price.js,
// the same source checkout and tools/node-price-pages.mjs use. The description
// comes from the Product JSON-LD in node.html. The photos are META_IMAGES below,
// Meta's own list: node.html's JSON-LD keeps the 4 photos Google reads (and
// merchant-feed.xml mirrors), so adding photos there would change Google. Meta takes one sale
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

// The full Gen 2 photo set, in the order of the hand-made Commerce Manager item's
// 15 photos. The first is image_link; the rest go in additional_image_link.
// Paths are relative to the repo root (served from https://www.easternshore.ai/).
export const META_IMAGES = [
  'images/carousel/entirenode/wholekit-gen2.jpg',                   // 1 open case, whole kit, white background
  'images/carousel/entirenode/survival-node-kit-closed-white.jpg',  // 2 everything laid out, case closed
  'images/carousel/upgrades/faraday2.jpg',                          // 3 Faraday bags with battery and phone
  'images/carousel/solarbattery/solar-battery-panel.jpg',           // 4 solar battery, front
  'images/carousel/solarbattery/solar-battery-cables.jpg',          // 5 solar battery, back with three cables
  'images/carousel/case/case3.jpg',                                 // 6 empty hard case, open
  'images/carousel/case/padlock-keys.jpg',                          // 7 padlock with two keys
  'images/carousel/phone/home-screen.jpg',                          // 8 phone home screen
  'images/carousel/aichat/rainwater-chat.jpg',                      // 9 AI chat, rainwater question (Qwen3.5-4B)
  'images/carousel/maps/map-delmarva.jpg',                          // 10 offline map, Delmarva
  'images/carousel/maps/map-salisbury.jpg',                         // 11 offline map, Salisbury + hospital card
  'images/carousel/usersguide/guide-home.jpg',                      // 12 User Guide home
  'images/carousel/usersguide/guide-first-steps.jpg',               // 13 User Guide, First Steps
  'images/carousel/usersguide/guide-6-month.jpg',                   // 14 User Guide, 6-Month Readiness Checklist
  'images/carousel/phone/background.jpg'                            // 15 Survival Node Gen 2 logo wallpaper
];
const SITE = 'https://www.easternshore.ai/';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Meta's limits (catalog field reference): JPEG or PNG, at least 500 x 500 px,
// up to 8 MB; up to 50 additional images; additional_image_link max 2000 characters.
export const IMAGE_LIMITS = { minPx: 500, maxBytes: 8 * 1024 * 1024, maxAdditional: 50, maxAdditionalChars: 2000 };

// Format and pixel size from the file header (PNG IHDR, or the JPEG SOF marker).
export function imageInfo(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += marker === 0xff ? 1 : 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Throws if a photo is missing or breaks Meta's limits; returns the photo URLs.
export function metaImageUrls(paths = META_IMAGES, root = ROOT) {
  const problems = [];
  for (const path of paths) {
    const file = join(root, path);
    if (!existsSync(file)) { problems.push(`${path}: file not found`); continue; }
    const buf = readFileSync(file);
    const info = imageInfo(buf);
    if (!info) problems.push(`${path}: not a JPEG or PNG`);
    else if (info.width < IMAGE_LIMITS.minPx || info.height < IMAGE_LIMITS.minPx) problems.push(`${path}: ${info.width}x${info.height}, under 500 x 500`);
    if (buf.length > IMAGE_LIMITS.maxBytes) problems.push(`${path}: ${(buf.length / 1048576).toFixed(1)} MB, over 8 MB`);
  }
  const urls = paths.map((p) => SITE + p);
  if (urls.length - 1 > IMAGE_LIMITS.maxAdditional) problems.push(`${urls.length - 1} additional images, over Meta's 50`);
  const additional = urls.slice(1).join(', ');
  if (additional.length > IMAGE_LIMITS.maxAdditionalChars) problems.push(`additional_image_link is ${additional.length} characters, over Meta's 2000`);
  if (problems.length) throw new Error(`meta-catalog: photo problems:\n  ${problems.join('\n  ')}`);
  return urls;
}

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
    if (product) return product;
  }
  throw new Error("meta-catalog: couldn't find the Product JSON-LD in node.html");
}

function descriptionFromPage(html) {
  const description = String(productFromPage(html).description || '').trim();
  if (!description || /<[a-z]/i.test(description) || description.length > 9999) {
    throw new Error('meta-catalog: node.html Product description is missing, has HTML, or is over 9,999 characters');
  }
  return description;
}

function csvField(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildFeed(html, now = new Date()) {
  const description = descriptionFromPage(html);
  const images = metaImageUrls();
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

  const feedPath = join(ROOT, 'meta-catalog.csv');
  const after = buildFeed(readFileSync(join(ROOT, 'node.html'), 'utf8'), now);
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
