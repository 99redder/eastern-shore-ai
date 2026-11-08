// Ledger completeness: the admin adds up whatever /api/tax/transactions and /api/accounts/journal
// return, so those lists must hold the whole year and the admin's loader must refuse a partial
// one. (Florence Mae Gifts' copy of this admin stopped at 500 rows and its 2026 snapshot left out
// ~560 expenses; ESA's journal had the same 500 cap.) These tests run a year bigger than the old
// caps through the worker and through the loader code copied out of admin.js.
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
      // 0023 seeds its sequence from existing orders; an empty test DB has none.
      if (!file.startsWith('0023_')) throw e;
    }
  }
  return { DB, ALLOWED_ORIGINS: 'https://easternshore.ai,https://www.easternshore.ai', ADMIN_PASSWORD: 'admin-test-password' };
}

function quietConsole(t) {
  for (const level of ['error', 'warn', 'log']) {
    const original = console[level];
    console[level] = () => {};
    t.after(() => { console[level] = original; });
  }
}

const EXPENSES_2026 = 5200; // past both the old 500 (journal) and 5,000 (admin ledger request) caps
const INCOME_2026 = 40;
const expenseCents = (i) => 20 + (i % 7) * 113;

function seedLedger(env) {
  const db = env.DB.sqlite;
  const addExpense = db.prepare('INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents, paid_via, notes) VALUES (?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  for (let i = 0; i < EXPENSES_2026; i++) {
    addExpense.run(`2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, 'Vendor', 'Supplies', expenseCents(i), 'card', `Expense ${i}`);
  }
  addExpense.run('2025-12-31', 'Vendor', 'Supplies', 20, 'card', 'Other year');
  const addIncome = db.prepare('INSERT INTO tax_income (income_date, source, category, amount_cents, notes) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < INCOME_2026; i++) addIncome.run(`2026-06-${String(1 + (i % 28)).padStart(2, '0')}`, 'Client', 'Service Revenue', 10000 + i, `Invoice ${i}`);
  db.exec('COMMIT');
  let cents = 0;
  for (let i = 0; i < EXPENSES_2026; i++) cents += expenseCents(i);
  return { count: EXPENSES_2026, cents };
}

function seedJournal(env, entries) {
  const db = env.DB.sqlite;
  // The worker seeds the real chart of accounts at runtime; two test accounts are enough here.
  db.exec("INSERT INTO accounts (code, name, account_type, normal_side) VALUES ('9998', 'Test Debit', 'asset', 'debit'), ('9999', 'Test Credit', 'income', 'credit')");
  const [a, b] = db.prepare("SELECT id FROM accounts WHERE code IN ('9998', '9999') ORDER BY code").all().map((r) => r.id);
  const addEntry = db.prepare("INSERT INTO journal_entries (entry_date, memo, source_type, source_id) VALUES (?, ?, 'manual', ?)");
  const addLine = db.prepare('INSERT INTO journal_lines (entry_id, account_id, debit_cents, credit_cents) VALUES (?, ?, ?, ?)');
  db.exec('BEGIN');
  for (let i = 0; i < entries; i++) {
    const { lastInsertRowid } = addEntry.run(`2026-${String(1 + (i % 12)).padStart(2, '0')}-15`, `Entry ${i}`, i + 1);
    addLine.run(lastInsertRowid, a, 100, 0);
    addLine.run(lastInsertRowid, b, 0, 100);
  }
  db.exec('COMMIT');
}

const get = (path) => new Request(`https://worker.example${path}`, { headers: { Origin: SITE, ...ADMIN } });

test('tax transactions return the whole year, with database totals, past the old caps', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const expected = seedLedger(env);

  let res = await worker.fetch(get('/api/tax/transactions?year=2026&type=all'), env, ctx);
  let body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body).slice(0, 300));
  assert.equal(body.expenses.length, EXPENSES_2026);
  assert.equal(body.income.length, INCOME_2026);
  assert.deepEqual(body.totals.expenses, expected);
  assert.equal(body.totals.income.count, INCOME_2026);
  assert.deepEqual(body.complete, { expenses: true, income: true });

  res = await worker.fetch(get('/api/tax/transactions?year=2026&type=expense&limit=100'), env, ctx);
  body = await res.json();
  assert.equal(body.expenses.length, 100);
  assert.equal(body.totals.expenses.count, EXPENSES_2026);
  assert.equal(body.complete.expenses, false);
  assert.equal(body.complete.income, true);

  res = await worker.fetch(get('/api/tax/transactions?year=2025&type=all'), env, ctx);
  body = await res.json();
  assert.deepEqual(body.totals.expenses, { count: 1, cents: 20 });
});

