// Customer and staff emails, end to end through src/index.js: a SQLite D1 with
// every migration applied, signed Stripe webhooks, and a fake Cloudflare EMAIL
// binding. Any network call other than a stubbed Stripe API fails the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
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

  // Sending it again later is refused by the sent-at check.
  let res = await send('ack', 'draft-ack-2');
  assert.equal(res.status, 409);
  assert.equal(env.EMAIL.sent.length, 1);

  for (const [kind, key] of [['shipping', 'd-ship'], ['delivered', 'd-deliv'], ['review', 'd-review']]) {
    res = await send(kind, key, { trackingNumber: '9400100000000000000000', trackingProvider: 'usps' });
    assert.equal(res.status, 200, `${kind}: ${await res.clone().text()}`);
  }
  assert.equal(env.EMAIL.sent.length, 4);
  const review = env.EMAIL.sent[3];
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
  assert.equal(confirmation.replyTo, 'contact@easternshore.ai');
  assert.equal(confirmation.attachments.length, 1);
  assert.equal(confirmation.attachments[0].filename, 'call-with-chris.ics');
  assert.equal(confirmation.attachments[0].type, 'text/calendar');
  assert.match(atob(confirmation.attachments[0].content), /BEGIN:VCALENDAR/);
  assert.equal(alert.from, 'alerts@easternshore.ai');
});

test('daily Ask K summary is emailed to the owner from the alerts address', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const pending = [];
  await worker.scheduled({ cron: '0 12 * * *', scheduledTime: Date.now() }, env, { waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  assert.equal(env.EMAIL.sent.length, 1);
  assert.equal(env.EMAIL.sent[0].from, 'alerts@easternshore.ai');
  assert.deepEqual(env.EMAIL.sent[0].to, ['owner@inbox.example']);
  assert.match(env.EMAIL.sent[0].text, /Ask K on the Survival Node page/);
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
