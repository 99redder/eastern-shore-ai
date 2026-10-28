// Puts the Survival Node price that Google and no-JS visitors read on today's
// sale schedule (worker/src/node-price.js): node.html's meta description,
// product:price:amount and Product JSON-LD offer, <html data-price> on
// node.html and buynode.html, and merchant-feed.xml's sale price dates.
// Visitors with JS and checkout switch at midnight on their own; this catches
// the static copies up. .github/workflows/node-price.yml runs it just after
// midnight Eastern and commits any change.
//
//   node tools/node-price-pages.mjs                     apply today's price
//   node tools/node-price-pages.mjs --date 2026-11-01   apply that day's price
//   node tools/node-price-pages.mjs --check             exit 1 if out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodePrice, currentOrNextSale, NODE_REGULAR_CENTS, NODE_SALE_CENTS } from '../worker/src/node-price.js';

const REGULAR = (NODE_REGULAR_CENTS / 100).toFixed(2);
const SALE = (NODE_SALE_CENTS / 100).toFixed(2);

function replaceOnce(text, pattern, replacement, what) {
  if (!pattern.test(text)) throw new Error(`node-price-pages: couldn't find ${what}`);
  return text.replace(pattern, replacement);
}

function setPriceState(html, sale) {
  return replaceOnce(html, /<html lang="en"(?: data-price="(?:sale|regular)")?>/, `<html lang="en" data-price="${sale ? 'sale' : 'regular'}">`, '<html> tag');
}

export function applyNodePage(html, sale) {
  const price = sale ? SALE : REGULAR;
  html = setPriceState(html, sale);
  html = replaceOnce(html, /(<meta name="description" content="[^"]*?)\$\d+\.\d\d( with free shipping\.")/, (_, head, tail) => `${head}$${price}${tail}`, 'meta description price');
  html = replaceOnce(html, /<meta property="product:price:amount" content="[\d.]+" \/>/, `<meta property="product:price:amount" content="${price}" />`, 'product:price:amount');
  const offer = sale
    ? [
        `"description": "Regularly $${REGULAR}. Now $${SALE} for a limited time while supplies last — save $100.",`,
        `"price": "${SALE}",`,
        '"priceCurrency": "USD",',
        `"priceValidUntil": "${sale.end}",`,
        '"priceSpecification": {',
        '  "@type": "UnitPriceSpecification",',
        '  "priceType": "https://schema.org/StrikethroughPrice",',
        `  "price": "${REGULAR}",`,
        '  "priceCurrency": "USD"',
        '},'
      ]
    : [
        `"description": "$${REGULAR} with free shipping to the continental U.S.",`,
        `"price": "${REGULAR}",`,
        '"priceCurrency": "USD",'
      ];
  return replaceOnce(
    html,
    /("@type": "Offer",\n( +)"name": "Survival Node Gen 2",\n)[\s\S]*?(\n +"availability":)/,
    (_, head, indent, tail) => head + offer.map((line) => indent + line).join('\n') + tail,
    'Product JSON-LD offer'
  );
}

export function applyBuyPage(html, sale) {
  return setPriceState(html, sale);
}

// "-0400" / "-0500" for a day in Eastern time (read at midday, after any DST change)
function easternOffset(day) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === 'timeZoneName').value;
  return name.replace('GMT', '').replace(':', '');
}

// Google takes one sale window per item, so the feed carries the running sale
// or the next one. Between sales Google charges the regular price until the
// window opens; after the last sale the sale price is dropped.
export function applyFeed(xml, upcoming) {
  xml = xml.replace(/\n *<g:sale_price>[^<]*<\/g:sale_price>/, '').replace(/\n *<g:sale_price_effective_date>[^<]*<\/g:sale_price_effective_date>/, '');
  if (!upcoming) return xml;
  const dates = `${upcoming.start}T00:00${easternOffset(upcoming.start)}/${upcoming.end}T23:59${easternOffset(upcoming.end)}`;
  return replaceOnce(
    xml,
    /(\n( *)<g:price>[^<]*<\/g:price>)/,
    (_, line, indent) => `${line}\n${indent}<g:sale_price>${SALE} USD</g:sale_price>\n${indent}<g:sale_price_effective_date>${dates}</g:sale_price_effective_date>`,
    'g:price'
  );
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dateArg = args[args.indexOf('--date') + 1];
  // midday UTC is the same calendar day in Eastern time
  const now = args.includes('--date') ? new Date(`${dateArg}T16:00:00Z`) : new Date();
  const { sale } = nodePrice(now);
  const upcoming = currentOrNextSale(now);

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = [
    ['node.html', (text) => applyNodePage(text, sale)],
    ['buynode.html', (text) => applyBuyPage(text, sale)],
    ['merchant-feed.xml', (text) => applyFeed(text, upcoming)]
  ];
  const changed = [];
  for (const [name, apply] of files) {
    const path = join(root, name);
    const before = readFileSync(path, 'utf8');
    const after = apply(before);
    if (after === before) continue;
    changed.push(name);
    if (!check) writeFileSync(path, after);
  }
  const state = sale ? `$${SALE} (${sale.name} through ${sale.end})` : `$${REGULAR} (no sale)`;
  console.log(`Survival Node price: ${state}. ${changed.length ? `${check ? 'Out of date' : 'Updated'}: ${changed.join(', ')}` : 'Pages already match.'}`);
  if (check && changed.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
