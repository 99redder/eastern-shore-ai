// Year-end parts count (admin Year-End Close tab): saving a count posts a Dec 31 adjustment and its
// Jan 1 reversal, /api/tax/summary moves the counted parts from that year's expenses into the next
// year's, and the Year-End Close only sums its own year (and survives a re-run). The pricing
// helpers are copied out of admin.js and run on real-looking purchase notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const SITE = 'https://www.easternshore.ai';
const ctx = { waitUntil() {} };
const ADMIN = { 'X-Admin-Password': 'admin-test-password' };

function baseEnv() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) {
      if (!file.startsWith('0023_')) throw e;
    }
  }
  return { DB, ALLOWED_ORIGINS: 'https://easternshore.ai,https://www.easternshore.ai', ADMIN_PASSWORD: 'admin-test-password', TAX_READ_TOKEN: 'tax-read-test-token' };
}

function quietConsole(t) {
  for (const level of ['error', 'warn', 'log']) {
    const original = console[level];
    console[level] = () => {};
    t.after(() => { console[level] = original; });
  }
}

const get = (path, headers = ADMIN) => worker.fetch(new Request(`https://worker.example${path}`, { headers: { Origin: SITE, ...headers } }), env0.env, ctx);
const env0 = { env: null };
const call = (env, method, path, body, headers = ADMIN) => worker.fetch(new Request(`https://worker.example${path}`, {
  method,
  headers: { Origin: SITE, 'Content-Type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body)
}), env, ctx);
const read = async (res) => ({ status: res.status, body: await res.json() });

// Ledger rows go through the real endpoints so they're journaled like production.
async function seedBooks(env) {
  const expense = (date, amount, category = 'Inventory - Survival Node Components', notes = 'parts') =>
    call(env, 'POST', '/api/tax/expense', { date, vendor: 'Amazon', category, amount, paidVia: 'bank', notes });
  const income = (date, amount) => call(env, 'POST', '/api/tax/income', { date, source: 'Stripe - Survival Node', category: 'Survival Node Sales', amount, notes: 'sale' });
  for (const res of [
    await expense('2026-03-09', '1000.00'),
    await expense('2026-05-01', '50.00', 'Advertising/Marketing', 'ads'),
    await income('2026-06-01', '800.00'),
    await expense('2027-01-15', '200.00'),
    await income('2027-02-01', '400.00')
  ]) {
    const { status, body } = await read(res);
    assert.equal(status, 200, JSON.stringify(body));
  }
}

const journalFor = (env, sourceType) => env.DB.sqlite.prepare(`
  SELECT je.entry_date, a.code, jl.debit_cents, jl.credit_cents
  FROM journal_entries je JOIN journal_lines jl ON jl.entry_id = je.id JOIN accounts a ON a.id = jl.account_id
  WHERE je.source_type = ? ORDER BY je.entry_date, a.code`).all(sourceType).map(r => ({ ...r }));

const summary = async (env, year) => read(await call(env, 'GET', `/api/tax/summary?year=${year}`, undefined, { 'X-Tax-Read-Token': 'tax-read-test-token' }));

test('saving a parts count posts a Dec 31 adjustment and a Jan 1 carry-in, and the summary follows it', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  await seedBooks(env);

  let r = await read(await call(env, 'GET', '/api/accounts/inventory-count?year=2026'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.count, null);

  r = await summary(env, 2026);
  assert.deepEqual([r.body.incomeCents, r.body.expenseCents, r.body.netCents], [80000, 105000, -25000]);

  r = await read(await call(env, 'POST', '/api/accounts/inventory-count', {
    year: 2026,
    countDate: '2026-12-31',
    lines: [
      { item: 'Phones (Moto G Power)', qty: 3, unitCents: 5399 },
      { item: 'Hard cases', qty: 2, unitCents: 2217 },
      { item: 'Locks', qty: 0, unitCents: 348 } // nothing on hand: dropped
    ]
  }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const total = 3 * 5399 + 2 * 2217;
  assert.equal(r.body.count.totalCents, total);
  assert.deepEqual(r.body.count.lines.map(l => l.item), ['Phones (Moto G Power)', 'Hard cases']);
  assert.equal(r.body.yearCloseApplied, false);

  assert.deepEqual(journalFor(env, 'inventory_count'), [
    { entry_date: '2026-12-31', code: '1200', debit_cents: total, credit_cents: 0 },
    { entry_date: '2026-12-31', code: '5210', debit_cents: 0, credit_cents: total },
    { entry_date: '2027-01-01', code: '1200', debit_cents: 0, credit_cents: total },
    { entry_date: '2027-01-01', code: '5210', debit_cents: total, credit_cents: 0 }
  ]);

  // Summary: 2026 loses the parts on hand, 2027 gains them back.
  r = await summary(env, 2026);
  assert.equal(r.body.ledgerExpenseCents, 105000);
  assert.equal(r.body.expenseCents, 105000 - total);
  assert.deepEqual(r.body.partsOnHand, { startOfYearCents: 0, endOfYearCents: total });
  r = await summary(env, 2027);
  assert.equal(r.body.expenseCents, 20000 + total);
  assert.deepEqual(r.body.partsOnHand, { startOfYearCents: total, endOfYearCents: 0 });

  // The Income Statement (journal) agrees with the summary, and the parts sit on the balance sheet.
  r = await read(await call(env, 'GET', '/api/accounts/statements?year=2026'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.totals.income - r.body.totals.expenses, 80000 - (105000 - total));
  assert.equal(r.body.balanceSheet.assets.find(a => a.code === '1200')?.balance_cents, total);
  r = await read(await call(env, 'GET', '/api/accounts/statements?year=2027'));
  assert.equal(r.body.totals.expenses, 20000 + total);

  // Re-saving replaces the pair instead of adding another.
  r = await read(await call(env, 'POST', '/api/accounts/inventory-count', { year: 2026, countDate: '2027-01-01', lines: [{ item: 'Phones (Moto G Power)', qty: 1, unitCents: 5000 }] }));
  assert.equal(r.status, 200);
  const entries = journalFor(env, 'inventory_count');
  assert.equal(entries.length, 4);
  assert.ok(entries.every(e => e.debit_cents === 5000 || e.credit_cents === 5000));

  r = await read(await call(env, 'GET', '/api/accounts/inventory-count?year=2027'));
  assert.equal(r.body.previousYearCents, 5000);

  // Delete takes it all back out.
  r = await read(await call(env, 'POST', '/api/accounts/inventory-count/delete', { year: 2026 }));
  assert.equal(r.status, 200);
  assert.equal(journalFor(env, 'inventory_count').length, 0);
  r = await summary(env, 2026);
  assert.equal(r.body.expenseCents, 105000);
});

test('parts count rejects bad input and needs an admin', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const bad = async (body) => (await call(env, 'POST', '/api/accounts/inventory-count', body)).status;
  assert.equal(await bad({ year: 'x', lines: [] }), 400);
  assert.equal(await bad({ year: 2026, countDate: '12/31/2026', lines: [] }), 400);
  assert.equal(await bad({ year: 2026, lines: [{ item: '', qty: 1, unitCents: 100 }] }), 400);
  assert.equal(await bad({ year: 2026, lines: [{ item: 'Phones', qty: -1, unitCents: 100 }] }), 400);
  assert.equal(await bad({ year: 2026, lines: [{ item: 'Phones', qty: 1, unitCents: 1.5 }] }), 400);
  assert.equal((await call(env, 'GET', '/api/accounts/inventory-count?year=2026', undefined, {})).status, 401);
  assert.equal((await call(env, 'POST', '/api/accounts/inventory-count', { year: 2026, lines: [] }, {})).status, 401);
});

test('year-end close sums only its own year and a re-run replaces it', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  await seedBooks(env);
  await call(env, 'POST', '/api/accounts/inventory-count', { year: 2026, lines: [{ item: 'Phones (Moto G Power)', qty: 2, unitCents: 10000 }] });

  let r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2026', apply: false }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const steps = Object.fromEntries(r.body.preview.steps.map(s => [s.step, s.amount_cents]));
  // 2026 only: $800 revenue; $1,050 expenses less $200 of parts on hand. 2027's rows and the
  // Jan 1 carry-in are not part of the 2026 close.
  assert.deepEqual(steps, { 1: 80000, 2: 85000, 3: -5000 });
  assert.deepEqual(r.body.preview.partsCount, { saved: true, required: true, totalCents: 20000, countDate: '2026-12-31' });

  for (let i = 0; i < 2; i++) {
    r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2026', apply: true }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.fromEntries(r.body.preview.steps.map(s => [s.step, s.amount_cents])), { 1: 80000, 2: 85000, 3: -5000 }, `run ${i + 1}`);
  }
  // After two runs the 2026 revenue and expense accounts are closed to zero, once.
  const balances = env.DB.sqlite.prepare(`
    SELECT a.account_type AS type, SUM(jl.debit_cents - jl.credit_cents) AS net
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
    WHERE je.entry_date BETWEEN '2026-01-01' AND '2026-12-31' AND a.account_type IN ('income', 'expense')
    GROUP BY a.account_type`).all();
  for (const b of balances) assert.equal(b.net, 0, `${b.type} closed to zero`);

  r = await read(await call(env, 'GET', '/api/accounts/inventory-count?year=2026'));
  assert.equal(r.body.yearCloseApplied, true);
});

// ---- Pricing helpers from admin.js ----
function pricing() {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const start = js.indexOf('    // ===== Parts count pricing =====');
  const end = js.indexOf('    // ===== DOM Refs =====');
  assert.ok(start >= 0 && end > start, 'pricing block found in admin.js');
  return new Function(`${js.slice(start, end)}\nreturn { classifyPartPurchase, partPurchaseQty, buildPartLots, fifoPartValue, suggestPartUnitCents };`)();
}

test('purchase notes are sorted into parts with their quantities', () => {
  const { classifyPartPurchase: kind, partPurchaseQty: qty } = pricing();
  const cases = [
    ['(7) Moto G Power Phones [owner-funded]', 'phone', 7],
    ['OnePlus 8 5G UW 128GB 8GB Phone [owner-funded]', 'phone', 1],
    ['Purchased 4 Moto G Power 2024 Phones', 'phone', 4],
    ['One Moto G Power 2024 phone', 'phone', 1],
    ['(5) Moto G Power Phone Cases', 'phoneCase', 5],
    ['Phone Case for Moto G Power', 'phoneCase', 1],
    ['12 locks for Survival Node hard cases', 'lock', 12],
    ['(8) pad locks with keys', 'lock', 8],
    ['(10) Hard Cases', 'hardCase', 10],
    ['5 Vevor Hard Cases', 'hardCase', 5],
    ['Faraday Bags 2 Pack [owner-funded]', 'faraday', 2],
    ['Pack of 4 Mission Darkness Faraday Bags', 'faraday', 4],
    ['4 pack of Mission Darkness Faraday Bags', 'faraday', 4],
    ['Two Solar Batteries (Gen 2)', 'solar', 2],
    ['Pack of 2 Power Banks', 'solar', 2],
    ['25 pack of charging blocks', 'charger', 25],
    ['24 pack of rechargable dessicant', 'desiccant', 24],
    ['(50) Silica Packs', 'desiccant', 50],
    ['Anker Cable', 'cable', 1]
  ];
  for (const [text, key, n] of cases) {
    assert.equal(kind(text).key, key, text);
    assert.equal(qty(text), n, text);
  }
  assert.equal(kind('Solar Battery and 4 Charging Blocks').key, null);
  assert.deepEqual(kind('Solar Battery and 4 Charging Blocks').mixed, ['solar', 'charger']);
  assert.equal(kind('Shipping label').key, null);
});

test('refunds cancel their purchase and units on hand are priced newest first', () => {
  const { buildPartLots, fifoPartValue, suggestPartUnitCents } = pricing();
  const rows = [
    { id: 1, date: '2026-03-09', amount_cents: 1695, notes: '(8) pad locks with keys' },
    { id: 2, date: '2026-03-11', amount_cents: 3799, notes: '12 locks' },
    { id: 3, date: '2026-03-12', amount_cents: -1695, notes: 'Refund for first lock purchase' },
    { id: 4, date: '2026-03-09', amount_cents: 31175, notes: '(7) Moto G Power Phones' },
    { id: 5, date: '2026-11-02', amount_cents: 23596, notes: 'Purchased 4 Moto G Power 2024 Phones' },
    { id: 6, date: '2026-11-03', amount_cents: 5388, notes: '(1) Moto G Power 2024 Phone' },
    { id: 7, date: '2026-10-14', amount_cents: 4797, notes: 'Solar Battery and 4 Charging Blocks' },
    { id: 8, date: '2026-03-06', amount_cents: -4027, notes: 'Refund for case to offset other record entry' },
    { id: 9, date: '2026-03-01', amount_cents: 4027, notes: 'Jack Boss Hard Case' }
  ];
  const { lots, skipped } = buildPartLots(rows);
  assert.deepEqual(lots.lock.map(l => l.id), [2], 'the refunded 8-pack is gone');
  assert.equal(lots.hardCase, undefined, 'an unlabelled refund still cancels its purchase by amount');
  assert.deepEqual(lots.phone.map(l => l.id), [6, 5, 4], 'newest first');
  assert.deepEqual(skipped.map(s => s.id), [7]);

  // 3 phones on hand: the newest one ($53.88) and two from the 4-pack ($58.99 each).
  const v = fifoPartValue(lots.phone, 3);
  assert.equal(v.cents, 5388 + 2 * 5899);
  assert.equal(v.short, 0);
  // More on hand than bought: the rest at the average price.
  const over = fifoPartValue(lots.lock, 14);
  assert.equal(over.short, 2);
  assert.equal(over.cents, 3799 + Math.round(2 * 3799 / 12));
  assert.equal(suggestPartUnitCents(lots, 'phone', 0), 5388);
  assert.equal(suggestPartUnitCents(lots, 'lock', 0), Math.round(3799 / 12));
  assert.equal(suggestPartUnitCents(lots, 'cable', 1), 0, 'no purchases, no suggestion');
});

test('a year that bought parts cannot be closed until its parts count is saved', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  await seedBooks(env);
  const closeEntries = () => env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM journal_entries WHERE source_type = 'year_close'").get().n;

  let r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2026', apply: false }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.preview.partsCount, { saved: false, required: true });

  r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2026', apply: true }));
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(r.body.error, /Save the 2026 Year-End Parts Count first/);
  assert.equal(closeEntries(), 0, 'nothing written');

  // Nothing on the shelf: a count of 0 is enough.
  r = await read(await call(env, 'POST', '/api/accounts/inventory-count', { year: 2026, lines: [{ item: 'Phones (Moto G Power)', qty: 0, unitCents: 5000 }] }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.count.totalCents, 0);
  r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2026', apply: true }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(closeEntries() > 0);

  // 2027 carries in the 2026 count, so it needs its own count too (here: 2027 also bought parts).
  r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2027', apply: false }));
  assert.deepEqual(r.body.preview.partsCount, { saved: false, required: true });

  // A year with no parts bought and nothing carried in closes without one.
  r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2025', apply: false }));
  assert.deepEqual(r.body.preview.partsCount, { saved: false, required: false });
  r = await read(await call(env, 'POST', '/api/accounts/year-close', { year: '2025', apply: true }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test('batteries and Faraday bags each split into their two kinds', () => {
  const { buildPartLots, fifoPartValue } = pricing();
  const rows = [
    { id: 1, date: '2026-03-01', amount_cents: 5200, notes: 'Pack of 2 Power Banks [owner-funded]' },
    { id: 2, date: '2026-03-06', amount_cents: 4380, notes: '(4) Standard Solar Batteries [owner-funded]' },
    { id: 3, date: '2026-03-09', amount_cents: 19790, notes: '10 Solar Batteries [owner-funded]' },
    { id: 4, date: '2026-09-11', amount_cents: 7398, notes: 'Two Solar Batteries (Gen 2)' },
    { id: 5, date: '2026-11-02', amount_cents: 7398, notes: '2 Solar Batteries' }, // Gen 2 by price
    { id: 6, date: '2026-03-06', amount_cents: 3526, notes: '(2) Standard Faraday Bag Sets [owner-funded]' },
    { id: 7, date: '2026-11-01', amount_cents: 9000, notes: '4 pack of Mission Darkness Faraday Bags' }
  ];
  const { lots } = buildPartLots(rows);
  assert.deepEqual(lots.solarGen2.map(l => l.id), [5, 4]);
  assert.deepEqual(lots.solarGen1.map(l => l.id), [3, 2, 1]);
  assert.deepEqual(lots.faradayMD.map(l => l.id), [7]);
  assert.deepEqual(lots.faradayStd.map(l => l.id), [6]);
  assert.equal(lots.solar, undefined);
  // 8 Gen 1 batteries left are priced as Gen 1, not at the newer Gen 2 price.
  assert.equal(fifoPartValue(lots.solarGen1, 8).cents, 8 * 1979);
});