test('journal list returns every entry by default and reports the total when limited', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  seedJournal(env, 650);

  let res = await worker.fetch(get('/api/accounts/journal?year=2026'), env, ctx);
  let body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body).slice(0, 300));
  assert.equal(body.entries.length, 650);
  assert.equal(body.total_entries, 650);
  assert.equal(body.complete, true);

  res = await worker.fetch(get('/api/accounts/journal?year=2026&limit=200'), env, ctx);
  body = await res.json();
  assert.equal(body.entries.length, 200);
  assert.equal(body.total_entries, 650);
  assert.equal(body.complete, false);

  res = await worker.fetch(get('/api/accounts/journal?year=2024'), env, ctx);
  body = await res.json();
  assert.deepEqual({ n: body.entries.length, total: body.total_entries, complete: body.complete }, { n: 0, total: 0, complete: true });
});

// The loader block from admin.js, run against the worker (or a stand-in for an old one).
function adminLoaders(fetchImpl) {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const start = js.indexOf('    // ===== Complete-ledger loading =====');
  const end = js.indexOf('    // ===== DOM Refs =====');
  assert.ok(start >= 0 && end > start, 'loader block found in admin.js');
  return new Function('fetch', 'TAX_TX_API_URL', 'ACCOUNTS_JOURNAL_API_URL', 'adminSessionToken',
    `${js.slice(start, end)}\nreturn { TaxDataIncompleteError, loadTaxYear, loadFullJournal };`
  )(fetchImpl, 'https://worker.example/api/tax/transactions', 'https://worker.example/api/accounts/journal', 'session');
}

test('admin loader accepts a complete year and refuses a partial one', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  seedLedger(env);
  seedJournal(env, 650);
  const viaWorker = (url) => { const u = new URL(url); return worker.fetch(get(u.pathname + u.search), env, ctx); };

  const live = adminLoaders(viaWorker);
  const data = await live.loadTaxYear(2026);
  assert.equal(data.expenses.length, EXPENSES_2026);
  assert.equal(data.integrity.ok, true);
  assert.equal((await live.loadFullJournal(2026)).entries.length, 650);

  const dropsARow = adminLoaders(async (url) => {
    const body = await (await viaWorker(url)).json();
    body.expenses = body.expenses.slice(1);
    return Response.json(body);
  });
  await assert.rejects(dropsARow.loadTaxYear(2026), (e) => e instanceof dropsARow.TaxDataIncompleteError && /loaded 5199 of 5200 rows/.test(e.message));
  assert.equal((await dropsARow.loadTaxYear(2026, { allowIncomplete: true })).integrity.ok, false);

  // A worker from before this check: a full 500-entry journal with no total is treated as cut off.
  const oldJournal = adminLoaders(async () => Response.json({ ok: true, entries: Array.from({ length: 500 }, (_, i) => ({ id: i, lines: [] })) }));
  await assert.rejects(oldJournal.loadFullJournal(2026), oldJournal.TaxDataIncompleteError);
});

test('tax summary leaves owner-funded income out of income and net', async (t) => {
  quietConsole(t);
  const env = { ...baseEnv(), TAX_READ_TOKEN: 'tax-read-test-token' };
  const db = env.DB.sqlite;
  const addIncome = db.prepare('INSERT INTO tax_income (income_date, source, category, amount_cents, notes, is_owner_funded) VALUES (?, ?, ?, ?, ?, ?)');
  addIncome.run('2026-05-01', 'Etsy', 'Product Sale', 10000, 'sale', 0);
  addIncome.run('2026-05-02', 'Card issuer', 'Credit Card Bonus', 2000, 'bonus', 0);
  addIncome.run('2026-02-14', 'Stripe', 'Owner Funded (Non-Revenue)', 1000, 'test purchase', 1);      // flagged
  addIncome.run('2026-02-15', 'Stripe', 'Owner Funded (Non-Revenue)', 500, 'unflagged category', 0);  // by category
  addIncome.run('2026-02-16', 'Stripe (owner test payment)', 'Service Revenue', 100, 'by source', 0); // by source
  addIncome.run('2025-12-31', 'Etsy', 'Product Sale', 9999, 'other year', 0);
  db.prepare('INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents) VALUES (?, ?, ?, ?)').run('2026-05-03', 'Store', 'Supplies', 3000);

  const summary = (token) => worker.fetch(new Request('https://worker.example/api/tax/summary?year=2026', {
    headers: { Origin: SITE, 'X-Tax-Read-Token': token }
  }), env, ctx);
  const res = await summary('tax-read-test-token');
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.incomeCents, 12000, 'sale + card bonus, no owner money');
  assert.equal(body.ownerFundedCents, 1600);
  assert.equal(body.expenseCents, 3000);
  assert.equal(body.netCents, 9000);
  assert.equal((await summary('wrong-token')).status, 401);
});
