// One-tap Survival Node reviews (src/reviews.js) end to end through src/index.js:
// the review request email's star links, rate.html's API, the staff alert, admin
// approval, the public list, and tools/node-reviews.mjs baking approved reviews
// into node.html and the ChatGPT feed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { publicName } from '../src/reviews.js';
import { applyReviews, aggregateFromPage, reviewsSectionHtml } from '../../tools/node-reviews.mjs';
import { applyNodePage } from '../../tools/node-price-pages.mjs';
import { buildItem } from '../../tools/chatgpt-feed.mjs';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const SITE = 'https://www.easternshore.ai';
const WEBHOOK_SECRET = 'whsec_test_only';
const root = new URL('../../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

function createDb() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) { if (!file.startsWith('0023_')) throw e; }
  }
  DB.sqlite.exec("INSERT OR IGNORE INTO order_number_sequence (seq_key, last_value) VALUES ('survival_node_orders', 1000)");
  return DB;
}
function fakeEmail() {
  const sent = [];
  return { sent, async send(message) { sent.push(message); return { messageId: `cf-${sent.length}` }; } };
}
const baseEnv = () => ({
  DB: createDb(), EMAIL: fakeEmail(),
  ALLOWED_ORIGINS: 'https://easternshore.ai,https://www.easternshore.ai',
  TO_EMAIL: 'owner@inbox.example', FROM_EMAIL: 'noreply@easternshore.ai', ORDERS_FROM_EMAIL: 'orders@easternshore.ai',
  ALERTS_FROM_EMAIL: 'alerts@easternshore.ai', BCC_EMAIL: 'emailconfirm@easternshore.ai',
  ADMIN_PASSWORD: 'admin-test-password', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
});
const ctx = { waitUntil() {} };
const admin = { 'X-Admin-Password': 'admin-test-password' };
const post = (path, body, headers = {}) => new Request(`https://worker.example${path}`, { method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (path, headers = {}) => new Request(`https://worker.example${path}`, { headers: { Origin: SITE, ...headers } });
function quiet(t) { for (const l of ['error', 'warn', 'log']) { const o = console[l]; console[l] = () => {}; t.after(() => { console[l] = o; }); } }
function noNetwork(t) { const o = globalThis.fetch; globalThis.fetch = async (u) => { throw new Error(`unexpected network call: ${u}`); }; t.after(() => { globalThis.fetch = o; }); }

async function signedWebhook(event) {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://worker.example/api/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${ts},v1=${v1}` }, body: payload });
}

// A paid order taken through ack → shipping → delivered, ready for the review request.
async function deliveredOrder(env, id = 'cs_test_review_1', name = 'Mike Roberts') {
  const session = {
    id, payment_intent: `pi_${id}`, amount_total: 34999,
    customer_details: { email: 'mike@buyer.example', name, address: { state: 'MD' } },
    shipping_details: { name, address: { line1: '1 Main St', city: 'Salisbury', state: 'MD', postal_code: '21801', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node Base Kit' },
  };
  await worker.fetch(await signedWebhook({ id: `evt_${id}`, type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: session } }), env, ctx);
  const bookingId = env.DB.sqlite.prepare('SELECT id FROM bookings WHERE stripe_session_id = ?').get(id).id;
  for (const kind of ['ack', 'shipping', 'delivered']) {
    const res = await worker.fetch(post('/api/orders/send', { bookingId, kind, idempotencyKey: `${id}-${kind}`, trackingNumber: '9400100000000000000000', trackingProvider: 'usps' }, admin), env, ctx);
    assert.equal(res.status, 200, await res.clone().text());
  }
  env.EMAIL.sent.length = 0;
  return bookingId;
}

const tokenFrom = (text) => (text.match(/rate\.html\?t=([0-9a-f]{48})&r=\d/) || [])[1];

test('publicName: first name and last initial, or anonymous', () => {
  assert.equal(publicName('mike roberts', 'initial'), 'Mike R.');
  assert.equal(publicName('Ann', 'initial'), 'Ann');
  assert.equal(publicName('Mary Jo Smith', 'initial'), 'Mary S.');
  assert.equal(publicName('Mike Roberts', 'anonymous'), 'Verified buyer');
  assert.equal(publicName('', 'initial'), 'Verified buyer');
});

test('review email has five one-tap star links for the order, reused on every send', async (t) => {
  quiet(t); noNetwork(t);
  const env = baseEnv();
  const bookingId = await deliveredOrder(env);
  const preview = await (await worker.fetch(post('/api/orders/preview', { bookingId, kind: 'review' }, admin), env, ctx)).json();
  const token = tokenFrom(preview.html);
  assert.ok(token, 'preview has star links');
  for (const n of [1, 2, 3, 4, 5]) assert.ok(preview.html.includes(`rate.html?t=${token}&amp;r=${n}`) || preview.html.includes(`rate.html?t=${token}&r=${n}`), `star ${n}`);
  assert.match(preview.html, /Leave a Google Review/, 'Google link still offered to everyone');

  const res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'review', idempotencyKey: 'rv-1' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const mail = env.EMAIL.sent[0];
  assert.equal(tokenFrom(mail.html), token, 'same token as the preview');
  assert.match(mail.text, new RegExp(`★★★★★ 5: https://www\\.easternshore\\.ai/rate\\.html\\?t=${token}&r=5`));
  assert.match(mail.text, /Leave a Google review: https:\/\/www\.easternshore\.ai\/review/);
  assert.match(mail.text, /tap a star below/i);
  await worker.fetch(post('/api/orders/send', { bookingId, kind: 'review', idempotencyKey: 'rv-2' }, admin), env, ctx);
  assert.equal(tokenFrom(env.EMAIL.sent[1].html), token, 'a second request keeps the link');
  const rows = env.DB.sqlite.prepare('SELECT status, rating, customer_email FROM product_reviews').all().map((r) => ({ ...r }));
  assert.deepEqual(rows, [{ status: 'invited', rating: null, customer_email: 'mike@buyer.example' }]);
});

test('rate.html API: one tap saves a rating, comments and names are optional, staff hear about it', async (t) => {
  quiet(t); noNetwork(t);
  const env = baseEnv();
  const bookingId = await deliveredOrder(env);
  const token = tokenFrom((await (await worker.fetch(post('/api/orders/preview', { bookingId, kind: 'review' }, admin), env, ctx)).json()).html);

  const bad = await worker.fetch(get('/api/review?t=deadbeef'), env, ctx);
  assert.equal(bad.status, 404);
  const info = await (await worker.fetch(get(`/api/review?t=${token}`), env, ctx)).json();
  assert.equal(info.firstName, 'Mike');
  assert.equal(info.initialName, 'Mike R.');
  assert.equal(info.rating, null);

  // The tap from the email: rating only.
  let res = await worker.fetch(post('/api/review', { t: token, rating: 2 }), env, ctx);
  let data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.rating, 2);
  assert.equal(data.status, 'pending');
  assert.equal(env.EMAIL.sent.length, 1, 'staff alert');
  const alert = env.EMAIL.sent[0];
  assert.deepEqual(alert.to, ['owner@inbox.example']);
  assert.match(alert.subject, /^Low rating: Survival Node review ★★☆☆☆ from Mike R\. \(order #\d+\)$/);
  assert.match(alert.text, /Show every genuine rating, low ones included/);

  // Then a comment and the anonymous choice (alerts are held back for 10 minutes).
  data = await (await worker.fetch(post('/api/review', { t: token, rating: 4, comment: 'Solid kit.\nMaps work offline.', nameChoice: 'anonymous' }), env, ctx)).json();
  assert.equal(data.rating, 4);
  assert.equal(data.comment, 'Solid kit.\nMaps work offline.');
  assert.equal(data.publicName, 'Verified buyer');
  assert.equal(env.EMAIL.sent.length, 1, 'no second alert within 10 minutes');

  // Re-tapping the same star changes nothing; a rating-only tap keeps the comment.
  data = await (await worker.fetch(post('/api/review', { t: token, rating: 4 }), env, ctx)).json();
  assert.equal(data.saved, false);
  assert.equal(data.comment, 'Solid kit.\nMaps work offline.');

  assert.equal((await worker.fetch(post('/api/review', { t: token, rating: 6 }), env, ctx)).status, 400);
  assert.equal((await worker.fetch(post('/api/review', { t: token, rating: 5, comment: 'x'.repeat(2001) }), env, ctx)).status, 400);
  assert.equal((await worker.fetch(post('/api/review', { t: token, rating: 5, nameChoice: 'full' }), env, ctx)).status, 400);
  const foreign = new Request('https://worker.example/api/review', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, rating: 5 }) });
  assert.equal((await worker.fetch(foreign, env, ctx)).status, 403);
});

test('admin approves; only approved reviews are public; an edit goes back for approval', async (t) => {
  quiet(t); noNetwork(t);
  const env = baseEnv();
  const bookingId = await deliveredOrder(env);
  const token = tokenFrom((await (await worker.fetch(post('/api/orders/preview', { bookingId, kind: 'review' }, admin), env, ctx)).json()).html);
  await worker.fetch(post('/api/review', { t: token, rating: 5, comment: 'Great <b>kit</b>' }), env, ctx);

  assert.equal((await worker.fetch(get('/api/reviews'), env, ctx)).status, 401, 'admin only');
  let list = await (await worker.fetch(get('/api/reviews', admin), env, ctx)).json();
  assert.equal(list.reviews.length, 1);
  assert.equal(list.reviews[0].status, 'pending');
  assert.equal(list.approvedCount, 0);
  let pub = await (await worker.fetch(get('/api/reviews/public'), env, ctx)).json();
  assert.equal(pub.count, 0, 'pending reviews are not public');

  const id = list.reviews[0].id;
  assert.equal((await worker.fetch(post('/api/reviews/status', { id, status: 'approved' }, admin), env, ctx)).status, 200);
  pub = await (await worker.fetch(get('/api/reviews/public'), env, ctx)).json();
  assert.equal(pub.count, 1);
  assert.equal(pub.average, 5);
  assert.deepEqual(Object.keys(pub.reviews[0]).sort(), ['comment', 'date', 'name', 'rating']);
  assert.equal(pub.reviews[0].name, 'Mike R.');
  assert.ok(!JSON.stringify(pub).includes('mike@buyer.example'), 'no email addresses in public data');

  await worker.fetch(post('/api/review', { t: token, rating: 3 }), env, ctx);
  pub = await (await worker.fetch(get('/api/reviews/public'), env, ctx)).json();
  assert.equal(pub.count, 0, 'edited review waits for approval again');
  assert.equal((await worker.fetch(post('/api/reviews/status', { id, status: 'deleted' }, admin), env, ctx)).status, 400);
});

const reviewsReply = (n) => ({
  ok: true, minToShow: 3,
  reviews: Array.from({ length: n }, (_, i) => ({ rating: i === 1 ? 3 : 5, comment: i === 0 ? 'Works <script>alert(1)</script> & more' : '', name: i === 2 ? 'Verified buyer' : `Buyer ${i} X.`, date: `2026-11-2${i}` })),
});

test('node-reviews: nothing under 3 approved; section, JSON-LD and feed rating at 3+', () => {
  const html = read('node.html');
  assert.equal(applyReviews(html, reviewsReply(2)), html, 'below the threshold nothing changes');
  assert.equal(reviewsSectionHtml(reviewsReply(2)), '');

  const withReviews = applyReviews(html, reviewsReply(3));
  assert.match(withReviews, /<section class="card site-reviews" id="reviews"/);
  assert.match(withReviews, /4\.3 out of 5<\/strong> from 3 verified buyers/);
  assert.match(withReviews, /Works &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; more/, 'comments are escaped');
  assert.doesNotMatch(withReviews.split('id="reviews"')[1].split('</section>')[0], /<script/);
  assert.deepEqual(aggregateFromPage(withReviews), { count: 3, average: 4.3 });
  const product = [...withReviews.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, b]) => JSON.parse(b)).flatMap((d) => (Array.isArray(d) ? d : d['@graph'] || [d])).find((x) => x['@type'] === 'Product');
  assert.equal(product.aggregateRating.reviewCount, 3);
  assert.equal(product.aggregateRating.ratingValue, '4.3');
  assert.equal(product.review.length, 2, 'anonymous reviews count but are not listed');
  assert.equal(product.review[0].reviewBody, 'Works <script>alert(1)</script> & more', 'comment survives intact in JSON-LD');
  assert.doesNotMatch(withReviews.split('"review": ')[1].split('\n')[0], /<\/script>/i, 'no raw </script> inside the JSON-LD');

  assert.equal(applyReviews(withReviews, reviewsReply(3)), withReviews, 'idempotent');
  assert.equal(applyReviews(withReviews, reviewsReply(1)), html, 'removed again below the threshold');
  // The nightly price tool still finds its offer block with reviews present.
  assert.match(applyNodePage(withReviews, null), /"price": "349\.99"/);

  const item = buildItem(read('merchant-feed.xml'), new Date('2026-11-17T16:00:00Z'), withReviews);
  assert.equal(item.review_count, 3);
  assert.equal(item.star_rating, '4.30');
  const none = buildItem(read('merchant-feed.xml'), new Date('2026-11-17T16:00:00Z'), html);
  assert.equal(none.review_count, '');
});
