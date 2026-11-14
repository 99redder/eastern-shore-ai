// The admin Recent Bookings / Blocks list: Delete removes a blocked day or slot row;
// Unblock (active: false) only marks it inactive and keeps the row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const SITE = 'https://www.easternshore.ai';
const UA = 'Mozilla/5.0 (Macintosh) Chrome/142.0.0.0 Safari/537.36';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const ctx = { waitUntil() {} };

function baseEnv() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) {
      if (!file.startsWith('0023_')) throw e;
    }
  }
  return { DB, ALLOWED_ORIGINS: SITE, ADMIN_PASSWORD: 'admin-test-password', TOTP_SECRET };
}

function totpNow() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of TOTP_SECRET) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function loggedIn(env) {
  const res = await worker.fetch(new Request('https://worker.example/api/admin/login', {
    method: 'POST',
    headers: { Origin: SITE, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin-test-password', code: totpNow() })
  }), env, ctx);
  assert.equal(res.status, 200);
  return (await res.json()).sessionToken;
}

const post = (env, token, path, body) => worker.fetch(new Request(`https://worker.example${path}`, {
  method: 'POST',
  headers: { Origin: SITE, 'User-Agent': UA, 'Content-Type': 'application/json', 'X-Admin-Session': token },
  body: JSON.stringify(body)
}), env, ctx);

const count = (env, sql, ...args) => env.DB.sqlite.prepare(sql).get(...args).n;

function quietConsole(t) {
  for (const level of ['error', 'warn', 'log']) {
    const original = console[level];
    console[level] = () => {};
    t.after(() => { console[level] = original; });
  }
}

test('Delete removes a blocked day, including one already unblocked', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);

  assert.equal((await post(env, token, '/api/admin/block-day', { setupDate: '2026-03-01' })).status, 200);
  assert.equal((await post(env, token, '/api/admin/block-day', { setupDate: '2026-02-22' })).status, 200);
  // Unblock keeps the row, marked inactive (what the old Delete button did).
  assert.equal((await post(env, token, '/api/admin/block-day', { setupDate: '2026-03-01', active: false })).status, 200);
  assert.equal(count(env, 'SELECT COUNT(*) n FROM blocked_days WHERE setup_date = ? AND active = 0', '2026-03-01'), 1);

  const res = await post(env, token, '/api/admin/block-day', { setupDate: '2026-03-01', remove: true });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).deleted, 1);
  assert.equal(count(env, 'SELECT COUNT(*) n FROM blocked_days WHERE setup_date = ?', '2026-03-01'), 0);
  assert.equal(count(env, 'SELECT COUNT(*) n FROM blocked_days WHERE setup_date = ?', '2026-02-22'), 1, 'other days are left alone');
});

test('Delete removes a blocked slot', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);

  assert.equal((await post(env, token, '/api/admin/block-slot', { setupDate: '2026-03-02', setupTime: '12:00-14:00' })).status, 200);
  assert.equal((await post(env, token, '/api/admin/block-slot', { setupDate: '2026-03-02', setupTime: '14:00-16:00' })).status, 200);

  const res = await post(env, token, '/api/admin/block-slot', { setupDate: '2026-03-02', setupTime: '12:00-14:00', remove: true });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).deleted, 1);
  assert.equal(count(env, 'SELECT COUNT(*) n FROM blocked_slots WHERE setup_at = ?', '2026-03-02T12:00-14:00'), 0);
  assert.equal(count(env, 'SELECT COUNT(*) n FROM blocked_slots WHERE setup_at = ?', '2026-03-02T14:00-16:00'), 1);
});

test('Delete needs an admin session', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  await post(env, await loggedIn(env), '/api/admin/block-day', { setupDate: '2026-03-01' });
  const res = await post(env, 'not-a-session', '/api/admin/block-day', { setupDate: '2026-03-01', remove: true });
  assert.notEqual(res.status, 200);
  assert.equal(count(env, 'SELECT COUNT(*) n FROM blocked_days'), 1);
});
