// Customer and staff emails, end to end through src/index.js: a SQLite D1 with
// every migration applied, signed Stripe webhooks, and a fake Cloudflare EMAIL
// binding. Any network call other than a stubbed Stripe API fails the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { recordAskKBlocked, sendAskKDailySummary } from '../src/ask-k-claude.js';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const WEBHOOK_SECRET = 'whsec_test_only';
const SITE = 'https://www.easternshore.ai';

function createDb() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) {
      // 0023 seeds its sequence from existing orders; an empty test DB has none.
      if (!file.startsWith('0023_')) throw e;
    }
  }
  DB.sqlite.exec("INSERT OR IGNORE INTO order_number_sequence (seq_key, last_value) VALUES ('survival_node_orders', 1000)");
  return DB;
}

function fakeEmail({ fail = false } = {}) {
  const sent = [];
  return {
    sent,
    async send(message) {
      if (fail) throw Object.assign(new Error('service unavailable'), { code: 'E_INTERNAL_SERVER_ERROR' });
      sent.push(message);
      return { messageId: `cf-${sent.length}` };
    }
  };
}

function baseEnv(overrides = {}) {
  return {
    DB: createDb(),
    EMAIL: fakeEmail(),
    ALLOWED_ORIGINS: 'https://easternshore.ai,https://www.easternshore.ai',
    TO_EMAIL: 'owner@inbox.example',
    CC_EMAIL: 'k@agent.example',
    FROM_EMAIL: 'noreply@easternshore.ai',
    CONTACT_FROM_EMAIL: 'Eastern Shore AI <contact@easternshore.ai>',
    ORDERS_FROM_EMAIL: 'orders@easternshore.ai',
    ALERTS_FROM_EMAIL: 'alerts@easternshore.ai',
    BCC_EMAIL: 'emailconfirm@easternshore.ai',
    ADMIN_PASSWORD: 'admin-test-password',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides
  };
}

// Network guard: only the Stripe calls a test opts into are answered.
function guardNetwork(t, stripe = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    calls.push({ url, init });
    for (const [prefix, reply] of Object.entries(stripe)) {
      if (url.startsWith(prefix)) return Response.json(typeof reply === 'function' ? reply(url, init) : reply);
    }
    throw new Error(`unexpected network call in test: ${url}`);
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

function quietConsole(t) {
  for (const level of ['error', 'warn', 'log']) {
    const original = console[level];
    console[level] = () => {};
    t.after(() => { console[level] = original; });
  }
}

async function signedWebhook(event) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://worker.example/api/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${v1}` }, body: payload });
}

function checkoutCompleted(session) {
  return { id: `evt_${session.id}`, type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: session } };
}


// Every customer email uses the shared layout (src/email-layout.js): the small
// logo from our own site, the standard footer, no banner photos, and a
// plain-text part.
function assertStandardLayout(mail) {
  assert.match(mail.html, /<img src="https:\/\/www\.easternshore\.ai\/images\/esai-badge\.jpg" width="46" height="42"/, `${mail.subject}: logo`);
  assert.equal((mail.html.match(/<img /g) || []).length, 1, `${mail.subject}: only the logo image`);
  assert.match(mail.html, /Eastern Shore AI, LLC<\/strong> &middot; /, `${mail.subject}: footer`);
  assert.doesNotMatch(mail.html, /carousel\.jpg|linear-gradient|display:flex/, `${mail.subject}: old layout leftovers`);
  assert.ok(mail.text && mail.text.length > 40, `${mail.subject}: plain-text part`);
}

const ctx = { waitUntil() {} };
const post = (path, body, headers = {}) => new Request(`https://worker.example${path}`, {
  method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
});

test('contact form emails the owner with reply-to, CC and BCC', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const res = await worker.fetch(post('/api/contact', { name: 'Pat Buyer', email: 'pat@buyer.example', message: 'Do you ship to Maine?' }), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const [mail] = env.EMAIL.sent;
  assert.equal(env.EMAIL.sent.length, 1);
  assert.equal(mail.from, 'noreply@easternshore.ai');
  assert.deepEqual(mail.to, ['owner@inbox.example']);
  assert.deepEqual(mail.cc, ['k@agent.example']);
  assert.deepEqual(mail.bcc, ['emailconfirm@easternshore.ai']);
  assert.equal(mail.replyTo, 'pat@buyer.example');
  assert.match(mail.text, /Do you ship to Maine\?/);
});

