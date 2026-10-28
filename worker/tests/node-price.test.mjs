// Survival Node price by date (src/node-price.js): what checkout charges, that
// the page script uses the same sale windows, and the tool that keeps the
// static pages and Merchant feed on the right price.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { nodePrice, currentOrNextSale, NODE_SALES } from '../src/node-price.js';
import { applyNodePage, applyBuyPage, applyFeed } from '../../tools/node-price-pages.mjs';

const root = new URL('../../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

test('sale price only inside a sale window, by Eastern date', () => {
  const cases = [
    ['2026-10-31T23:59:00-04:00', 24999, 'halloween'],
    ['2026-11-01T00:00:30-04:00', 34999, null],
    ['2026-11-08T23:59:00-05:00', 34999, null],
    ['2026-11-09T00:00:30-05:00', 24999, 'thanksgiving'],
    ['2026-11-26T23:59:00-05:00', 24999, 'thanksgiving'],
    ['2026-11-27T00:00:30-05:00', 34999, null],
    ['2026-12-01T00:00:30-05:00', 24999, 'christmas'],
    ['2026-12-25T23:59:00-05:00', 24999, 'christmas'],
    ['2026-12-26T00:00:30-05:00', 34999, null]
  ];
  for (const [when, cents, key] of cases) {
    const { cents: got, sale } = nodePrice(new Date(when));
    assert.equal(got, cents, when);
    assert.equal(sale?.key ?? null, key, when);
  }
  assert.equal(currentOrNextSale(new Date('2026-11-03T12:00:00-05:00')).key, 'thanksgiving');
  assert.equal(currentOrNextSale(new Date('2026-12-26T12:00:00-05:00')), null);
});

test('seasonal-sale.js uses the same sale windows as checkout', () => {
  const src = read('seasonal-sale.js');
  const page = [...src.matchAll(/key: '([^']+)', name: '([^']+)', start: '([^']+)', end: '([^']+)',\s*endsLong: '([^']+)'/g)]
    .map(([, key, name, start, end, endsLong]) => ({ key, name, start, end, endsLong }));
  assert.deepEqual(page, NODE_SALES);
});

test('checkout charges $249.99 in a sale and $349.99 between sales', async (t) => {
  const amounts = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(String(input), 'https://api.stripe.com/v1/checkout/sessions');
    amounts.push(new URLSearchParams(init.body).get('line_items[0][price_data][unit_amount]'));
    return Response.json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' });
  };
  t.after(() => { globalThis.fetch = original; mock.timers.reset(); });
  const env = { ALLOWED_ORIGINS: 'https://www.easternshore.ai', STRIPE_SECRET_KEY: 'sk_test_x' };
  const checkout = () => worker.fetch(new Request('https://worker.example/api/survival-node-checkout', {
    method: 'POST', headers: { Origin: 'https://www.easternshore.ai', 'Content-Type': 'application/json' },
    body: JSON.stringify({ termsAccepted: true })
  }), env, { waitUntil() {} });

  for (const when of ['2026-11-12T15:00:00-05:00', '2026-11-28T15:00:00-05:00']) {
    mock.timers.enable({ apis: ['Date'], now: Date.parse(when) });
    const res = await checkout();
    assert.equal(res.status, 200);
    mock.timers.reset();
  }
  assert.deepEqual(amounts, ['24999', '34999']);
});

function offerOf(html) {
  const [, block] = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  const find = (n) => (!n || typeof n !== 'object') ? null : n['@type'] === 'Product' ? n : Object.values(n).map(find).find(Boolean);
  return find(JSON.parse(block)).offers;
}

test('node-price-pages switches node.html between sale and regular price', () => {
  const thanksgiving = NODE_SALES.find((s) => s.key === 'thanksgiving');
  const regular = applyNodePage(read('node.html'), null);
  const sale = applyNodePage(regular, thanksgiving);
  assert.equal(applyNodePage(sale, null), regular, 'round trip');

  assert.match(regular, /<html lang="en" data-price="regular">/);
  assert.match(regular, /<meta property="product:price:amount" content="349.99" \/>/);
  assert.match(regular, /and Faraday bags\. \$349\.99 with free shipping\."/);
  const regularOffer = offerOf(regular);
  assert.equal(regularOffer.price, '349.99');
  assert.equal(regularOffer.priceSpecification, undefined);
  assert.equal(regularOffer.availability, 'https://schema.org/InStock');

  assert.match(sale, /<html lang="en" data-price="sale">/);
  assert.match(sale, /<meta property="product:price:amount" content="249.99" \/>/);
  const saleOffer = offerOf(sale);
  assert.equal(saleOffer.price, '249.99');
  assert.equal(saleOffer.priceValidUntil, '2026-11-26');
  assert.equal(saleOffer.priceSpecification.price, '349.99');

  assert.match(applyBuyPage(read('buynode.html'), null), /<html lang="en" data-price="regular">/);
});

test('node-price-pages gives the feed the running or next sale window', () => {
  const feed = read('merchant-feed.xml');
  const [halloween, thanksgiving] = NODE_SALES;
  const inSale = applyFeed(feed, halloween);
  assert.match(inSale, /<g:price>349\.99 USD<\/g:price>\n {6}<g:sale_price>249\.99 USD<\/g:sale_price>\n {6}<g:sale_price_effective_date>2026-10-01T00:00-0400\/2026-10-31T23:59-0400<\/g:sale_price_effective_date>\n/);
  assert.match(applyFeed(inSale, thanksgiving), /<g:sale_price_effective_date>2026-11-09T00:00-0500\/2026-11-26T23:59-0500<\/g:sale_price_effective_date>/);
  const none = applyFeed(inSale, null);
  assert.doesNotMatch(none, /<g:sale_price/);
  assert.match(none, /<g:price>349\.99 USD<\/g:price>/);
  assert.equal((applyFeed(applyFeed(inSale, thanksgiving), thanksgiving).match(/<g:sale_price>/g) || []).length, 1);
});
