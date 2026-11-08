// Admin logins (password + authenticator code): each use pushes the end to 12 hours out,
// never past 7 days after logging in; Log Out ends it on the server.
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
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

const login = (env, code) => worker.fetch(new Request('https://worker.example/api/admin/login', {
  method: 'POST',
  headers: { Origin: SITE, 'User-Agent': UA, 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'admin-test-password', code })
}), env, ctx);

const call = (env, token, path = '/api/admin/session', { method = 'GET', ua = UA } = {}) => worker.fetch(new Request(`https://worker.example${path}`, {
  method,
  headers: { Origin: SITE, 'User-Agent': ua, 'X-Admin-Session': token }
}), env, ctx);

const sqlTime = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const row = (env) => env.DB.sqlite.prepare('SELECT created_at, expires_at FROM admin_sessions').get();
const setRow = (env, { createdMs, expiresMs }) => env.DB.sqlite
  .prepare('UPDATE admin_sessions SET created_at = ?, expires_at = ?')
  .run(sqlTime(createdMs), expiresMs);

function quietConsole(t) {
  for (const level of ['error', 'warn', 'log']) {
    const original = console[level];
    console[level] = () => {};
    t.after(() => { console[level] = original; });
  }
}

async function loggedIn(env) {
  const res = await login(env, totpNow());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.sessionToken);
  return body.sessionToken;
}

test('a wrong authenticator code is refused; the right one gives a 12-hour login', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const bad = await login(env, totpNow() === '000000' ? '111111' : '000000');
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).totpRequired, true);

  const token = await loggedIn(env);
  const { expires_at } = row(env);
  assert.ok(Math.abs(expires_at - (Date.now() + 12 * HOUR)) < 60_000);
  assert.equal((await call(env, token)).status, 200);
  assert.equal((await call(env, token, '/api/bookings')).status, 200);
});

test('using admin pushes the end 12 hours out', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);
  // Logged in 11 hours ago, not used since: one hour left.
  setRow(env, { createdMs: Date.now() - 11 * HOUR, expiresMs: Date.now() + HOUR });
  assert.equal((await call(env, token)).status, 200);
  assert.ok(Math.abs(row(env).expires_at - (Date.now() + 12 * HOUR)) < 60_000);
});

test('a login never lasts past 7 days, however much it is used', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);
  const createdMs = Date.now() - (6 * DAY + 20 * HOUR);
  setRow(env, { createdMs, expiresMs: Date.now() + HOUR });
  assert.equal((await call(env, token)).status, 200);
  const capMs = Date.parse(`${sqlTime(createdMs).replace(' ', 'T')}Z`) + 7 * DAY;
  assert.equal(row(env).expires_at, capMs);

  setRow(env, { createdMs: Date.now() - 7 * DAY - 1000, expiresMs: Date.now() - 1000 });
  assert.equal((await call(env, token)).status, 401);
  assert.equal((await call(env, token, '/api/bookings')).status, 401);
});

test('12 hours without use ends the login', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);
  setRow(env, { createdMs: Date.now() - 13 * HOUR, expiresMs: Date.now() - HOUR });
  assert.equal((await call(env, token)).status, 401);
});

test('a login only works in the browser it was made in', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);
  assert.equal((await call(env, token, '/api/admin/session', { ua: 'curl/8.0' })).status, 401);
});

test('Log Out ends the login on the server', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const token = await loggedIn(env);
  const res = await call(env, token, '/api/admin/logout', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(row(env), undefined);
  assert.equal((await call(env, token)).status, 401);
});