test('Survival Node order webhook emails staff the order details', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const session = {
    id: 'cs_test_node_1', payment_intent: 'pi_test_1', amount_total: 49900,
    customer_details: { email: 'buyer@example.net', name: 'Sam Buyer', address: { state: 'MD' } },
    shipping_details: { name: 'Sam Buyer', address: { line1: '1 Main St', city: 'Salisbury', state: 'MD', postal_code: '21801', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node Base Kit', customer_phone: '4105550100' }
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(env.EMAIL.sent.length, 1);
  const [mail] = env.EMAIL.sent;
  assert.equal(mail.subject, '[Eastern Shore AI] New Survival Node order');
  assert.equal(mail.from, 'orders@easternshore.ai');
  assert.deepEqual(mail.to, ['owner@inbox.example']);
  assert.deepEqual(mail.bcc, ['emailconfirm@easternshore.ai']);
  assert.match(mail.text, /buyer@example\.net/);
  assert.match(mail.text, /Salisbury/);

  // Stripe retries the same event: no second email.
  await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(env.EMAIL.sent.length, 1);
});

test('lesson booking webhook emails the buyer a confirmation and staff a notice', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const session = {
    id: 'cs_test_lesson_1', payment_intent: 'pi_test_2', amount_total: 7500,
    customer_details: { email: 'learner@example.net', name: 'Lee Learner' },
    metadata: { service_type: 'lessons', service_label: 'AI Lesson (1 hour)', customer_name: 'Lee Learner', setup_date: '2026-11-05', setup_time: '10:00', preferred_contact_method: 'email' }
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const toBuyer = env.EMAIL.sent.find((m) => m.to.includes('learner@example.net'));
  const toStaff = env.EMAIL.sent.find((m) => m.subject === '[Eastern Shore AI] New paid booking');
  assert.ok(toBuyer, `buyer confirmation missing; sent: ${env.EMAIL.sent.map((m) => m.subject)}`);
  assert.ok(toStaff, 'staff booking notice missing');
  assert.equal(toBuyer.from, 'orders@easternshore.ai');
  assert.deepEqual(toBuyer.bcc, ['emailconfirm@easternshore.ai']);
  assert.ok(toBuyer.html && toBuyer.text, 'buyer confirmation should have HTML and text');
  assertStandardLayout(toBuyer);
  assert.match(toBuyer.html, /AI lessons and setup/);
  assert.deepEqual(toStaff.to, ['owner@inbox.example']);
});

test('non-CONUS order: refund issued and the buyer is emailed why', async (t) => {
  quietConsole(t);
  const calls = guardNetwork(t, {
    'https://api.stripe.com/v1/payment_intents/': { latest_charge: { balance_transaction: { fee: 1477 } } },
    'https://api.stripe.com/v1/refunds': { id: 're_test_1', status: 'succeeded' }
  });
  const env = baseEnv({ STRIPE_SECRET_KEY: 'sk_test_only' });
  const session = {
    id: 'cs_test_node_ak', payment_intent: 'pi_test_ak', amount_total: 49900,
    customer_details: { email: 'alaska@example.net', name: 'Al Aska', address: { state: 'AK' } },
    shipping_details: { name: 'Al Aska', address: { state: 'AK', city: 'Juneau', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit' }
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.url === 'https://api.stripe.com/v1/refunds'));
  assert.equal(env.EMAIL.sent.length, 1);
  assert.deepEqual(env.EMAIL.sent[0].to, ['alaska@example.net']);
  assert.match(env.EMAIL.sent[0].html, /AK|Alaska/);
  assert.match(env.EMAIL.sent[0].html, /mailto:contact@easternshore\.ai/);
  assert.doesNotMatch(env.EMAIL.sent[0].html, /contact\.html/);
  assertStandardLayout(env.EMAIL.sent[0]);
  assert.match(env.EMAIL.sent[0].text, /Refund issued: \$/);
});

test('admin order emails: sent once per draft, review email carries List-Unsubscribe', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const session = {
    id: 'cs_test_node_2', payment_intent: 'pi_test_3', amount_total: 49900,
    customer_details: { email: 'buyer2@example.net', name: 'Jo Buyer', address: { state: 'DE' } },
    shipping_details: { name: 'Jo Buyer', address: { line1: '2 Bay Rd', city: 'Dover', state: 'DE', postal_code: '19901', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node Base Kit' }
  };
  await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  env.EMAIL.sent.length = 0;
  const bookingId = env.DB.sqlite.prepare('SELECT id FROM bookings WHERE stripe_session_id = ?').get('cs_test_node_2').id;
  const admin = { 'X-Admin-Password': 'admin-test-password' };

  const send = (kind, key, extra = {}) => worker.fetch(post('/api/orders/send', { bookingId, kind, idempotencyKey: key, ...extra }, admin), env, ctx);

  // The same draft submitted again while the first send is still in flight
  // (double click, retried request): the second is suppressed, one email.
  const working = env.EMAIL;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  env.EMAIL = { sent: working.sent, async send(message) { const isFirst = !working.sent.length; working.sent.push(message); if (isFirst) await gate; return { messageId: 'cf-slow' }; } };
  const firstPending = send('ack', 'draft-ack-1');
  for (let i = 0; i < 400 && working.sent.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(working.sent.length, 1, 'first send should be in flight');
  const second = await send('ack', 'draft-ack-1');
  release();
  const first = await firstPending;
  env.EMAIL = working;
  assert.equal(first.status, 200, await first.clone().text());
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicateSuppressed, true);
  assert.equal(env.EMAIL.sent.length, 1);
  const ack = env.EMAIL.sent[0];
  assert.deepEqual(ack.from, { email: 'orders@easternshore.ai', name: 'Eastern Shore AI Orders' });
  assert.deepEqual(ack.to, ['buyer2@example.net']);
  assert.equal(ack.replyTo, 'contact@easternshore.ai');
  assert.deepEqual(ack.bcc, ['emailconfirm@easternshore.ai']);
  assert.ok(ack.html && ack.text);
  assertStandardLayout(ack);
  assert.match(ack.html, /Survival Node/);

  // Sending it again later is refused by the sent-at check.
  let res = await send('ack', 'draft-ack-2');
  assert.equal(res.status, 409);
  assert.equal(env.EMAIL.sent.length, 1);

  for (const [kind, key] of [['shipping', 'd-ship'], ['delivered', 'd-deliv'], ['review', 'd-review']]) {
    res = await send(kind, key, { trackingNumber: '9400100000000000000000', trackingProvider: 'usps' });
    assert.equal(res.status, 200, `${kind}: ${await res.clone().text()}`);
  }
  assert.equal(env.EMAIL.sent.length, 4);
  env.EMAIL.sent.forEach(assertStandardLayout);
  assert.match(env.EMAIL.sent[1].html, /Track on USPS/);
  assert.match(env.EMAIL.sent[2].html, /Getting Started/);
  const review = env.EMAIL.sent[3];
  assert.match(review.html, /Leave a Google Review/);
  assert.deepEqual(review.headers, { 'List-Unsubscribe': '<mailto:contact@easternshore.ai?subject=Unsubscribe%20from%20review%20requests>' });
  assert.equal(env.EMAIL.sent[0].headers, undefined);
});

test('admin order email: a failed send releases the draft so it can be retried', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const session = {
    id: 'cs_test_node_3', payment_intent: 'pi_test_4', amount_total: 49900,
    customer_details: { email: 'buyer3@example.net', name: 'Kim Buyer', address: { state: 'VA' } },
    shipping_details: { name: 'Kim Buyer', address: { line1: '3 Oak Ln', city: 'Norfolk', state: 'VA', postal_code: '23510', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit' }
  };
  await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  const bookingId = env.DB.sqlite.prepare('SELECT id FROM bookings WHERE stripe_session_id = ?').get('cs_test_node_3').id;
  const admin = { 'X-Admin-Password': 'admin-test-password' };
  const working = env.EMAIL;
  env.EMAIL = fakeEmail({ fail: true });
  let res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'ack', idempotencyKey: 'draft-x' }, admin), env, ctx);
  assert.equal(res.status, 502);
  env.EMAIL = working;
  working.sent.length = 0;
  res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'ack', idempotencyKey: 'draft-x' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(working.sent.length, 1);
});

test('when Cloudflare fails, the staff order notice goes out through Resend', async (t) => {
  quietConsole(t);
  const calls = guardNetwork(t, { 'https://api.resend.com/emails': { id: 'resend-1' } });
  const env = baseEnv({ EMAIL: fakeEmail({ fail: true }), RESEND_API_KEY: 're_test_only' });
  const session = {
    id: 'cs_test_node_4', payment_intent: 'pi_test_5', amount_total: 49900,
    customer_details: { email: 'buyer4@example.net', name: 'Ry Buyer', address: { state: 'PA' } },
    shipping_details: { name: 'Ry Buyer', address: { line1: '4 Elm St', city: 'Erie', state: 'PA', postal_code: '16501', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit' }
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200);
  const resend = calls.filter((c) => c.url === 'https://api.resend.com/emails');
  assert.equal(resend.length, 1);
  const body = JSON.parse(resend[0].init.body);
  assert.equal(body.subject, '[Eastern Shore AI] New Survival Node order');
  assert.equal(body.from, 'orders@easternshore.ai');
  assert.deepEqual(body.bcc, ['emailconfirm@easternshore.ai']);
});

test('preview lead: confirmation with calendar invite to the business, alert to staff', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const res = await worker.fetch(post('/api/preview/lead', {
    slug: 'garcias', choice: 'interested', name: 'Rosa', phone: '302-555-0101', email: 'rosa@shop.example', method: 'call', date: day, time: '14:00'
  }), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const confirmation = env.EMAIL.sent.find((m) => m.to.includes('rosa@shop.example'));
  const alert = env.EMAIL.sent.find((m) => m.to.includes('owner@inbox.example'));
  assert.ok(confirmation && alert, `sent: ${env.EMAIL.sent.map((m) => m.subject)}`);
  assert.deepEqual(confirmation.from, { email: 'contact@easternshore.ai', name: 'Eastern Shore AI' });
  assertStandardLayout(confirmation);
  assert.equal(confirmation.replyTo, 'contact@easternshore.ai');
  assert.equal(confirmation.attachments.length, 1);
  assert.equal(confirmation.attachments[0].filename, 'call-with-chris.ics');
  assert.equal(confirmation.attachments[0].type, 'text/calendar');
  assert.match(atob(confirmation.attachments[0].content), /BEGIN:VCALENDAR/);
  assert.equal(alert.from, 'alerts@easternshore.ai');
});

const easternDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));

// askk_daily is created on first use; recordAskKBlocked creates it.
async function seedAskKDay(env, day, rows) {
  await recordAskKBlocked(env, 'unverified');
  env.DB.sqlite.exec('DELETE FROM askk_daily');
  for (const [provider, spent, questions] of rows) {
    env.DB.sqlite.prepare('INSERT INTO askk_daily (day, provider, spent, questions) VALUES (?, ?, ?, ?)').run(day, provider, spent, questions);
  }
}

const fmgSummary = (day) => ({ day, answers: 2, errors: 0, est_spent: 0.12, mtd_est_spent: 1.85, credit: { loaded: 20, spent: 1.85, level: 'ok' } });

test('daily Ask K summary covers all three deployments, emailed from the alerts address', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const jicCalls = [];
  const fmgCalls = [];
  const env = baseEnv({
    SUMMARY_TOKEN: 'summary-test-token',
    FMG_ASKK_SUMMARY_TOKEN: 'fmg-test-token',
    JIC_ASKK: {
      async fetch(url, init) {
        jicCalls.push({ url, init });
        return Response.json({ day: JSON.parse(init.body).day, answers: 3, errors: 1, est_spent: 0.4, mtd_est_spent: 8, credit: { loaded: 40, spent: 8, level: 'ok' } });
      }
    },
    FMG_ASKK: {
      async fetch(url, init) {
        fmgCalls.push({ url, init });
        return Response.json(fmgSummary(JSON.parse(init.body).day));
      }
    }
  });
  const yesterday = easternDay(Date.now() - 24 * 3600 * 1000);
  await seedAskKDay(env, yesterday, [['claude', 0.5, 4], ['minimax', 0.01, 1], ['offtopic', 0, 2]]);
  const pending = [];
  await worker.scheduled({ cron: '0 12 * * *', scheduledTime: Date.now() }, env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);

  assert.equal(jicCalls.length, 1);
  assert.match(jicCalls[0].url, /\/internal\/daily-summary$/);
  assert.equal(jicCalls[0].init.method, 'POST');
  assert.equal(jicCalls[0].init.headers.Authorization, 'Bearer summary-test-token');
  assert.equal(jicCalls[0].init.headers['X-Summary-Token'], 'summary-test-token');
  assert.deepEqual(JSON.parse(jicCalls[0].init.body), { day: yesterday });

  // FMG gets its own token, never Just In Case's.
  assert.equal(fmgCalls.length, 1);
  assert.equal(fmgCalls[0].url, 'https://fmg-stripe-api/internal/daily-summary');
  assert.equal(fmgCalls[0].init.method, 'POST');
  assert.equal(fmgCalls[0].init.headers['X-Summary-Token'], 'fmg-test-token');
  assert.equal(fmgCalls[0].init.headers['Content-Type'], 'application/json');
  assert.doesNotMatch(JSON.stringify(fmgCalls[0].init.headers), /summary-test-token/);
  assert.deepEqual(JSON.parse(fmgCalls[0].init.body), { day: yesterday });

  assert.equal(env.EMAIL.sent.length, 1);
  const [email] = env.EMAIL.sent;
  assert.equal(email.from, 'alerts@easternshore.ai');
  assert.deepEqual(email.to, ['owner@inbox.example']);
  assert.match(email.subject, /^Ask K yesterday: 10 answered, about \$1\.03; \w+ so far \$10\.35 of \$200$/);
  assert.match(email.text, /── Survival Node ──\nAnswered: 5\n  • Claude: 4 answers, about \$0\.50/);
  assert.match(email.text, /Blocked: 2/);
  assert.match(email.text, /── Just In Case ──\nAnswered: 3\nErrors: 1\nSpend: about \$0\.40\nClaude spend so far in \w+: about \$8\.00\nK's credit: OK, \$32\.00 left of \$40\.00 loaded/);
  assert.match(email.text, /── Florence Mae Gifts ──\nAnswered: 2\nErrors: 0\nSpend: about \$0\.12\nClaude spend so far in \w+: about \$1\.85\nMonthly Ask K budget: \$1\.85 spent of \$20\.00, OK\n/);
  assert.match(email.text, /── All three ──\nAnswered: 10\nSpend: about \$1\.03\nClaude spend so far in \w+: about \$10\.35 of the \$200 monthly org limit \(5%\)\n/);
  assert.doesNotMatch(email.text, /Not counted/);
  assert.doesNotMatch(email.text, /fmg-test-token|summary-test-token/);
  assert.match(email.text, /platform\.claude\.com → Usage/);
  assert.doesNotMatch(email.text, /console\.anthropic\.com/);
});

test('daily Ask K summary: FMG budget used up is named, not shown as prepaid credit', async (t) => {
  quietConsole(t);
  const env = baseEnv({
    FMG_ASKK_SUMMARY_TOKEN: 'fmg-test-token',
    FMG_ASKK: { fetch: async (_url, init) => Response.json({ ...fmgSummary(JSON.parse(init.body).day), credit: { loaded: 20, spent: 20.4, level: 'out' } }) }
  });
  await seedAskKDay(env, easternDay(Date.now()), []);
  const sent = [];
  await sendAskKDailySummary(env, (_env, message) => sent.push(message), new Date(Date.now() + 24 * 3600 * 1000), { timeoutMs: 20 });

  assert.match(sent[0].text, /Monthly Ask K budget: \$20\.40 spent of \$20\.00, used up \(cap reached or Claude refused for billing\)/);
  assert.doesNotMatch(sent[0].text.split('── Florence Mae Gifts ──')[1], /K's credit|loaded/);
});

test('daily Ask K summary still sends when the other Ask K workers fail or hang', async (t) => {
  quietConsole(t);
  const env = baseEnv({
    SUMMARY_TOKEN: 'summary-test-token',
    FMG_ASKK_SUMMARY_TOKEN: 'fmg-test-token',
    JIC_ASKK: { fetch: () => new Promise(() => {}) },
    FMG_ASKK: { fetch: async () => new Response('Not Found', { status: 404 }) }
  });
  await seedAskKDay(env, easternDay(Date.now()), [['claude', 0.25, 2]]);
  const sent = [];
  await sendAskKDailySummary(env, (_env, message) => sent.push(message), new Date(Date.now() + 24 * 3600 * 1000), { timeoutMs: 20 });

  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /^Ask K yesterday: 2 answered, about \$0\.25; \w+ so far \$0\.25 of \$200 \(Just In Case, Florence Mae Gifts couldn't fetch\)$/);
  assert.match(sent[0].text, /── Survival Node ──\nAnswered: 2/);
  assert.match(sent[0].text, /\nJust In Case: couldn't fetch \(no reply in 0\.02 s\)\n/);
  assert.match(sent[0].text, /\nFlorence Mae Gifts: couldn't fetch \(HTTP 404\)\n/);
  assert.match(sent[0].text, /Not counted: Just In Case, Florence Mae Gifts/);
});

test('daily Ask K summary still sends when FMG errors, has no token, or is not bound', async (t) => {
  quietConsole(t);
  const run = async (extra) => {
    const env = baseEnv({ JIC_ASKK: undefined, ...extra });
    await seedAskKDay(env, easternDay(Date.now()), [['claude', 0.25, 2]]);
    const sent = [];
    await sendAskKDailySummary(env, (_env, message) => sent.push(message), new Date(Date.now() + 24 * 3600 * 1000), { timeoutMs: 20 });
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /── Survival Node ──\nAnswered: 2/);
    return sent[0];
  };

  const serverError = await run({
    FMG_ASKK_SUMMARY_TOKEN: 'fmg-test-token',
    FMG_ASKK: { fetch: async () => Response.json({ error: 'Summary unavailable' }, { status: 500 }) }
  });
  assert.match(serverError.text, /\nFlorence Mae Gifts: couldn't fetch \(HTTP 500\)\n/);
  assert.match(serverError.subject, /\(Florence Mae Gifts couldn't fetch\)$/);

  let called = false;
  const noToken = await run({ FMG_ASKK: { fetch: async () => { called = true; return Response.json({}); } } });
  assert.equal(called, false);
  assert.match(noToken.text, /\nFlorence Mae Gifts: couldn't fetch \(FMG_ASKK_SUMMARY_TOKEN not set\)\n/);

  const unbound = await run({ FMG_ASKK_SUMMARY_TOKEN: 'fmg-test-token' });
  assert.match(unbound.text, /\nFlorence Mae Gifts: not live yet\n/);
  assert.match(unbound.text, /Not counted: Just In Case, Florence Mae Gifts/);
  assert.doesNotMatch(unbound.subject, /couldn't fetch/);
});

test('email events queue: a bounced customer email alerts the owner from the alerts address', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const event = (recipient) => ({
    type: 'cf.email.sending.message.bounced',
    payload: { messageId: 'm1', sender: 'orders@easternshore.ai', recipient, subject: 'Your Survival Node order', bounce: { type: 'hard', reason: '550 5.1.1 User unknown' } },
    metadata: { eventTimestamp: '2026-10-23T15:02:00.000Z' }
  });
  const messages = [event('typo@gmial.com'), event('emailconfirm@easternshore.ai')].map((body) => ({ body, acked: false, ack() { this.acked = true; }, retry() { throw new Error('should not retry'); } }));
  await worker.queue({ queue: 'eastern-shore-ai-email-events', messages }, env);
  assert.equal(env.EMAIL.sent.length, 1, 'internal address must not alert');
  const [alert] = env.EMAIL.sent;
  assert.equal(alert.from, 'alerts@easternshore.ai');
  assert.deepEqual(alert.to, ['owner@inbox.example']);
  assert.equal(alert.subject, '[ACTION NEEDED] Email to typo@gmial.com bounced');
  assert.ok(messages.every((m) => m.acked));
});

test('support push queue still goes to its own handler', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const messages = [{ body: { sessionId: 999999, attempt: 1 }, acked: false, retried: false, ack() { this.acked = true; }, retry() { this.retried = true; } }];
  await worker.queue({ queue: 'eastern-shore-ai-support-push', messages }, env);
  assert.equal(env.EMAIL.sent.length, 0);
  assert.ok(messages[0].acked || messages[0].retried);
});

const contactSender = { email: 'contact@easternshore.ai', name: 'Eastern Shore AI' };
const adminHeaders = { 'X-Admin-Password': 'admin-test-password' };

test('invoice email comes from contact@, replies go to contact@, Officer K still copied', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const id = Number(env.DB.sqlite.prepare(`INSERT INTO invoices (invoice_number, customer_name, customer_email, issue_date, due_date, subtotal_cents, total_cents, balance_due_cents, status)
    VALUES ('INV-TEST-1', 'Dana Client', 'dana@client.example', '2026-10-23', '2026-11-23', 50000, 50000, 50000, 'draft')`).run().lastInsertRowid);
  env.DB.sqlite.prepare(`INSERT INTO invoice_line_items (invoice_id, item_description, quantity, unit_amount_cents, line_total_cents) VALUES (?, 'Website setup', 1, 50000, 50000)`).run(id);
  const res = await worker.fetch(post('/api/accounts/invoices/send', { id }, adminHeaders), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const [mail] = env.EMAIL.sent;
  assert.deepEqual(mail.from, contactSender);
  assert.deepEqual(mail.to, ['dana@client.example']);
  assert.equal(mail.replyTo, 'contact@easternshore.ai');
  assert.deepEqual(mail.cc, ['k@agent.example']);
  assert.deepEqual(mail.bcc, ['emailconfirm@easternshore.ai']);
  assertStandardLayout(mail);
  assert.match(mail.html, /Website setup/);
  assert.match(mail.html, /Balance Due/);
});

test('quote email comes from contact@ and replies go to contact@', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const id = Number(env.DB.sqlite.prepare(`INSERT INTO quotes (quote_number, customer_name, customer_email, valid_until, subtotal_cents, total_cents, status, accept_token, deny_token)
    VALUES ('Q-TEST-1', 'Quinn Client', 'quinn@client.example', '2026-11-30', 80000, 80000, 'draft', 'acc-tok', 'deny-tok')`).run().lastInsertRowid);
  env.DB.sqlite.prepare(`INSERT INTO quote_line_items (quote_id, item_description, quantity, unit_amount_cents, line_total_cents) VALUES (?, 'Website build', 1, 80000, 80000)`).run(id);
  const res = await worker.fetch(post('/api/accounts/quotes/send', { id }, adminHeaders), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const [mail] = env.EMAIL.sent;
  assert.deepEqual(mail.from, contactSender);
  assert.deepEqual(mail.to, ['quinn@client.example']);
  assert.equal(mail.replyTo, 'contact@easternshore.ai');
  assertStandardLayout(mail);
  assert.match(mail.html, /Accept Quote/);
  assert.match(mail.html, /Decline Quote/);
  assert.match(mail.html, /\/api\/quote\/accept\?token=acc-tok/);
});

test('website plan email (agreement link) comes from contact@, matching its "just reply" footer', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const id = Number(env.DB.sqlite.prepare(`INSERT INTO website_clients (business_name, contact_name, email, agreement_token) VALUES ('Garcia Tire', 'Rosa Garcia', 'rosa@shop.example', 'tok-123')`).run().lastInsertRowid);
  const res = await worker.fetch(post('/api/website-clients/link', { id, send: true }, adminHeaders), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const [mail] = env.EMAIL.sent;
  assert.deepEqual(mail.from, contactSender);
  assert.deepEqual(mail.to, ['rosa@shop.example']);
  assert.equal(mail.replyTo, 'contact@easternshore.ai');
  assert.match(mail.html, /Just reply if you have a question/);
  assertStandardLayout(mail);
});

test('without CONTACT_FROM_EMAIL these emails fall back to FROM_EMAIL', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv({ CONTACT_FROM_EMAIL: undefined });
  const id = Number(env.DB.sqlite.prepare(`INSERT INTO website_clients (business_name, email, agreement_token) VALUES ('Shop', 'owner@shop.example', 'tok-456')`).run().lastInsertRowid);
  const res = await worker.fetch(post('/api/website-clients/link', { id, send: true }, adminHeaders), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(env.EMAIL.sent[0].from, 'noreply@easternshore.ai');
});
