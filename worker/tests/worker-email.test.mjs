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

test('an evening sale is booked on its Eastern date, not the next UTC day', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  // 8:39 PM EDT on Oct 27 (00:39 UTC Oct 28); 11:30 PM EST on Dec 1 (04:30 UTC Dec 2).
  for (const [id, at, day] of [['cs_test_evening_edt', '2026-10-28T00:39:54Z', '2026-10-27'], ['cs_test_evening_est', '2026-12-02T04:30:00Z', '2026-12-01']]) {
    const session = {
      id, payment_intent: `pi_${id}`, amount_total: 24999,
      customer_details: { email: 'buyer@example.net', name: 'Sam Buyer', address: { state: 'MD' } },
      shipping_details: { name: 'Sam Buyer', address: { line1: '1 Main St', city: 'Salisbury', state: 'MD', postal_code: '21801', country: 'US' } },
      metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node Base Kit' }
    };
    const event = { ...checkoutCompleted(session), created: Date.parse(at) / 1000 };
    const res = await worker.fetch(await signedWebhook(event), env, ctx);
    assert.equal(res.status, 200, await res.clone().text());
    const income = env.DB.sqlite.prepare('SELECT id, income_date FROM tax_income WHERE stripe_session_id = ?').get(id);
    assert.equal(income.income_date, day, `${id}: income date`);
    const fee = env.DB.sqlite.prepare('SELECT expense_date FROM tax_expenses WHERE notes LIKE ?').get(`%${id}`);
    assert.equal(fee.expense_date, day, `${id}: Stripe fee date`);
    const entry = env.DB.sqlite.prepare("SELECT entry_date FROM journal_entries WHERE source_type = 'tax_income' AND source_id = ?").get(income.id);
    assert.equal(entry.entry_date, day, `${id}: journal date`);
  }
});

const feeJournalCents = (env, expenseId) => env.DB.sqlite.prepare(
  "SELECT SUM(jl.debit_cents) AS c FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id WHERE je.source_type = 'tax_expense' AND je.source_id = ?"
).get(expenseId).c;

