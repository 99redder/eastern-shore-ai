// node.html visit counting: the /api/page/visit endpoint and the section it adds to the 8 AM email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { classifySource, pageVisitSummary } from '../src/page-visits.js';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
function createDb() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) { if (!file.startsWith('0023_')) throw e; }
  }
  return DB;
}
const env = () => ({ DB: createDb(), ALLOWED_ORIGINS: 'https://www.easternshore.ai' });
const ctx = { waitUntil() {} };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
function visit(e, body, { ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile', ip = '1.2.3.4', cf = { city: 'Salisbury', region: 'Maryland', country: 'US' } } = {}) {
  const req = new Request('https://api.example/api/page/visit', {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: 'https://www.easternshore.ai', 'User-Agent': ua, 'CF-Connecting-IP': ip },
  });
  Object.defineProperty(req, 'cf', { value: cf });
  return worker.fetch(req, e, ctx);
}

test('classifySource labels referrers', () => {
  assert.equal(classifySource('', ''), 'direct');
  assert.equal(classifySource('', 'www.google.com'), 'google');
  assert.equal(classifySource('', 'old.reddit.com'), 'reddit');
  assert.equal(classifySource('', 'l.facebook.com'), 'facebook/instagram');
  assert.equal(classifySource('google ads', 'www.google.com'), 'google ads');
  assert.equal(classifySource('', 'example.org'), 'other site');
});

test('visits are stored, bots and Chris skipped, and summarized', async () => {
  const e = env();
  assert.equal((await visit(e, { page: 'node', ref: 'www.google.com' })).status, 200);
  await visit(e, { page: 'node', ref: 'www.google.com' });                       // same person again
  await visit(e, { page: 'node', ref: 'www.reddit.com' }, { ip: '5.6.7.8', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', cf: { city: 'Dover', region: 'Delaware', country: 'US' } });
  await visit(e, { page: 'node' }, { ip: '9.9.9.9', ua: 'Googlebot/2.1' });       // bot
  await visit(e, { page: 'node', me: true }, { ip: '8.8.8.8' });                   // Chris
  await visit(e, { page: 'garcias' }, { ip: '7.7.7.7' });                          // not a tracked page
  const rows = e.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM page_visits').get();
  assert.equal(rows.n, 3);

  const s = await pageVisitSummary(e, today);
  assert.equal(s.visitors, 2);
  const text = s.lines.join('\n');
  assert.match(text, /Visitors: 2 \(3 page views\)/);
  assert.match(text, /Came from: (google 1, reddit 1|reddit 1, google 1)/);
  assert.match(text, /phone 1/);
  assert.match(text, /Salisbury, Maryland/);
  assert.match(text, /Dover, Delaware/);
});

test('a quiet day says so', async () => {
  const s = await pageVisitSummary(env(), '2026-01-01');
  assert.equal(s.visitors, 0);
  assert.match(s.lines.join('\n'), /No visits\./);
});