test('Klarna sale: before Stripe posts its fee, the books estimate it at the Klarna rate', async (t) => {
  quietConsole(t);
  guardNetwork(t, {
    'https://api.stripe.com/v1/payment_intents/pi_klarna_1': { id: 'pi_klarna_1', latest_charge: { id: 'ch_1', payment_method_details: { type: 'klarna' }, balance_transaction: null } }
  });
  const env = baseEnv({ STRIPE_SECRET_KEY: 'sk_test_only' });
  const session = {
    id: 'cs_test_klarna_1', payment_intent: 'pi_klarna_1', amount_total: 24999,
    customer_details: { email: 'buyer@example.net', name: 'Sam Buyer', address: { state: 'MD' } },
    shipping_details: { name: 'Sam Buyer', address: { line1: '1 Main St', city: 'Salisbury', state: 'MD', postal_code: '21801', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node Base Kit' }
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const fee = env.DB.sqlite.prepare("SELECT id, amount_cents, notes FROM tax_expenses WHERE notes LIKE '%cs_test_klarna_1'").get();
  assert.equal(fee.amount_cents, 1527); // 5.99% + 30¢ of $249.99, as Stripe charged
  assert.equal(fee.notes, 'Estimated Stripe fee for session cs_test_klarna_1');
  assert.equal(feeJournalCents(env, fee.id), 1527);
});

test('daily fee check: estimates become Stripe\'s real fee, and the owner is emailed what changed', async (t) => {
  quietConsole(t);
  const calls = guardNetwork(t, {
    'https://api.stripe.com/v1/checkout/sessions/cs_old_klarna': { id: 'cs_old_klarna', payment_intent: 'pi_old_klarna' },
    'https://api.stripe.com/v1/payment_intents/pi_old_klarna': { id: 'pi_old_klarna', latest_charge: { id: 'ch_2', payment_method_details: { type: 'klarna' }, balance_transaction: { id: 'txn_2', fee: 1527 } } },
    // Website plan renewal keyed by invoice; newer API versions list its payment intent under invoice_payments.
    'https://api.stripe.com/v1/invoices/in_plan_1': { id: 'in_plan_1' },
    'https://api.stripe.com/v1/invoice_payments?invoice=in_plan_1': { data: [{ payment: { payment_intent: 'pi_plan_1' } }] },
    'https://api.stripe.com/v1/payment_intents/pi_plan_1': { id: 'pi_plan_1', latest_charge: { id: 'ch_3', payment_method_details: { type: 'card' }, balance_transaction: 'txn_3' } },
    'https://api.stripe.com/v1/balance_transactions/txn_3': { id: 'txn_3', fee: 33 },
    // Stripe hasn't posted this one's fee yet.
    'https://api.stripe.com/v1/checkout/sessions/cs_pending': { id: 'cs_pending', payment_intent: 'pi_pending' },
    'https://api.stripe.com/v1/payment_intents/pi_pending': { id: 'pi_pending', latest_charge: { id: 'ch_4', payment_method_details: { type: 'card' }, balance_transaction: null } }
  });
  const env = baseEnv({ STRIPE_SECRET_KEY: 'sk_test_only' });
  const insert = env.DB.sqlite.prepare("INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents, paid_via, notes) VALUES (?, 'Stripe', 'Payment Processing Fees', ?, 'stripe', ?)");
  const klarna = insert.run('2026-10-28', 755, 'Estimated Stripe fee for session cs_old_klarna').lastInsertRowid;
  const plan = insert.run('2026-10-19', 33, 'Auto Stripe fee for website plan in_plan_1 (estimated)').lastInsertRowid;
  const pending = insert.run('2026-10-28', 755, 'Auto Stripe fee for invoice session cs_pending (estimated)').lastInsertRowid;
  const done = insert.run('2026-10-27', 755, 'Auto Stripe fee for session cs_done').lastInsertRowid;

  const waits = [];
  await worker.scheduled({ cron: '0 12 * * *' }, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);

  const row = (id) => env.DB.sqlite.prepare('SELECT amount_cents, notes FROM tax_expenses WHERE id = ?').get(id);
  assert.deepEqual({ ...row(klarna) }, { amount_cents: 1527, notes: 'Auto Stripe fee for session cs_old_klarna' });
  assert.equal(feeJournalCents(env, klarna), 1527);
  assert.deepEqual({ ...row(plan) }, { amount_cents: 33, notes: 'Auto Stripe fee for website plan in_plan_1' });
  assert.deepEqual({ ...row(pending) }, { amount_cents: 755, notes: 'Auto Stripe fee for invoice session cs_pending (estimated)' });
  assert.deepEqual({ ...row(done) }, { amount_cents: 755, notes: 'Auto Stripe fee for session cs_done' });
  assert.ok(!calls.some((c) => c.url.includes('cs_done')), 'real fees are left alone');

  const mail = env.EMAIL.sent.find((m) => m.subject === 'Stripe fees corrected in the books');
  assert.ok(mail, 'owner emailed');
  assert.equal(mail.from, 'alerts@easternshore.ai');
  assert.deepEqual(mail.to, ['owner@inbox.example']);
  assert.match(mail.text, /2026-10-28 {2}klarna {2}\$7\.55 -> \$15\.27 {2}\(cs_old_klarna\)/);
  assert.match(mail.text, /1 other estimate was already right\./);
  assert.doesNotMatch(mail.text, /cs_pending|in_plan_1/);

  // Next day: nothing changed, so no second email.
  const sentBefore = env.EMAIL.sent.filter((m) => m.subject === 'Stripe fees corrected in the books').length;
  const again = [];
  await worker.scheduled({ cron: '0 12 * * *' }, env, { waitUntil: (p) => again.push(p) });
  await Promise.all(again);
  assert.equal(env.EMAIL.sent.filter((m) => m.subject === 'Stripe fees corrected in the books').length, sentBefore);
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

test('non-CONUS order: newer Stripe API shape is judged by the shipping state, not billing', async (t) => {
  quietConsole(t);
  const calls = guardNetwork(t, {
    'https://api.stripe.com/v1/payment_intents/': { latest_charge: { balance_transaction: { fee: 1477 } } },
    'https://api.stripe.com/v1/refunds': { id: 're_test_2', status: 'succeeded' }
  });
  const env = baseEnv({ STRIPE_SECRET_KEY: 'sk_test_only' });
  const session = {
    id: 'cs_test_node_hi', payment_intent: 'pi_test_hi', amount_total: 49900,
    customer_details: { email: 'gift@example.net', name: 'Gi Fter', address: { state: 'MD' } },
    collected_information: { shipping_details: { name: 'Island Friend', address: { state: 'HI', city: 'Hilo', country: 'US' } } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit' }
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.url === 'https://api.stripe.com/v1/refunds'));
});

test('ship-to: read from Stripe, shown on the acknowledgment and shipping emails only, corrections carry over', async (t) => {
  quietConsole(t);
  const newShape = { collected_information: { shipping_details: { name: 'Dee Buyer', address: { line1: '5 Pine Ct', line2: 'Apt 2', city: 'Easton', state: 'MD', postal_code: '21601', country: 'US' } } } };
  const calls = guardNetwork(t, { 'https://api.stripe.com/v1/checkout/sessions/cs_ship_1': { id: 'cs_ship_1', ...newShape } });
  const env = baseEnv();
  const session = {
    id: 'cs_ship_1', payment_intent: 'pi_ship_1', amount_total: 24999,
    customer_details: { email: 'dee@example.net', name: 'Dee Buyer', address: { state: 'MD' } },
    ...newShape,
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node' }
  };
  await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  // The staff order email reads the same address.
  assert.match(env.EMAIL.sent.find((m) => m.subject.includes('New Survival Node order')).text, /Ship to:\nDee Buyer\n5 Pine Ct\nApt 2\nEaston, MD, 21601/);
  env.EMAIL.sent.length = 0;
  env.STRIPE_SECRET_KEY = 'sk_test_only';
  const bookingId = env.DB.sqlite.prepare('SELECT id FROM bookings WHERE stripe_session_id = ?').get('cs_ship_1').id;
  const admin = { 'X-Admin-Password': 'admin-test-password' };
  const preview = async (kind) => (await worker.fetch(post('/api/orders/preview', { bookingId, kind }, admin), env, ctx)).json();
  const send = (kind, extra = {}) => worker.fetch(post('/api/orders/send', { bookingId, kind, trackingNumber: '9400100000000000000000', trackingProvider: 'usps', ...extra }, admin), env, ctx);

  // Filled from Stripe for the dialog, in the order a label would read.
  const draft = await preview('ack');
  assert.equal(draft.shipTo, 'Dee Buyer\n5 Pine Ct\nApt 2\nEaston, MD 21601');

  // The customer's apartment correction is typed into the dialog before sending.
  const corrected = 'Dee Buyer\n5 Pine Ct\nApt 2B\nEaston, MD 21601';
  assert.equal((await send('ack', { shipTo: `${corrected}\r\n\r\n` })).status, 200);
  const [ack] = env.EMAIL.sent;
  assert.match(ack.html, /Ship To<\/td>/);
  assert.match(ack.html, /Dee Buyer<br>5 Pine Ct<br>Apt 2B<br>Easton, MD 21601/);
  assert.match(ack.text, /Ship to:\nDee Buyer\n5 Pine Ct\nApt 2B\nEaston, MD 21601\n/);

  // The shipping email uses the corrected address, without asking Stripe again.
  const lookups = calls.length;
  assert.equal((await preview('shipping')).shipTo, corrected);
  assert.equal((await send('shipping')).status, 200);
  assert.equal(calls.length, lookups);
  assert.match(env.EMAIL.sent[1].html, /Apt 2B/);
  assert.match(env.EMAIL.sent[1].text, /Ship to:\nDee Buyer/);

  // Delivered and review emails leave it out.
  assert.equal((await preview('delivered')).shipTo, '');
  assert.equal((await send('delivered')).status, 200);
  assert.equal((await send('review')).status, 200);
  for (const mail of env.EMAIL.sent.slice(2)) {
    assert.doesNotMatch(mail.html, /Ship To|Pine Ct/);
    assert.doesNotMatch(mail.text, /Ship to|Pine Ct/);
  }
});

test('ship-to: a box cleared in the dialog keeps the address out; a Stripe outage leaves the box empty', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const session = {
    id: 'cs_ship_2', payment_intent: 'pi_ship_2', amount_total: 24999,
    customer_details: { email: 'lee@example.net', name: 'Lee Buyer', address: { state: 'MD' } },
    shipping_details: { name: 'Lee Buyer', address: { line1: '6 Oak Ct', city: 'Easton', state: 'MD', postal_code: '21601', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit' }
  };
  await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  env.EMAIL.sent.length = 0;
  env.STRIPE_SECRET_KEY = 'sk_test_only';
  const bookingId = env.DB.sqlite.prepare('SELECT id FROM bookings WHERE stripe_session_id = ?').get('cs_ship_2').id;
  const admin = { 'X-Admin-Password': 'admin-test-password' };

  // guardNetwork throws on the Stripe call, as a network failure would.
  const draft = await (await worker.fetch(post('/api/orders/preview', { bookingId, kind: 'ack' }, admin), env, ctx)).json();
  assert.equal(draft.ok, true);
  assert.equal(draft.shipTo, '');

  const res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'ack', shipTo: '' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.doesNotMatch(env.EMAIL.sent[0].html, /Ship To/);
  assert.doesNotMatch(env.EMAIL.sent[0].text, /Ship to/);
});

test('ship-to: a manual order uses the address typed in the dialog and keeps it for the shipping email', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv({ STRIPE_SECRET_KEY: 'sk_test_only' });
  const admin = { 'X-Admin-Password': 'admin-test-password' };
  const created = await (await worker.fetch(post('/api/orders/manual', { customerName: 'Mo Manual', customerEmail: 'mo@example.net', amount: '249.99', paymentDate: '2026-10-20' }, admin), env, ctx)).json();
  const { orderKey } = created;
  const preview = async (kind) => (await worker.fetch(post('/api/orders/preview', { orderKey, kind }, admin), env, ctx)).json();

  assert.equal((await preview('ack')).shipTo, '');
  let res = await worker.fetch(post('/api/orders/send', { orderKey, kind: 'ack', shipTo: 'Mo Manual\n<7> Bay Rd\nDover, DE 19901' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(env.EMAIL.sent[0].html, /Mo Manual<br>&lt;7&gt; Bay Rd<br>Dover, DE 19901/);

  const shipping = await preview('shipping');
  assert.equal(shipping.shipTo, 'Mo Manual\n<7> Bay Rd\nDover, DE 19901');
  res = await worker.fetch(post('/api/orders/send', { orderKey, kind: 'shipping', trackingNumber: '1Z999', trackingProvider: 'ups', shipTo: shipping.shipTo }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(env.EMAIL.sent[1].text, /Ship to:\nMo Manual\n<7> Bay Rd\nDover, DE 19901/);
});

test('customer message: branded email with order details, sent any time, changes nothing on the order', async (t) => {
  quietConsole(t);
  guardNetwork(t, {
    'https://api.stripe.com/v1/checkout/sessions/cs_msg_1': { id: 'cs_msg_1', collected_information: { shipping_details: { name: 'Mia Buyer', address: { line1: '8 Bay Ln', city: 'Easton', state: 'MD', postal_code: '21601', country: 'US' } } } }
  });
  const env = baseEnv();
  const session = {
    id: 'cs_msg_1', payment_intent: 'pi_msg_1', amount_total: 24999,
    customer_details: { email: 'mia@example.net', name: 'Mia Buyer', address: { state: 'MD' } },
    collected_information: { shipping_details: { name: 'Mia Buyer', address: { line1: '8 Bay Ln', city: 'Easton', state: 'MD', postal_code: '21601', country: 'US' } } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node' }
  };
  await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  env.EMAIL.sent.length = 0;
  env.STRIPE_SECRET_KEY = 'sk_test_only';
  const bookingId = env.DB.sqlite.prepare('SELECT id FROM bookings WHERE stripe_session_id = ?').get('cs_msg_1').id;
  const admin = { 'X-Admin-Password': 'admin-test-password' };
  const preview = async () => (await worker.fetch(post('/api/orders/preview', { bookingId, kind: 'message' }, admin), env, ctx)).json();
  const send = (extra) => worker.fetch(post('/api/orders/send', { bookingId, kind: 'message', ...extra }, admin), env, ctx);
  const orderState = () => env.DB.sqlite.prepare('SELECT ack_email_sent_at, shipping_email_sent_at, fulfillment_status FROM order_fulfillment WHERE booking_id = ?').get(bookingId);

  // Available before any other email has gone out.
  const draft = await preview();
  assert.equal(draft.ok, true);
  assert.equal(draft.subject, 'An update on your Survival Node order');
  assert.equal(draft.customerEmail, 'mia@example.net');
  assert.equal(draft.shipTo, 'Mia Buyer\n8 Bay Ln\nEaston, MD 21601');
  assert.ok(draft.bodyText.startsWith('Hi Mia Buyer,\n\n'));

  // The untouched template and an empty body don't go out.
  for (const bodyText of [draft.bodyText, draft.bodyText.replace(/\n/g, '\n\n'), '', '   ']) {
    const refused = await send({ subject: draft.subject, bodyText, shipTo: draft.shipTo });
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).error, /Write your message/);
  }
  assert.equal(env.EMAIL.sent.length, 0);

  const message = draft.bodyText.replace('\n\n\n\n', '\n\nThe Meshtastic app is on your phone already.\n\n');
  let res = await send({ subject: 'A note about your kit', bodyText: message, shipTo: draft.shipTo, idempotencyKey: 'msg-1' });
  assert.equal(res.status, 200, await res.clone().text());
  const [mail] = env.EMAIL.sent;
  assert.deepEqual(mail.to, ['mia@example.net']);
  assert.deepEqual(mail.from, { email: 'orders@easternshore.ai', name: 'Eastern Shore AI Orders' });
  assert.equal(mail.replyTo, 'contact@easternshore.ai');
  assert.equal(mail.subject, 'A note about your kit');
  assertStandardLayout(mail);
  assert.match(mail.html, /The Meshtastic app is on your phone already\./);
  assert.match(mail.html, /Order Number<\/td>/);
  assert.match(mail.html, /\$249\.99/);
  assert.match(mail.html, /Mia Buyer<br>8 Bay Ln<br>Easton, MD 21601/);
  assert.match(mail.text, /The Meshtastic app is on your phone already\./);
  assert.match(mail.text, /Ship to:\nMia Buyer\n8 Bay Ln\nEaston, MD 21601/);

  // Nothing on the order moved, so the normal emails still run in order.
  assert.equal(orderState().ack_email_sent_at, null);
  assert.equal(orderState().fulfillment_status, 'new');

  // A second message is fine, and an address fixed in it is kept.
  const fixed = 'Mia Buyer\n8 Bay Ln Apt 3\nEaston, MD 21601';
  res = await send({ bodyText: 'Hi Mia,\n\nOne more thing.', shipTo: fixed, idempotencyKey: 'msg-2' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(env.EMAIL.sent.length, 2);
  assert.equal((await preview()).shipTo, fixed);

  // The same draft submitted twice still sends once.
  res = await send({ bodyText: 'Hi Mia,\n\nOne more thing.', shipTo: fixed, idempotencyKey: 'msg-2' });
  assert.equal((await res.json()).duplicateSuppressed, true);
  assert.equal(env.EMAIL.sent.length, 2);

  // The estimated ship date shows until the order ships, then tracking does.
  const ack = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'ack', estimatedShipDate: '2026-11-03', idempotencyKey: 'msg-ack' }, admin), env, ctx);
  assert.equal(ack.status, 200, await ack.clone().text());
  assert.equal((await preview()).estimatedShipDate, '2026-11-03');
  await send({ bodyText: 'Hi Mia,\n\nStill on track.', idempotencyKey: 'msg-3' });
  assert.match(env.EMAIL.sent.at(-1).html, /Estimated Ship Date/);
  const shipped = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'shipping', trackingNumber: '9400100000000000000000', trackingProvider: 'usps', idempotencyKey: 'msg-ship' }, admin), env, ctx);
  assert.equal(shipped.status, 200, await shipped.clone().text());
  assert.equal((await preview()).estimatedShipDate, '');
  await send({ bodyText: 'Hi Mia,\n\nIt left today.', idempotencyKey: 'msg-4' });
  const afterShip = env.EMAIL.sent.at(-1);
  assert.doesNotMatch(afterShip.html, /Estimated Ship Date/);
  assert.match(afterShip.html, /Tracking Number<\/td>/);
  assert.match(afterShip.html, /Track on USPS/);
  assert.equal(orderState().fulfillment_status, 'shipped');
});

test('customer message: battery results stay out, and a manual order works from a typed address', async (t) => {
  quietConsole(t);
  guardNetwork(t);
  const env = baseEnv();
  const admin = { 'X-Admin-Password': 'admin-test-password' };
  const { orderKey } = await (await worker.fetch(post('/api/orders/manual', { customerName: 'Mo Manual', customerEmail: 'mo@example.net', amount: '249.99', paymentDate: '2026-10-20' }, admin), env, ctx)).json();
  env.DB.sqlite.prepare("UPDATE manual_survival_node_orders SET battery_test_note = 'Health 98%'").run();

  const draft = await (await worker.fetch(post('/api/orders/preview', { orderKey, kind: 'message' }, admin), env, ctx)).json();
  assert.equal(draft.shipTo, '');
  const res = await worker.fetch(post('/api/orders/send', { orderKey, kind: 'message', bodyText: 'Hi Mo,\n\nA quick update.', shipTo: 'Mo Manual\n7 Bay Rd\nDover, DE 19901' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const [mail] = env.EMAIL.sent;
  assert.match(mail.html, /Mo Manual<br>7 Bay Rd<br>Dover, DE 19901/);
  assert.doesNotMatch(mail.html, /Battery Test Results/);
  const row = env.DB.sqlite.prepare('SELECT ship_to, ack_email_sent_at, fulfillment_status FROM manual_survival_node_orders').get();
  assert.equal(row.ship_to, 'Mo Manual\n7 Bay Rd\nDover, DE 19901');
  assert.equal(row.ack_email_sent_at, null);
  assert.equal(row.fulfillment_status, 'new');
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

// ── Ask K order updates (src/order-status.js) ─────────────────

const STATUS_REPLY = /If that email address has Survival Node orders from our website, I've just emailed their status and tracking to it\..*If you ordered on eBay, please reach out to us there/;
const askKEnv = (overrides = {}) => baseEnv({ ASKK_TURNSTILE_ENFORCE: '1', TURNSTILE_SECRET_KEY: 'ts_test_only', ASKK_PASS_SECRET: 'pass-secret-test-only', ...overrides });
const turnstileOk = { 'https://challenges.cloudflare.com/turnstile/v0/siteverify': { success: true } };
const admin = { 'X-Admin-Password': 'admin-test-password' };

// waitUntil work is collected so a test can wait for the email.
function collectingCtx() {
  const pending = [];
  return { waitUntil(p) { pending.push(p); }, settle: () => Promise.all(pending.splice(0)) };
}

async function nodeOrder(env, id, email, extra = {}) {
  const session = {
    id, payment_intent: `pi_${id}`, amount_total: 24999,
    customer_details: { email, name: 'Pat Buyer', address: { state: 'MD' } },
    shipping_details: { name: 'Pat Buyer', address: { line1: '1 Main St', city: 'Salisbury', state: 'MD', postal_code: '21801', country: 'US' } },
    metadata: { checkout_type: 'base_kit', product: 'survival_node_base_kit', service_label: 'Survival Node Base Kit' },
    ...extra
  };
  const res = await worker.fetch(await signedWebhook(checkoutCompleted(session)), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const row = env.DB.sqlite.prepare('SELECT b.id, of.order_number FROM bookings b JOIN order_fulfillment of ON of.booking_id = b.id WHERE b.stripe_session_id = ?').get(id);
  return { bookingId: row.id, orderNumber: row.order_number };
}

async function askStatus(env, c, body) {
  const res = await worker.fetch(post('/api/ask-k/order-status', { turnstileToken: 'tok', ...body }), env, c);
  const data = await res.json();
  await c.settle();
  return { status: res.status, data };
}

test('Ask K order status: same reply for any address, email only to the address with orders', async (t) => {
  quietConsole(t);
  guardNetwork(t, turnstileOk);
  const env = askKEnv();
  const { orderNumber } = await nodeOrder(env, 'cs_status_1', 'Pat.Buyer@Example.NET');
  env.EMAIL.sent.length = 0;
  const c = collectingCtx();

  const unknown = await askStatus(env, c, { email: 'someone-else@example.net' });
  assert.equal(unknown.status, 200);
  assert.match(unknown.data.reply, STATUS_REPLY);
  assert.ok(unknown.data.pass, 'a verified visitor gets a conversation pass');
  assert.equal(env.EMAIL.sent.length, 0);

  const known = await askStatus(env, c, { email: ' pat.buyer@example.net ', pass: unknown.data.pass, turnstileToken: undefined });
  assert.equal(known.status, 200);
  assert.equal(known.data.reply, unknown.data.reply);
  assert.equal(env.EMAIL.sent.length, 1);
  const mail = env.EMAIL.sent[0];
  assert.deepEqual(mail.to, ['pat.buyer@example.net']);
  assert.deepEqual(mail.from, { email: 'orders@easternshore.ai', name: 'Eastern Shore AI Orders' });
  assert.equal(mail.replyTo, 'contact@easternshore.ai');
  assert.equal(mail.bcc, undefined);
  assertStandardLayout(mail);
  assert.equal(mail.subject, 'Your Survival Node order status');
  assert.match(mail.html, new RegExp(orderNumber));
  assert.match(mail.text, /Status: Order received\. We're getting it ready\. Orders usually ship within 1 to 2 business days/);
  assert.doesNotMatch(mail.html, /Security reminder|wasn't you/);
  const counted = env.DB.sqlite.prepare("SELECT SUM(questions) AS n FROM askk_daily WHERE provider = 'status'").get();
  assert.equal(counted.n, 2);
});

test('acknowledgment saves the estimated ship date; Ask K reports it, then lateness, then tracking', async (t) => {
  quietConsole(t);
  guardNetwork(t, turnstileOk);
  const env = askKEnv();
  const { bookingId, orderNumber } = await nodeOrder(env, 'cs_status_2', 'ship@example.net');
  env.EMAIL.sent.length = 0;

  let res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'ack', idempotencyKey: 'ack-ship', estimatedShipDate: 'Nov 3' }, admin), env, ctx);
  assert.equal(res.status, 400, 'a malformed ship date is refused');
  res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'ack', idempotencyKey: 'ack-ship', estimatedShipDate: '2099-01-15' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const ack = env.EMAIL.sent[0];
  assert.match(ack.html, /Estimated Ship Date/);
  assert.match(ack.html, /Thursday, January 15, 2099/);
  assert.match(ack.text, /^Estimated ship date: Thursday, January 15, 2099/);
  assert.equal(env.DB.sqlite.prepare('SELECT estimated_ship_date AS d FROM order_fulfillment WHERE booking_id = ?').get(bookingId).d, '2099-01-15');

  const c = collectingCtx();
  env.EMAIL.sent.length = 0;
  await askStatus(env, c, { email: 'ship@example.net' });
  assert.match(env.EMAIL.sent[0].text, /We're preparing and quality-checking it now\. Estimated ship date: Thursday, January 15, 2099\./);

  // The Ship Date button changes it later, without emailing the customer.
  env.EMAIL.sent.length = 0;
  res = await worker.fetch(post('/api/orders/ship-date', { bookingId, estimatedShipDate: '2026-01-02' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(env.EMAIL.sent.length, 0);
  const list = await (await worker.fetch(new Request('https://worker.example/api/orders', { headers: { Origin: SITE, ...admin } }), env, ctx)).json();
  assert.equal(list.orders.find((o) => o.id === bookingId).estimated_ship_date, '2026-01-02');
  res = await worker.fetch(post('/api/orders/ship-date', { bookingId, estimatedShipDate: '2026-02-30' }, admin), env, ctx);
  assert.equal(res.status, 400);
  await askStatus(env, c, { email: 'ship@example.net' });
  assert.match(env.EMAIL.sent[0].text, /taking a little longer than our estimate \(it was due to ship by Friday, January 2, 2026\)/);

  env.EMAIL.sent.length = 0;
  res = await worker.fetch(post('/api/orders/send', { bookingId, kind: 'shipping', idempotencyKey: 'ship-1', trackingNumber: '9400100000000000000001', trackingProvider: 'usps' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  env.EMAIL.sent.length = 0;
  await askStatus(env, c, { email: 'ship@example.net', orderNumber: `Order #${orderNumber}` });
  const shipped = env.EMAIL.sent[0];
  assert.equal(shipped.subject, `Your Survival Node order status (#${orderNumber})`);
  assert.match(shipped.text, /Status: Shipped .+ by USPS\./);
  assert.match(shipped.html, /Track on USPS/);
  assert.match(shipped.html, /services\.easternshore\.ai\/track\?n=9400100000000000000001&amp;c=usps/);
});

test('Ask K order status: order number narrows, a wrong one gets all orders, a malformed one is refused', async (t) => {
  quietConsole(t);
  guardNetwork(t, turnstileOk);
  const env = askKEnv();
  const first = await nodeOrder(env, 'cs_status_3', 'two@example.net');
  let res = await worker.fetch(post('/api/orders/manual', { customerName: 'Two Orders', customerEmail: 'Two@Example.net', amount: '249.99', paymentDate: '2026-10-20', paymentMethod: 'Cash', orderSummary: 'Survival Node Gen 2 (manual)' }, admin), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const manualNumber = env.DB.sqlite.prepare('SELECT order_number AS n FROM manual_survival_node_orders').get().n;
  env.EMAIL.sent.length = 0;
  const c = collectingCtx();

  await askStatus(env, c, { email: 'two@example.net' });
  let mail = env.EMAIL.sent.pop();
  assert.match(mail.text, /Here's the latest on your Survival Node orders/);
  assert.match(mail.text, new RegExp(`Order Number: ${first.orderNumber}`));
  assert.match(mail.text, new RegExp(`Order Number: ${manualNumber}`));
  assert.match(mail.text, /Survival Node Gen 2 \(manual\)/);

  await askStatus(env, c, { email: 'two@example.net', orderNumber: ` no. ${manualNumber} ` });
  mail = env.EMAIL.sent.pop();
  assert.equal(mail.subject, `Your Survival Node order status (#${manualNumber})`);
  assert.doesNotMatch(mail.text, new RegExp(`Order Number: ${first.orderNumber}`));

  await askStatus(env, c, { email: 'two@example.net', orderNumber: '99999' });
  mail = env.EMAIL.sent.pop();
  assert.match(mail.text, /We couldn't find the order number you entered/);
  assert.doesNotMatch(mail.text, /99999/);
  assert.match(mail.text, new RegExp(`Order Number: ${first.orderNumber}`));

  const bad = await askStatus(env, c, { email: 'two@example.net', orderNumber: '12-34567-89012 <b>' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /eBay/);
  assert.equal(env.EMAIL.sent.length, 0);
});

test('Ask K order status: a refund recorded against the order shows as refunded', async (t) => {
  quietConsole(t);
  guardNetwork(t, turnstileOk);
  const env = askKEnv();
  const { bookingId } = await nodeOrder(env, 'cs_status_4', 'refund@example.net');
  env.DB.sqlite.prepare("INSERT INTO tax_income (income_date, source, category, amount_cents, refund_order_key) VALUES ('2026-10-25', 'Refund', 'Customer Refunds / Returns & Allowances', -24999, ?)").run(`booking:${bookingId}`);
  env.EMAIL.sent.length = 0;
  const c = collectingCtx();
  await askStatus(env, c, { email: 'refund@example.net' });
  assert.match(env.EMAIL.sent[0].text, /Status: Refunded: a refund of \$249\.99 was issued on Sunday, October 25, 2026\./);
});

test('Ask K order status: per-address limit, bot check required, fails closed without it', async (t) => {
  quietConsole(t);
  const calls = guardNetwork(t, { 'https://challenges.cloudflare.com/turnstile/v0/siteverify': (url, init) => ({ success: init.body.get('response') === 'tok' }) });
  const env = askKEnv();
  await nodeOrder(env, 'cs_status_5', 'limit@example.net');
  env.EMAIL.sent.length = 0;
  const c = collectingCtx();

  const unverified = await askStatus(env, c, { email: 'limit@example.net', turnstileToken: 'bad' });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.data.needsVerification, true);

  for (let i = 0; i < 3; i++) assert.match((await askStatus(env, c, { email: 'limit@example.net' })).data.reply, STATUS_REPLY);
  const fourth = await askStatus(env, c, { email: 'LIMIT@example.net' });
  assert.equal(fourth.status, 200);
  assert.match(fourth.data.reply, /already emailed order updates for that address recently/);
  assert.equal(env.EMAIL.sent.length, 3);

  const before = calls.length;
  const off = askKEnv({ ASKK_TURNSTILE_ENFORCE: '0' });
  const closed = await askStatus(off, collectingCtx(), { email: 'limit@example.net' });
  assert.equal(closed.status, 503);
  assert.equal(calls.length, before, 'no Turnstile call or email when the bot check is off');
  assert.equal(off.EMAIL.sent.length, 0);
});

test('/api/ask-k: Claude answers in JSON and its lookup flag reaches the page; the backup uses the keyword check', async (t) => {
  quietConsole(t);
  const bodies = [];
  guardNetwork(t, {
    'https://api.anthropic.com/v1/models': { data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' },
    'https://api.anthropic.com/v1/messages': (url, init) => {
      bodies.push(JSON.parse(init.body));
      return { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: 'text', text: JSON.stringify({ reply: 'I can email you the latest status. Use the box below.', lookup: true }) }] };
    },
    'https://backup.example/v1/chat/completions': { choices: [{ message: { content: 'You can get it emailed with the box below.' } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }
  });
  let env = baseEnv({ ANTHROPIC_API_KEY: 'sk-ant-test-only' });
  let res = await worker.fetch(post('/api/ask-k', { message: 'Where is my order?' }), env, ctx);
  let data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  assert.equal(data.reply, 'I can email you the latest status. Use the box below.');
  assert.equal(data.lookup, true);
  const sent = bodies.at(-1);
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.deepEqual(sent.output_config.format.schema.required, ['reply', 'lookup']);
  assert.match(sent.system.map((b) => b.text).join('\n'), /eBay purchase history/);

  env = baseEnv({ ASKK_API_KEY: 'mm-test-only', ASKK_BASE_URL: 'https://backup.example/v1', ASKK_MODEL: 'MiniMax-M2.5' });
  res = await worker.fetch(post('/api/ask-k', { message: 'Has my order shipped yet?' }), env, ctx);
  data = await res.json();
  assert.equal(data.lookup, true, JSON.stringify(data));
  res = await worker.fetch(post('/api/ask-k', { message: 'How big is the solar battery?' }), env, ctx);
  data = await res.json();
  assert.equal(data.lookup, false, JSON.stringify(data));
});
