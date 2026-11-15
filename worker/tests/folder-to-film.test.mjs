// Folder to Film end to end through src/index.js: checkout -> payment (webhook or
// the dashboard's own Stripe check) -> books -> dashboard edits -> R2 multipart
// uploads -> Start production -> admin emails and signed downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { addBusinessDays, FILM_PRICE_CENTS, FILM_TAX_CODE } from '../src/folder-to-film.js';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const WEBHOOK_SECRET = 'whsec_test_only';
const SITE = 'https://www.easternshore.ai';
const ADMIN = { 'X-Admin-Password': 'admin-test-password' };
const ctx = { waitUntil() {} };

function createDb() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) {
      if (!file.startsWith('0023_')) throw e;
    }
  }
  return DB;
}

// Every email from every test, for the BCC check at the end of the file.
const ALL_SENT = [];
function fakeEmail() {
  const sent = [];
  return { sent, async send(message) { sent.push(message); ALL_SENT.push(message); return { messageId: `cf-${sent.length}` }; } };
}

// In-memory R2 bucket with the multipart calls the module uses.
function fakeR2() {
  const objects = new Map();
  const uploads = new Map();
  let n = 0;
  return {
    objects,
    async createMultipartUpload(key, opts) {
      const uploadId = `up-${++n}`;
      uploads.set(uploadId, { key, parts: new Map(), opts });
      return { key, uploadId };
    },
    resumeMultipartUpload(key, uploadId) {
      const u = uploads.get(uploadId);
      return {
        async uploadPart(partNumber, body) {
          const bytes = new Uint8Array(await new Response(body).arrayBuffer());
          u.parts.set(partNumber, bytes);
          return { partNumber, etag: `etag-${partNumber}-${bytes.length}` };
        },
        async complete(parts) {
          const chunks = parts.map((p) => u.parts.get(p.partNumber));
          const size = chunks.reduce((s, c) => s + c.length, 0);
          const all = new Uint8Array(size);
          let off = 0;
          for (const c of chunks) { all.set(c, off); off += c.length; }
          objects.set(key, { bytes: all, contentType: u.opts?.httpMetadata?.contentType });
          uploads.delete(uploadId);
          return { key, size };
        },
        async abort() { uploads.delete(uploadId); },
      };
    },
    async get(key, opts = {}) {
      const o = objects.get(key);
      if (!o) return null;
      const r = opts.range;
      const bytes = r ? o.bytes.slice(r.offset, r.offset + r.length) : o.bytes;
      return { body: new Blob([bytes]).stream(), size: o.bytes.length };
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, httpMetadata: { contentType: o.contentType || 'video/mp4' } } : null;
    },
    async delete(key) { objects.delete(key); },
  };
}

function baseEnv(overrides = {}) {
  return {
    DB: createDb(),
    EMAIL: fakeEmail(),
    FILMS: fakeR2(),
    ALLOWED_ORIGINS: 'https://easternshore.ai,https://www.easternshore.ai',
    TO_EMAIL: 'owner@inbox.example',
    FROM_EMAIL: 'noreply@easternshore.ai',
    CONTACT_FROM_EMAIL: 'Eastern Shore AI <contact@easternshore.ai>',
    ORDERS_FROM_EMAIL: 'orders@easternshore.ai',
    ALERTS_FROM_EMAIL: 'alerts@easternshore.ai',
    BCC_EMAIL: 'emailconfirm@easternshore.ai',
    ADMIN_PASSWORD: 'admin-test-password',
    STRIPE_SECRET_KEY: 'sk_test_only',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  };
}

function quietConsole(t) {
  for (const level of ['error', 'warn', 'log']) {
    const original = console[level];
    console[level] = () => {};
    t.after(() => { console[level] = original; });
  }
}

// Stripe stand-in: creating sessions, reading them back, and the fee lookup.
function stubStripe(t, { paid = true } = {}) {
  const calls = [];
  const sessions = new Map();
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    calls.push({ url, init });
    if (url === 'https://api.stripe.com/v1/checkout/sessions' && init.method === 'POST') {
      const params = new URLSearchParams(init.body);
      const id = `cs_test_film_${sessions.size + 1}`;
      sessions.set(id, params);
      return Response.json({ id, url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const m = url.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/(cs_[\w]+)/);
    if (m) {
      const params = sessions.get(m[1]);
      return Response.json(sessionObject(m[1], params.get('metadata[film_project_id]'), paid));
    }
    if (url.startsWith('https://api.stripe.com/v1/payment_intents/')) {
      return Response.json({ id: 'pi_film', latest_charge: { payment_method_details: { type: 'card' }, balance_transaction: { fee: 610 } } });
    }
    throw new Error(`unexpected network call in test: ${url}`);
  };
  t.after(() => { globalThis.fetch = original; });
  return { calls, sessions };
}

function sessionObject(id, projectId, paid = true) {
  return {
    id, payment_intent: 'pi_film', payment_status: paid ? 'paid' : 'unpaid', amount_total: 21199,
    total_details: { amount_tax: 1200 },
    customer_details: { name: 'Pat Family', email: 'pat@family.example', phone: '+14105550100', address: { state: 'MD' } },
    metadata: { checkout_type: 'folder_to_film', film_project_id: String(projectId) },
  };
}

async function signedWebhook(event) {
  const payload = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://worker.example/api/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${ts},v1=${v1}` }, body: payload });
}

// The trusted-browser token for the film under test (set by paidProject / signIn).
let DEVICE = null;
const dev = () => (DEVICE ? { 'X-Film-Device': DEVICE } : {});
const post = (path, body, headers = {}) => new Request(`https://worker.example${path}`, {
  method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/json', ...dev(), ...headers }, body: JSON.stringify(body),
});
const get = (path, headers = {}) => new Request(`https://worker.example${path}`, { headers: { Origin: SITE, ...dev(), ...headers } });
const call = async (env, req) => {
  const res = await worker.fetch(req, env, ctx);
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

async function checkout(env) {
  const r = await call(env, post('/api/film/checkout', { termsAccepted: true, termsVersion: '2026-11-14.8' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = env.DB.sqlite.prepare('SELECT * FROM film_projects ORDER BY id DESC LIMIT 1').get();
  return { ...r.data, row };
}

async function paidProject(t, env) {
  DEVICE = null;
  const stripe = stubStripe(t);
  const c = await checkout(env);
  const res = await worker.fetch(await signedWebhook({ id: 'evt_film_1', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: sessionObject(c.id, c.row.id) } }), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  // The buyer's browser comes back from Stripe with the session id and is trusted.
  const back = await call(env, get(`/api/film/dashboard?t=${c.row.token}&session_id=${c.id}`));
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.ok(back.data.deviceToken, 'device token for the paying browser');
  DEVICE = back.data.deviceToken;
  return { stripe, token: c.row.token, id: c.row.id, sessionId: c.id };
}

test('checkout creates an unpaid project and a taxed Stripe session that returns to the dashboard', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const stripe = stubStripe(t);
  const c = await checkout(env);
  assert.match(c.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(c.row.status, 'pending_payment');
  assert.equal(c.row.stripe_session_id, c.id);
  assert.ok(c.row.token.length >= 40);
  const p = stripe.sessions.get(c.id);
  assert.equal(p.get('automatic_tax[enabled]'), 'true');
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), String(FILM_PRICE_CENTS));
  assert.equal(p.get('line_items[0][price_data][product_data][tax_code]'), FILM_TAX_CODE);
  assert.equal(p.get('billing_address_collection'), 'required');
  assert.equal(p.get('metadata[checkout_type]'), 'folder_to_film');
  assert.equal(p.get('metadata[film_project_id]'), String(c.row.id));
  assert.equal(p.get('success_url'), `${SITE}/my-film.html?t=${c.row.token}&session_id={CHECKOUT_SESSION_ID}`);
});

test('payment webhook books income and fee once, emails the dashboard link and alerts staff', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { id, token, sessionId } = await paidProject(t, env);
  const row = env.DB.sqlite.prepare('SELECT * FROM film_projects WHERE id = ?').get(id);
  assert.equal(row.status, 'collecting');
  assert.equal(row.customer_email, 'pat@family.example');
  assert.equal(row.amount_cents, 21199);
  assert.equal(row.tax_cents, 1200);
  assert.equal(row.billing_state, 'MD');
  const income = env.DB.sqlite.prepare('SELECT * FROM tax_income WHERE stripe_session_id = ?').all(sessionId);
  assert.equal(income.length, 1);
  assert.equal(income[0].category, 'Folder to Film Sales');
  assert.equal(income[0].source, 'Stripe - Folder to Film');
  assert.equal(income[0].amount_cents, 21199);
  assert.match(income[0].notes, /includes \$12\.00 sales tax \(MD\)/);
  const fee = env.DB.sqlite.prepare(`SELECT * FROM tax_expenses WHERE notes LIKE 'Auto Stripe fee for Folder to Film session%'`).all();
  assert.equal(fee.length, 1);
  assert.equal(fee[0].amount_cents, 610);
  const journal = env.DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type IN ('tax_income', 'tax_expense')`).get();
  assert.equal(journal.n, 2);

  const welcome = env.EMAIL.sent.find((m) => m.subject === 'Your Folder to Film dashboard is ready');
  assert.ok(welcome, 'welcome email');
  assert.deepEqual(welcome.to, ['pat@family.example']);
  assert.equal(welcome.from.email, 'contact@easternshore.ai');
  assert.ok(welcome.html.includes(`https://www.easternshore.ai/my-film.html?t=${token}`));
  assert.ok(env.EMAIL.sent.some((m) => /New Folder to Film order/.test(m.subject) && m.to.includes('owner@inbox.example')));

  // Stripe retries the same event: nothing doubles.
  const before = env.EMAIL.sent.length;
  const res = await worker.fetch(await signedWebhook({ id: 'evt_film_1', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: sessionObject(sessionId, id) } }), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tax_income').get().n, 1);
  assert.equal(env.EMAIL.sent.length, before);
});

test('the dashboard confirms payment with Stripe when it loads before the webhook', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  DEVICE = null;
  stubStripe(t);
  const c = await checkout(env);
  const r = await call(env, get(`/api/film/dashboard?t=${c.row.token}&session_id=${c.id}`));
  assert.equal(r.status, 200);
  assert.equal(r.data.project.status, 'collecting');
  assert.ok(r.data.deviceToken);
  assert.equal(r.data.project.questions.length, 12);
  // The webhook arriving afterwards changes nothing.
  const sent = env.EMAIL.sent.length;
  await worker.fetch(await signedWebhook({ id: 'evt_late', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: sessionObject(c.id, c.row.id) } }), env, ctx);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tax_income').get().n, 1);
  assert.equal(env.EMAIL.sent.length, sent);
});

test('an unpaid or unknown token gets nothing editable', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  DEVICE = null;
  stubStripe(t, { paid: false });
  const c = await checkout(env);
  const r = await call(env, get(`/api/film/dashboard?t=${c.row.token}`));
  assert.equal(r.data.project.status, 'pending_payment');
  assert.equal((await call(env, post('/api/film/dashboard', { t: c.row.token, projectName: 'x' }))).status, 409);
  assert.equal((await call(env, get('/api/film/dashboard?t=nope-not-a-real-token-at-all-000'))).status, 404);
  // An expired checkout removes the unpaid row.
  const res = await worker.fetch(await signedWebhook({ id: 'evt_exp', type: 'checkout.session.expired', data: { object: { id: c.id, metadata: { checkout_type: 'folder_to_film', film_project_id: String(c.row.id) } } } }), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM film_projects').get().n, 0);
});

test('details, any-file multipart uploads, and Start production with a business-day demo date', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);

  // Start is refused until there's a name, a story and a file or link.
  const early = await call(env, post('/api/film/start', { t: token }));
  assert.equal(early.status, 400);
  assert.match(early.data.error, /project name/);

  const save = await call(env, post('/api/film/dashboard', {
    t: token, projectName: "Dad's Retirement", about: '34 years at the plant', occasion: 'Retirement party', neededBy: '2026-12-12',
    answers: { style: 'Animated cartoon', tone: 'Funny', shown_at: ['At work', 'Not an option'], names: 'Gorham = GOR-um', narrator: 'Robot' },
  }));
  assert.equal(save.status, 200);
  const row = env.DB.sqlite.prepare('SELECT * FROM film_projects WHERE id = ?').get(id);
  assert.deepEqual(JSON.parse(row.answers_json), { style: 'Animated cartoon', tone: 'Funny', shown_at: ['At work'], names: 'Gorham = GOR-um' });

  // A 3-part video and a voice memo.
  const part = 20 * 1024 * 1024;
  const size = part * 2 + 1234;
  const s = await call(env, post('/api/film/upload/start', { t: token, name: 'beach/trip?.MOV', size, type: 'video/quicktime' }));
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.equal(s.data.parts, 3);
  const etags = [];
  for (let n = 1; n <= 3; n++) {
    const len = n < 3 ? part : 1234;
    const res = await worker.fetch(new Request(`https://worker.example/api/film/upload/part?t=${token}&file=${s.data.fileId}&part=${n}`, {
      method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/octet-stream', ...dev() }, body: new Uint8Array(len).fill(n),
    }), env, ctx);
    const d = await res.json();
    assert.equal(res.status, 200, JSON.stringify(d));
    etags.push({ part: d.part, etag: d.etag });
  }
  const done = await call(env, post('/api/film/upload/complete', { t: token, fileId: s.data.fileId, parts: etags }));
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.file.size, size);
  assert.equal(done.data.file.name, 'beach_trip?.MOV');
  assert.equal(done.data.file.by, 'Pat Family', 'the buyer is recorded as the uploader');
  const [key] = [...env.FILMS.objects.keys()];
  assert.match(key, new RegExp(`^projects/${id}/`));

  const memo = await call(env, post('/api/film/upload/start', { t: token, name: 'grandpa.m4a', size: 5, type: 'audio/mp4' }));
  const mp = await worker.fetch(new Request(`https://worker.example/api/film/upload/part?t=${token}&file=${memo.data.fileId}&part=1`, { method: 'POST', headers: { Origin: SITE, ...dev() }, body: 'hello' }), env, ctx);
  const md = await mp.json();
  await call(env, post('/api/film/upload/complete', { t: token, fileId: memo.data.fileId, parts: [md] }));
  // ...and one the customer deletes again.
  await call(env, post('/api/film/upload/delete', { t: token, fileId: memo.data.fileId }));
  assert.equal(env.FILMS.objects.size, 1);

  const dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.data.project.uploads.length, 1);
  assert.equal(dash.data.project.uploads[0].by, 'Pat Family');
  assert.equal(dash.data.project.totalBytes, size);

  const start = await call(env, post('/api/film/start', { t: token }));
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const after = env.DB.sqlite.prepare('SELECT * FROM film_projects WHERE id = ?').get(id);
  assert.equal(after.status, 'production');
  assert.match(after.demo_due_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(env.EMAIL.sent.some((m) => /^Production started: your demo will be ready by /.test(m.subject) && m.to.includes('pat@family.example')));
  assert.ok(env.EMAIL.sent.some((m) => /^Start production: Dad's Retirement/.test(m.subject) && m.to.includes('owner@inbox.example')));
  // Locked once production starts.
  assert.equal((await call(env, post('/api/film/dashboard', { t: token, projectName: 'Changed' }))).status, 409);
  assert.equal((await call(env, post('/api/film/upload/start', { t: token, name: 'late.jpg', size: 10 }))).status, 409);
  assert.equal((await call(env, post('/api/film/start', { t: token }))).status, 409);
  // Notes lock too; the locked messages point to the project chat.
  const lateNotes = await call(env, post('/api/film/notes', { t: token, notes: 'One more thing' }));
  assert.equal(lateNotes.status, 409);
  assert.match(lateNotes.data.error, /project chat/);
  assert.match((await call(env, post('/api/film/dashboard', { t: token, projectName: 'x' }))).data.error, /project chat/);
});

test('demo date skips weekends and closing days', () => {
  assert.equal(addBusinessDays('2026-11-13', 3), '2026-11-18'); // Fri -> Wed
  assert.equal(addBusinessDays('2026-11-24', 3), '2026-11-30'); // Tue, skips Thanksgiving + weekend
  assert.equal(addBusinessDays('2026-12-23', 3), '2026-12-29'); // skips Christmas + weekend
});

test('admin: list, demo email moves status, feedback, signed downloads, auth required', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);
  assert.equal((await call(env, get('/api/film/projects'))).status, 401);
  const list = await call(env, get('/api/film/projects', ADMIN));
  assert.equal(list.status, 200);
  assert.equal(list.data.projects[0].id, id);
  assert.equal(list.data.summary.collecting, 1);

  await call(env, post('/api/film/dashboard', { t: token, projectName: 'Lake Week', about: 'The pontoon boat', links: 'https://photos.example/album' }));
  await call(env, post('/api/film/start', { t: token }));

  const noLink = await call(env, post('/api/film/email', { id, kind: 'demo', preview: true }, ADMIN));
  assert.equal(noLink.status, 400);
  assert.equal((await call(env, post('/api/film/project/update', { id, demoUrl: 'http://insecure.example' }, ADMIN))).status, 400);
  assert.equal((await call(env, post('/api/film/project/update', { id, demoUrl: 'https://youtu.be/demo123' }, ADMIN))).status, 200);
  const preview = await call(env, post('/api/film/email', { id, kind: 'demo', preview: true }, ADMIN));
  assert.equal(preview.data.subject, 'Your demo is ready: Lake Week');
  assert.ok(preview.data.html.includes(`my-film.html?t=${token}`));
  const sent = await call(env, post('/api/film/email', { id, kind: 'demo', send: true }, ADMIN));
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(env.DB.sqlite.prepare('SELECT status FROM film_projects WHERE id = ?').get(id).status, 'demo_ready');
  const dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.data.project.demoUrl, 'https://youtu.be/demo123');

  const blankMsg = await call(env, post('/api/film/email', { id, kind: 'message', send: true }, ADMIN));
  assert.equal(blankMsg.status, 400);

  const fb = await call(env, post('/api/film/feedback', { t: token, text: 'Uncle Ray is spelled Rae' }));
  assert.equal(fb.status, 200);
  // More notes before the next demo are the same round; changes on a new demo start round 2.
  await call(env, post('/api/film/feedback', { t: token, text: 'And the music a bit softer' }));
  assert.equal(env.DB.sqlite.prepare('SELECT change_rounds FROM film_projects WHERE id = ?').get(id).change_rounds, 1);
  await call(env, post('/api/film/email', { id, kind: 'demo', send: true }, ADMIN));
  await call(env, post('/api/film/feedback', { t: token, text: 'One last name fix' }));
  assert.equal(env.DB.sqlite.prepare('SELECT change_rounds FROM film_projects WHERE id = ?').get(id).change_rounds, 2);
  const rounds = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(rounds.data.project.changeRounds, 2);
  assert.equal(rounds.data.project.roundsIncluded, 2);
  const row = env.DB.sqlite.prepare('SELECT * FROM film_projects WHERE id = ?').get(id);
  assert.equal(row.status, 'changes');
  assert.match(row.feedback, /Uncle Ray is spelled Rae/);
  assert.match(row.feedback, /One last name fix/);
  assert.ok(env.EMAIL.sent.some((m) => /^Changes requested: Lake Week/.test(m.subject)));

  // Signed download of an uploaded file (added directly).
  env.FILMS.objects.set(`projects/${id}/abc-photo.jpg`, { bytes: new Uint8Array([1, 2, 3]) });
  env.DB.sqlite.prepare(`INSERT INTO film_uploads (project_id, r2_key, filename, content_type, size_bytes, status) VALUES (?, ?, 'photo.jpg', 'image/jpeg', 3, 'done')`).run(id, `projects/${id}/abc-photo.jpg`);
  const fileId = env.DB.sqlite.prepare('SELECT id FROM film_uploads ORDER BY id DESC LIMIT 1').get().id;
  const link = await call(env, post('/api/film/file-link', { fileId }, ADMIN));
  assert.equal(link.status, 200);
  const dl = await worker.fetch(new Request(link.data.url), env, ctx);
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('Content-Disposition'), /photo\.jpg/);
  assert.deepEqual([...new Uint8Array(await dl.arrayBuffer())], [1, 2, 3]);
  const forged = await worker.fetch(new Request(link.data.url.replace(/s=[0-9a-f]+/, 's=' + '0'.repeat(64))), env, ctx);
  assert.equal(forged.status, 403);

  // Paid projects can't be deleted until canceled.
  assert.equal((await call(env, post('/api/film/project/delete', { id }, ADMIN))).status, 400);
  await call(env, post('/api/film/project/update', { id, status: 'canceled' }, ADMIN));
  assert.equal((await call(env, post('/api/film/project/delete', { id }, ADMIN))).status, 200);
  assert.equal(env.FILMS.objects.size, 0);
});

test('Folder to Film Ask K: own key and counters, busy reply names its key, status emails go only to the order address', async (t) => {
  quietConsole(t);
  const bodies = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.startsWith('https://api.anthropic.com/v1/models')) return Response.json({ data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' });
    if (url.startsWith('https://api.anthropic.com/v1/messages')) {
      bodies.push({ key: init.headers?.['x-api-key'] || new Headers(init.headers).get('x-api-key'), body: JSON.parse(init.body) });
      return Response.json({ id: 'msg_f', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: 'text', text: JSON.stringify({ reply: 'It is $199.99, and your demo comes 2 to 3 business days after you press Start production.', lookup: false }) }] });
    }
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) return Response.json({ success: true });
    if (url.startsWith('https://api.stripe.com/')) return Response.json({});
    throw new Error(`unexpected network call in test: ${url}`);
  };
  t.after(() => { globalThis.fetch = original; });

  const env = baseEnv({ FILM_ANTHROPIC_API_KEY: 'sk-ant-film-only', ANTHROPIC_API_KEY: 'sk-ant-node-only' });
  let r = await call(env, post('/api/film/ask-k', { message: 'How much does a film cost and how long does it take?' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.reply, /\$199\.99/);
  assert.equal(bodies.at(-1).key, 'sk-ant-film-only');
  const sys = bodies.at(-1).body.system.map((b) => b.text).join('\n');
  assert.match(sys, /GROUNDED KNOWLEDGE \(Folder to Film by Eastern Shore AI\)/);
  assert.match(sys, /Start production/);
  const rows = env.DB.sqlite.prepare('SELECT provider, questions FROM askk_daily').all();
  assert.ok(rows.some((x) => x.provider === 'film_claude' && x.questions === 1), JSON.stringify(rows));
  assert.ok(!rows.some((x) => x.provider === 'claude'), 'Survival Node counters untouched');

  // No film key: busy reply, the order box still shows for status questions, and the pause email names the film key.
  const env2 = baseEnv({ ANTHROPIC_API_KEY: 'sk-ant-node-only' });
  r = await call(env2, post('/api/film/ask-k', { message: 'When will my film be ready?' }));
  assert.match(r.data.reply, /Ask K is busy right now/);
  assert.equal(r.data.lookup, true);
  const paused = env2.EMAIL.sent.find((m) => /^Ask K is paused \(Folder to Film\)/.test(m.subject));
  assert.ok(paused, 'pause email');
  assert.match(paused.text, /FILM_ANTHROPIC_API_KEY/);

  // Status email: only to an address with a paid film, with status, estimated completion and dashboard link.
  const env3 = baseEnv({ ASKK_TURNSTILE_ENFORCE: '1', TURNSTILE_SECRET_KEY: 'ts-test', ASKK_PASS_SECRET: 'pass-test' });
  env3.DB.sqlite.prepare(`INSERT INTO film_projects (token, status, project_name, customer_name, customer_email, demo_due_date, estimated_done_date, paid_at)
    VALUES ('tok_status_test_0123456789abcdef0123', 'production', 'Lake Week', 'Pat Family', 'Pat@Family.example', '2026-11-18', '2026-11-20', datetime('now'))`).run();
  r = await call(env3, post('/api/film/ask-k/status', { email: 'nobody@else.example', turnstileToken: 'ok' }));
  assert.equal(r.status, 200);
  assert.match(r.data.reply, /If that email address has a Folder to Film order/);
  assert.equal(env3.EMAIL.sent.length, 0);
  r = await call(env3, post('/api/film/ask-k/status', { email: 'pat@family.example', pass: r.data.pass }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(env3.EMAIL.sent.length, 1);
  const mail = env3.EMAIL.sent[0];
  assert.deepEqual(mail.to, ['Pat@Family.example']);
  assert.equal(mail.subject, 'Lake Week: In production');
  assert.match(mail.text, /demo is expected by Wednesday, November 18, and the finished film by Friday, November 20/);
  assert.match(mail.text, /my-film\.html\?t=tok_status_test_0123456789abcdef0123/);
  const counts = env3.DB.sqlite.prepare(`SELECT provider, questions FROM askk_daily WHERE provider = 'film_status'`).get();
  assert.equal(counts.questions, 2);
});

test('checkout needs the terms; retention purge, link reset', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  DEVICE = null;
  stubStripe(t);
  const refused = await call(env, post('/api/film/checkout', {}));
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Terms and Privacy/);
  const c = await checkout(env);
  assert.equal(c.row.terms_version, '2026-11-14.8');
  assert.ok(c.row.terms_accepted_at);

  // Raw uploads go 12 months after the final film; the project (film, dashboard) stays.
  const db = env.DB.sqlite;
  db.prepare(`INSERT INTO film_projects (id, token, status, final_sent_at) VALUES (50, 'tok_old_0123456789abcdef0123456789abcd', 'delivered', datetime('now', '-400 days'))`).run();
  db.prepare(`INSERT INTO film_projects (id, token, status, final_sent_at, uploads_purged_at) VALUES (51, 'tok_older_0123456789abcdef0123456789ab', 'delivered', datetime('now', '-900 days'), datetime('now', '-500 days'))`).run();
  db.prepare(`INSERT INTO film_projects (id, token, status, final_sent_at) VALUES (52, 'tok_new_0123456789abcdef0123456789abcd', 'final_ready', datetime('now', '-100 days'))`).run();
  for (const [pid, key] of [[50, 'projects/50/a-old.jpg'], [52, 'projects/52/a-new.jpg']]) {
    env.FILMS.objects.set(key, { bytes: new Uint8Array([1]) });
    db.prepare(`INSERT INTO film_uploads (project_id, r2_key, filename, size_bytes, status) VALUES (?, ?, 'a.jpg', 1, 'done')`).run(pid, key);
  }
  const pending = [];
  await worker.scheduled({ cron: '0 12 * * *', scheduledTime: Date.now() }, env, { waitUntil: (p) => pending.push(p.catch(() => {})) });
  await Promise.all(pending);
  assert.equal(env.FILMS.objects.has('projects/50/a-old.jpg'), false);
  assert.equal(env.FILMS.objects.has('projects/52/a-new.jpg'), true);
  assert.ok(db.prepare('SELECT uploads_purged_at FROM film_projects WHERE id = 50').get().uploads_purged_at);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM film_projects WHERE id = 51').get().n, 1, 'old films are kept');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM film_projects WHERE id = 52').get().n, 1);

  // Reset a leaked dashboard link: the old one stops working.
  const old = 'tok_new_0123456789abcdef0123456789abcd';
  const r = await call(env, post('/api/film/project/update', { id: 52, rotateToken: true }, ADMIN));
  assert.equal(r.status, 200);
  assert.equal((await call(env, get(`/api/film/dashboard?t=${old}`))).status, 404);
  assert.notEqual(db.prepare('SELECT token FROM film_projects WHERE id = 52').get().token, old);
});

test('project chat: its own tables, never the support console; customer messages email staff; replies from admin email the customer when away; notes save', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);
  const db = env.DB.sqlite;
  env.EMAIL.sent.length = 0;
  const staffMail = () => env.EMAIL.sent.filter((m) => /^Film chat: /.test(m.subject));
  const replies = () => env.EMAIL.sent.filter((m) => m.subject === 'Chris replied about your film');

  let r = await call(env, get(`/api/film/chat?t=${token}`));
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.messages, []);

  r = await call(env, post('/api/film/chat', { t: token, content: 'Can we use the song from our first dance?' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_sessions').get().n, 0, 'nothing reaches the support chat console');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM film_messages WHERE project_id = ?').get(id).n, 1);
  assert.equal(staffMail().length, 1);
  assert.match(staffMail()[0].text, /first dance/);
  assert.match(staffMail()[0].text, /admin\.html/);
  assert.doesNotMatch(staffMail()[0].text, /support-chat/);
  // A quick follow-up before any reply is covered by that email.
  await call(env, post('/api/film/chat', { t: token, content: 'Also, Grandma is Yiayia in the family.' }));
  assert.equal(staffMail().length, 1);
  // A few minutes later, still unanswered: it emails again.
  db.prepare('UPDATE film_projects SET last_staff_alert_at = ? WHERE id = ?').run(new Date(Date.now() - 4 * 60000).toISOString(), id);
  await call(env, post('/api/film/chat', { t: token, content: 'One more thing!' }));
  assert.equal(staffMail().length, 2);

  // Admin replies while the customer is away: they get an email with the reply.
  db.prepare(`UPDATE film_projects SET customer_seen_at = datetime('now', '-10 minutes') WHERE id = ?`).run(id);
  assert.notEqual((await call(env, post('/api/film/chat/reply', { id, content: 'x' }))).status, 200, 'admin only');
  r = await call(env, post('/api/film/chat/reply', { id, content: 'Great idea. We can use a licensed version that sounds just like it.' }, ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.emailed, true);
  assert.equal(replies().length, 1);
  assert.deepEqual(replies()[0].to, ['pat@family.example']);
  assert.match(replies()[0].text, /licensed version/);
  assert.match(replies()[0].html, /my-film\.html\?t=[^"]+#chat/);
  // After a reply, the customer's next message emails staff right away.
  await call(env, post('/api/film/chat', { t: token, content: 'Perfect, thanks!' }));
  assert.equal(staffMail().length, 3);
  // A second reply soon after doesn't email the customer again; the dashboard shows everything.
  r = await call(env, post('/api/film/chat/reply', { id, content: 'Anything else?' }, ADMIN));
  assert.equal(r.data.emailed, false);
  assert.equal(replies().length, 1);
  r = await call(env, get(`/api/film/chat?t=${token}`));
  assert.deepEqual(r.data.messages.map((m) => m.role), ['user', 'user', 'user', 'staff', 'user', 'staff']);
  assert.equal(r.data.messages[3].sender_name, 'Chris');

  // Customer on the dashboard right now (they just loaded the chat): no email.
  db.prepare('UPDATE film_projects SET last_reply_email_at = NULL WHERE id = ?').run(id);
  r = await call(env, post('/api/film/chat/reply', { id, content: 'Seen?' }, ADMIN));
  assert.equal(r.data.emailed, false);
  // Staff watching in the staff view: customer messages don't email.
  db.prepare(`UPDATE film_projects SET staff_seen_at = datetime('now'), last_staff_alert_at = NULL WHERE id = ?`).run(id);
  await call(env, post('/api/film/chat', { t: token, content: 'Hi Chris!' }));
  assert.equal(staffMail().length, 3);

  // Notes save while collecting and show in admin with the whole chat.
  r = await call(env, post('/api/film/notes', { t: token, notes: 'Please leave out photos of Uncle Bob.' }));
  assert.equal(r.status, 200);
  const detail = await call(env, get(`/api/film/project?id=${id}`, ADMIN));
  assert.equal(detail.data.project.customer_notes, 'Please leave out photos of Uncle Bob.');
  assert.equal(detail.data.chat.length, 8);
  const dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.data.project.notes, 'Please leave out photos of Uncle Bob.');
  assert.equal(dash.data.project.chat, true);
  // Deleting a canceled film removes its chat too.
  await call(env, post('/api/film/project/update', { id, status: 'canceled' }, ADMIN));
  await call(env, post('/api/film/project/delete', { id }, ADMIN));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM film_messages WHERE project_id = ?').get(id).n, 0);
});

test('migration 0043 moves film chats out of the support console', () => {
  const DB = createD1();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files.filter((f) => f < '0043')) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) { if (!file.startsWith('0023_')) throw e; }
  }
  const db = DB.sqlite;
  db.prepare(`INSERT INTO chat_sessions (id, session_token, page, status, escalated_at, created_at, last_activity_at) VALUES (18, 'film-x', 'Folder to Film: Church', 'active', '2026-11-14T21:44:40.443Z', '2026-11-14T21:44:40.443Z', '2026-11-14T21:45:00.492Z')`).run();
  db.prepare(`INSERT INTO chat_sessions (id, session_token, page, status, escalated_at, created_at, last_activity_at) VALUES (19, 'sn-y', 'Survival Node', 'active', '2026-11-14T21:00:00.000Z', '2026-11-14T21:00:00.000Z', '2026-11-14T21:00:00.000Z')`).run();
  for (const [sid, role, who, text, at] of [[18, 'system', 'System', 'Project chat for Folder to Film #2.', '2026-11-14T21:44:40.443Z'], [18, 'staff', 'Chris', 'test', '2026-11-14T21:44:40.561Z'],
    [18, 'user', 'Chris Gorham', 'Test', '2026-11-14T21:45:00.492Z'], [19, 'user', 'Visitor', 'Battery question', '2026-11-14T21:00:00.000Z']]) {
    db.prepare('INSERT INTO chat_messages (session_id, role, sender_name, content, created_at) VALUES (?, ?, ?, ?, ?)').run(sid, role, who, text, at);
  }
  db.prepare(`INSERT INTO film_projects (id, token, status, chat_session_id) VALUES (2, 'tok_church_0123456789abcdef0123456789', 'collecting', 18)`).run();
  db.exec(readFileSync(new URL(files.find((f) => f.startsWith('0043')), MIGRATIONS), 'utf8'));
  assert.deepEqual(db.prepare('SELECT project_id, role, sender_name, content FROM film_messages ORDER BY id').all().map((m) => ({ ...m })),
    [{ project_id: 2, role: 'staff', sender_name: 'Chris', content: 'test' }, { project_id: 2, role: 'user', sender_name: 'Chris Gorham', content: 'Test' }]);
  assert.deepEqual(db.prepare('SELECT id FROM chat_sessions').all().map((r) => r.id), [19], 'Survival Node chats stay');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get().n, 1);
  assert.equal(db.prepare('SELECT chat_session_id FROM film_projects WHERE id = 2').get().chat_session_id, null);
});

test('dashboard access: codes only to the buyer or people they add; trusted browsers; removing someone locks them out', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);
  const owner = DEVICE;
  const codeFrom = (mail) => (mail.text.match(/is (\d{6})\./) || [])[1];

  // A new browser with only the link: no access.
  DEVICE = null;
  let r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(r.status, 401);
  assert.equal(r.data.needsCode, true);
  assert.equal(r.data.maskedEmail, 'p**@family.example');
  assert.equal((await call(env, post('/api/film/chat', { t: token, content: 'hi' }))).status, 401);
  assert.equal((await call(env, post('/api/film/upload/start', { t: token, name: 'x.jpg', size: 3 }))).status, 401);
  // The Stripe session id alone doesn't trust a browser a day after paying.
  env.DB.sqlite.prepare(`UPDATE film_projects SET paid_at = datetime('now', '-2 days') WHERE id = ?`).run(id);
  const sid = env.DB.sqlite.prepare('SELECT stripe_session_id FROM film_projects WHERE id = ?').get(id).stripe_session_id;
  assert.equal((await call(env, get(`/api/film/dashboard?t=${token}&session_id=${sid}`))).status, 401);

  // A code for an address nobody added: same reply, nothing sent.
  env.EMAIL.sent.length = 0;
  r = await call(env, post('/api/film/access/code', { t: token, email: 'stranger@else.example' }));
  assert.equal(r.status, 200);
  assert.match(r.data.message, /If that email has access/);
  assert.equal(env.EMAIL.sent.length, 0);

  // The buyer's own address gets a code; a wrong code fails; the right one trusts this browser.
  r = await call(env, post('/api/film/access/code', { t: token, email: 'PAT@family.example' }));
  assert.equal(env.EMAIL.sent.length, 1);
  assert.deepEqual(env.EMAIL.sent[0].to, ['pat@family.example']);
  const code = codeFrom(env.EMAIL.sent[0]);
  assert.match(code, /^\d{6}$/);
  assert.equal((await call(env, post('/api/film/access/verify', { t: token, email: 'pat@family.example', code: code === '000000' ? '111111' : '000000' }))).status, 400);
  r = await call(env, post('/api/film/access/verify', { t: token, email: 'pat@family.example', code }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  DEVICE = r.data.deviceToken;
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(r.status, 200);
  assert.equal(r.data.project.me.isOwner, true);
  // The code can't be used twice.
  assert.equal((await call(env, post('/api/film/access/verify', { t: token, email: 'pat@family.example', code }))).status, 400);

  // The buyer adds Sam, who gets an invitation, then a code, and can chat under their own name.
  env.EMAIL.sent.length = 0;
  r = await call(env, post('/api/film/people', { t: token, email: 'Sam@Family.example', name: 'Sam Lee' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.people.map((p) => p.email), ['pat@family.example', 'sam@family.example']);
  const invite = env.EMAIL.sent.find((m) => /invited you to help/.test(m.subject));
  assert.deepEqual(invite.to, ['sam@family.example']);
  assert.ok(invite.text.includes(`my-film.html?t=${token}`));
  DEVICE = null;
  await call(env, post('/api/film/access/code', { t: token, email: 'sam@family.example' }));
  const samCode = codeFrom(env.EMAIL.sent.at(-1));
  assert.deepEqual(env.EMAIL.sent.at(-1).to, ['sam@family.example']);
  r = await call(env, post('/api/film/access/verify', { t: token, email: 'sam@family.example', code: samCode }));
  const sam = r.data.deviceToken;
  DEVICE = sam;
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(r.data.project.me.isOwner, false);
  assert.equal(r.data.project.people, undefined, 'only the buyer sees the people list');
  r = await call(env, post('/api/film/chat', { t: token, content: 'I have the old camping photos!' }));
  assert.equal(r.data.message.sender_name, 'Sam Lee');
  assert.equal((await call(env, post('/api/film/people', { t: token, email: 'other@x.example' }))).status, 403);

  // The buyer removes Sam: Sam's browser is locked out and Sam can't get a new code.
  DEVICE = owner;
  r = await call(env, post('/api/film/people/remove', { t: token, email: 'sam@family.example' }));
  assert.deepEqual(r.data.people.map((p) => p.email), ['pat@family.example']);
  DEVICE = sam;
  assert.equal((await call(env, get(`/api/film/dashboard?t=${token}`))).status, 401);
  const before = env.EMAIL.sent.length;
  await call(env, post('/api/film/access/code', { t: token, email: 'sam@family.example' }));
  assert.equal(env.EMAIL.sent.length, before);

  // New Dashboard Link (admin) signs every browser out.
  await call(env, post('/api/film/project/update', { id, rotateToken: true }, ADMIN));
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM film_devices WHERE project_id = ?').get(id).n, 0);
});

test('delivery: admin uploads the final film; dashboard and share page play it with byte ranges and download it', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);
  await call(env, post('/api/film/dashboard', { t: token, projectName: 'Lake Week', about: 'Pontoon', links: 'https://x.example' }));
  await call(env, post('/api/film/start', { t: token }));

  // Upload the final film from admin in two parts.
  const part = 20 * 1024 * 1024;
  const size = part + 10;
  assert.equal((await call(env, post('/api/film/deliver/start', { id, kind: 'final', name: 'Lake Week FINAL.mp4', size, type: 'video/mp4' }))).status, 401);
  const st = await call(env, post('/api/film/deliver/start', { id, kind: 'final', name: 'Lake Week FINAL.mp4', size, type: 'video/mp4' }, ADMIN));
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.match(st.data.key, new RegExp(`^deliverables/${id}/final-[0-9a-f]{8}\\.mp4$`));
  const parts = [];
  for (let n = 1; n <= 2; n++) {
    const body = new Uint8Array(n === 1 ? part : 10).map((_, i) => (i + n) % 251);
    const res = await worker.fetch(new Request(`https://worker.example/api/film/deliver/part?id=${id}&key=${encodeURIComponent(st.data.key)}&uploadId=${encodeURIComponent(st.data.uploadId)}&part=${n}`,
      { method: 'POST', headers: { Origin: SITE, ...ADMIN }, body }), env, ctx);
    parts.push(await res.json());
  }
  // A key outside this project's folder is refused.
  const bad = await worker.fetch(new Request(`https://worker.example/api/film/deliver/part?id=${id}&key=${encodeURIComponent('projects/1/x')}&uploadId=x&part=1`, { method: 'POST', headers: { Origin: SITE, ...ADMIN }, body: 'x' }), env, ctx);
  assert.equal(bad.status, 400);
  const done = await call(env, post('/api/film/deliver/complete', { id, kind: 'final', key: st.data.key, uploadId: st.data.uploadId, parts }, ADMIN));
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.match(done.data.shareUrl, /film\.html\?s=/);

  // Not shown to the customer until the final is sent.
  let dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.data.project.finalSrc, undefined);
  const sent = await call(env, post('/api/film/email', { id, kind: 'final', send: true }, ADMIN));
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.ok(env.EMAIL.sent.some((m) => m.subject === 'Your film is ready: Lake Week' && /film\.html\?s=/.test(m.text)));
  dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  const { finalSrc, downloadUrl, shareUrl } = dash.data.project;
  assert.ok(finalSrc && downloadUrl && shareUrl);

  // Byte ranges (phones seek this way) and a download name.
  let res = await worker.fetch(new Request(finalSrc, { headers: { Range: 'bytes=0-9' } }), env, ctx);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('Content-Range'), `bytes 0-9/${size}`);
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  res = await worker.fetch(new Request(downloadUrl), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition'), /^attachment; filename="Lake Week\.mp4"/);
  assert.equal(Number(res.headers.get('Content-Length')), size);
  await res.arrayBuffer();
  // A tampered link fails.
  assert.equal((await worker.fetch(new Request(finalSrc.replace(/sig=[0-9a-f]+/, 'sig=' + 'a'.repeat(64))), env, ctx)).status, 403);

  // The share page works without dashboard access.
  const shareToken = new URL(shareUrl).searchParams.get('s');
  const info = await call(env, new Request(`https://worker.example/api/film/share?s=${shareToken}`, { headers: { Origin: SITE } }));
  assert.equal(info.status, 200);
  assert.equal(info.data.title, 'Lake Week');
  res = await worker.fetch(new Request(info.data.src, { headers: { Range: 'bytes=5-' } }), env, ctx);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('Content-Range'), `bytes 5-${size - 1}/${size}`);
  await res.arrayBuffer();

  // Deleting the canceled project removes the delivered video too.
  await call(env, post('/api/film/project/update', { id, status: 'canceled' }, ADMIN));
  await call(env, post('/api/film/project/delete', { id }, ADMIN));
  assert.equal([...env.FILMS.objects.keys()].filter((k) => k.startsWith('deliverables/')).length, 0);
});

test('staff view: admin opens any dashboard with a one-time link; staff messages go out as Chris and email the customer', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);
  const db = env.DB.sqlite;
  const buyer = DEVICE;

  // Only admin can make the link; it carries a one-time code.
  assert.notEqual((await call(env, post('/api/film/staff-link', { id }))).status, 200);
  const link = await call(env, post('/api/film/staff-link', { id }, ADMIN));
  assert.equal(link.status, 200, JSON.stringify(link.data));
  const u = new URL(link.data.url);
  assert.equal(u.origin + u.pathname, `${SITE}/my-film.html`);
  assert.equal(u.searchParams.get('t'), token);
  const code = u.searchParams.get('staff');
  assert.ok(code && code.length >= 40);

  // A new browser trades it for a staff sign-in, once; a wrong code gets nothing.
  DEVICE = null;
  assert.equal((await call(env, post('/api/film/access/staff', { t: token, code: 'f'.repeat(48) }))).status, 403);
  const ok = await call(env, post('/api/film/access/staff', { t: token, code }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.deviceToken);
  assert.equal((await call(env, post('/api/film/access/staff', { t: token, code }))).status, 403, 'the link works once');
  const dev = db.prepare(`SELECT * FROM film_devices WHERE project_id = ? AND email = 'staff'`).get(id);
  assert.ok(dev);
  assert.ok(db.prepare(`SELECT ? <= datetime('now', '+7 days', '+1 minute') AS ok`).get(dev.expires_at).ok, 'staff sign-in lasts a week');
  // The customer code form can't be used to become staff.
  assert.equal((await call(env, post('/api/film/access/verify', { t: token, email: 'staff', code: '123456' }))).status, 400);

  DEVICE = ok.data.deviceToken;
  const dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.status, 200, JSON.stringify(dash.data));
  assert.equal(dash.data.project.me.isStaff, true);
  assert.ok(Array.isArray(dash.data.project.people), 'staff see the people list');

  // Staff message from the dashboard = a console reply: role staff, from Chris, emails the customer, no staff alert.
  db.prepare(`UPDATE film_projects SET customer_seen_at = datetime('now', '-10 minutes') WHERE id = ?`).run(id);
  const seenBefore = db.prepare('SELECT customer_seen_at FROM film_projects WHERE id = ?').get(id).customer_seen_at;
  env.EMAIL.sent.length = 0;
  let r = await call(env, post('/api/film/chat', { t: token, content: 'Hi! Testing the chat from your dashboard.' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.message.role, 'staff');
  assert.equal(r.data.message.sender_name, 'Chris');
  assert.equal(env.EMAIL.sent.filter((m) => /^Film chat: /.test(m.subject)).length, 0);
  const toCustomer = env.EMAIL.sent.filter((m) => m.subject === 'Chris replied about your film');
  assert.equal(toCustomer.length, 1);
  assert.deepEqual(toCustomer[0].to, ['pat@family.example']);
  // Staff reading the chat doesn't count as the customer being there.
  await call(env, get(`/api/film/chat?t=${token}`));
  assert.equal(db.prepare('SELECT customer_seen_at FROM film_projects WHERE id = ?').get(id).customer_seen_at, seenBefore);
  // Staff typing shows to the customer as Chris.
  await call(env, post('/api/film/chat/typing', { t: token, typing: true }));
  DEVICE = buyer;
  r = await call(env, get(`/api/film/chat?t=${token}`));
  assert.equal(r.data.typing, 'Chris');
  assert.deepEqual(r.data.messages.map((m) => [m.role, m.sender_name]), [['staff', 'Chris']]);

  // Files staff add from the dashboard show as uploaded by Chris.
  DEVICE = ok.data.deviceToken;
  const up = await call(env, post('/api/film/upload/start', { t: token, name: 'from-chris.jpg', size: 4, type: 'image/jpeg' }));
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(db.prepare('SELECT uploaded_by FROM film_uploads WHERE id = ?').get(up.data.fileId).uploaded_by, 'Chris');

  // Staff can add people for the buyer.
  DEVICE = ok.data.deviceToken;
  r = await call(env, post('/api/film/people', { t: token, email: 'sam@family.example', name: 'Sam' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));

  // A new dashboard link signs staff out too.
  await call(env, post('/api/film/project/update', { id, rotateToken: true }, ADMIN));
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM film_devices WHERE project_id = ?`).get(id).n, 0);
});

test('dashboard: Need Help? Ask K skips the bot check for a signed-in customer and knows the film; keepsake photos are signed and shown inline', async (t) => {
  quietConsole(t);
  const env = baseEnv({ FILM_ANTHROPIC_API_KEY: 'sk-ant-film-only', ASKK_TURNSTILE_ENFORCE: '1', TURNSTILE_SECRET_KEY: 'ts-test', ASKK_PASS_SECRET: 'pass-test' });
  const { token, id } = await paidProject(t, env);
  env.DB.sqlite.prepare(`UPDATE film_projects SET project_name = 'Lake Week' WHERE id = ?`).run(id);
  const prev = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (url.startsWith('https://api.anthropic.com/v1/models')) return Response.json({ data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' });
    if (url.startsWith('https://api.anthropic.com/v1/messages')) {
      bodies.push(JSON.parse(init.body));
      return Response.json({ id: 'msg_d', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
        content: [{ type: 'text', text: JSON.stringify({ reply: 'Tap **Click to add photos & videos** and pick from your camera roll.', lookup: true }) }] });
    }
    if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) return Response.json({ success: false });
    return prev(input, init);
  };
  try {
    // The public page's bot check still applies without the film link.
    let r = await call(env, post('/api/film/ask-k', { message: 'How do I upload from my phone?' }));
    assert.equal(r.status, 403);
    assert.equal(r.data.needsVerification, true);
    // Film link + this browser's sign-in: answered, no order-status box, and Ask K knows where the film stands.
    r = await call(env, post('/api/film/ask-k', { t: token, message: 'How do I upload from my phone?' }));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.reply, /camera roll/);
    assert.equal(r.data.lookup, false);
    const sys = bodies.at(-1).system.map((b) => b.text).join('\n');
    assert.match(sys, /"Need Help\?" assistant/);
    assert.match(sys, /Project name: Lake Week\./);
    assert.match(sys, /Status: Collecting files\./);
    assert.match(sys, /Using your dashboard/);
    // The film link alone (no signed-in browser) is refused.
    const saved = DEVICE;
    DEVICE = null;
    r = await call(env, post('/api/film/ask-k', { t: token, message: 'How do I upload?' }));
    assert.equal(r.status, 401);
    DEVICE = saved;
  } finally {
    globalThis.fetch = prev;
  }

  // Keepsake photos: the customer's own images, as signed links that display inline.
  const size = 50000;
  const st = await call(env, post('/api/film/upload/start', { t: token, name: 'dock.jpg', size, type: 'image/jpeg' }));
  const pr = await worker.fetch(new Request(`https://worker.example/api/film/upload/part?t=${token}&file=${st.data.fileId}&part=1`, {
    method: 'POST', headers: { Origin: SITE, ...dev() }, body: new Uint8Array(size).fill(7) }), env, ctx);
  await call(env, post('/api/film/upload/complete', { t: token, fileId: st.data.fileId, parts: [await pr.json()] }));
  await call(env, post('/api/film/upload/start', { t: token, name: 'notes.pdf', size: 60000, type: 'application/pdf' }));   // never shown
  let k = await call(env, get(`/api/film/keepsake-photos?t=${token}`));
  assert.equal(k.status, 200, JSON.stringify(k.data));
  assert.equal(k.data.photos.length, 1);
  assert.equal(k.data.photos[0].name, 'dock.jpg');
  const u = new URL(k.data.photos[0].url);
  assert.equal(u.searchParams.get('inline'), '1');
  const img = await worker.fetch(new Request(`https://worker.example${u.pathname}${u.search}`), env, ctx);
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-disposition'), /^inline;/);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  u.searchParams.delete('inline');
  const dl = await worker.fetch(new Request(`https://worker.example${u.pathname}${u.search}`), env, ctx);
  assert.match(dl.headers.get('content-disposition'), /^attachment;/, 'admin download links stay attachments');
  DEVICE = null;
  k = await call(env, get(`/api/film/keepsake-photos?t=${token}`));
  assert.equal(k.status, 401, 'needs a signed-in browser');
});

test('film emails wear the Folder to Film colors; admin can email samples to the business inbox', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  assert.notEqual((await call(env, post('/api/film/email-samples', {}))).status, 200, 'admin only');
  let r = await call(env, post('/api/film/email-samples', {}, ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.sent.length, 4);
  const samples = env.EMAIL.sent.filter((m) => /^\[Sample\] /.test(m.subject));
  assert.equal(samples.length, 4);
  for (const m of samples) {
    assert.deepEqual(m.to, ['owner@inbox.example']);
    assert.match(m.html, /images\/story-video\/icon-180\.png/, 'film logo');
    assert.match(m.html, /Folder <i style="color:#C9A96E;">to Film<\/i>/, 'gold wordmark');
    assert.doesNotMatch(m.html, /#0E6E86|#00B8D4|esai-badge/, 'none of the general Eastern Shore AI blue');
    assert.ok(m.text.length > 40, 'plain-text part');
  }
  assert.ok(samples.some((m) => /replied about your film/.test(m.subject)));
});

test('keepsakes: buy on the keepsakes page (U.S. shipping, tax code, price); the paid webhook books it, records the order and tells everyone', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { stripe, token, id } = await paidProject(t, env);
  const db = env.DB.sqlite;
  env.DB.sqlite.prepare(`UPDATE film_projects SET project_name = 'Lake Week' WHERE id = ?`).run(id);

  let r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'book' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  let params = stripe.sessions.get(r.data.id);
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '14900');
  assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'), 'txcd_35010000');
  assert.equal(params.get('shipping_address_collection[allowed_countries][0]'), 'US');
  assert.equal(params.get('automatic_tax[enabled]'), 'true');
  assert.equal(params.get('metadata[checkout_type]'), 'film_keepsake');
  assert.equal(params.get('metadata[keepsake]'), 'book');
  assert.equal(params.get('metadata[ordered_by]'), 'pat@family.example');
  assert.equal(params.get('customer_email'), 'pat@family.example');
  assert.match(params.get('success_url'), /my-keepsakes\.html\?t=.+&paid=book$/);
  assert.match(params.get('line_items[0][price_data][product_data][name]'), /Lake Week/);
  // Copies are reprints of the hardcover, so they wait for a paid book order.
  const addr = (n) => ({ name: `Cousin ${n}`, line1: `${n} Elm St`, city: 'Portsmouth', state: 'NH', zip: '03801' });
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 2, recipients: [addr(1), addr(2)] }));
  assert.equal(r.status, 409);
  assert.match(r.data.error, /book has to be ordered first/);
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'audiobook' }));
  params = stripe.sessions.get(r.data.id);
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '2900');
  assert.equal(params.get('line_items[0][price_data][product_data][tax_code]'), 'txcd_10301000');
  assert.equal((await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'yacht' }))).status, 400);
  // Keepsakes are the hardcover (and its copies) and the audiobook; the picture book is gone for now.
  assert.equal((await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'picture' }))).status, 400);
  assert.match(params.get('custom_text[submit][message]'), /can't be refunded/);
  assert.match(params.get('line_items[0][price_data][product_data][description]'), /not just the film's soundtrack/);
  assert.equal(params.get('metadata[terms_version]'), '2026-11-14.8');
  const saved = DEVICE;
  DEVICE = null;
  assert.equal((await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'book' }))).status, 401);
  DEVICE = saved;
  // Pending orders don't show as orders.
  assert.deepEqual((await call(env, get(`/api/film/dashboard?t=${token}`))).data.project.keepsakeOrders, []);

  // Paid: order recorded once, income + fee booked, a note in the chat, a receipt and a staff alert.
  env.EMAIL.sent.length = 0;
  const event = { id: 'evt_keep_1', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: {
    id: 'cs_keep_1', payment_status: 'paid', amount_total: 15794, total_details: { amount_tax: 894 }, payment_intent: 'pi_keep',
    customer_details: { name: 'Pat Family', email: 'pat@family.example', address: { state: 'MD' } },
    collected_information: { shipping_details: { name: 'Pat Family', address: { line1: '1 Main St', city: 'Dover', state: 'NH', postal_code: '03820', country: 'US' } } },
    metadata: { checkout_type: 'film_keepsake', film_project_id: String(id), keepsake: 'book', qty: '1' } } } };
  let res = await worker.fetch(await signedWebhook(event), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const order = db.prepare(`SELECT * FROM film_keepsake_orders WHERE stripe_session_id = 'cs_keep_1'`).get();
  assert.equal(order.item, 'book');
  assert.equal(order.amount_cents, 15794);
  assert.match(order.ship_to, /1 Main St, Dover NH 03820/);
  const income = db.prepare(`SELECT * FROM tax_income WHERE stripe_session_id = 'cs_keep_1'`).get();
  assert.equal(income.category, 'Folder to Film Keepsakes');
  assert.equal(income.amount_cents, 15794);
  assert.ok(db.prepare(`SELECT id FROM tax_expenses WHERE notes LIKE 'Auto Stripe fee for Folder to Film keepsake session cs_keep_1%'`).get());
  assert.match(db.prepare(`SELECT content FROM film_messages WHERE project_id = ? ORDER BY id DESC`).get(id).content, /post a proof here/);
  const receipt = env.EMAIL.sent.find((m) => m.subject === 'Thank you for your order: Hardcover story book');
  assert.ok(receipt, 'receipt');
  assert.deepEqual(receipt.to, ['pat@family.example']);
  assert.match(receipt.html, /images\/story-video\/icon-180\.png/);
  assert.ok(env.EMAIL.sent.some((m) => /^Keepsake order: Hardcover story book \(Lake Week\)/.test(m.subject)));
  // A replay changes nothing.
  res = await worker.fetch(await signedWebhook({ ...event, id: 'evt_keep_2' }), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM tax_income WHERE stripe_session_id = 'cs_keep_1'`).get().n, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM film_keepsake_orders WHERE status = 'paid'`).get().n, 1);
  // The book is ordered once per film; after that it's copies.
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'book' }));
  assert.equal(r.status, 409);
  assert.equal(r.data.bookOrdered, true);
  assert.equal((await call(env, get(`/api/film/dashboard?t=${token}`))).data.project.bookOrdered, true);

  // Family copies: an address for every copy when there's more than one, U.S. only, saved with the order.
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 2, recipients: [addr(1)] }));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /address for each of the 2 copies/);
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 1, recipients: [{ ...addr(1), state: 'ON' }] }));
  assert.match(r.data.error, /U\.S\. addresses only/);
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 1, recipients: [{ ...addr(1), zip: '3801' }] }));
  assert.match(r.data.error, /ZIP/);
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 2, recipients: [addr(1), addr(2)] }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const copiesSession = r.data.id;
  params = stripe.sessions.get(copiesSession);
  assert.equal(params.get('line_items[0][quantity]'), '2');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '7900');
  assert.equal(params.get('shipping_address_collection[allowed_countries][0]'), null);
  const pendingCopies = db.prepare('SELECT * FROM film_keepsake_orders WHERE stripe_session_id = ?').get(copiesSession);
  assert.equal(pendingCopies.status, 'pending');
  assert.deepEqual(JSON.parse(pendingCopies.recipients).map((x) => x.name), ['Cousin 1', 'Cousin 2']);
  // One copy with no addresses: Stripe asks where to send it.
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 1 }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(stripe.sessions.get(r.data.id).get('shipping_address_collection[allowed_countries][0]'), 'US');

  // An abandoned checkout's pending order goes away when Stripe expires the session.
  const exp = await worker.fetch(await signedWebhook({ id: 'evt_keep_exp', type: 'checkout.session.expired', created: Math.floor(Date.now() / 1000), data: { object: { id: copiesSession, metadata: { checkout_type: 'film_keepsake', film_project_id: String(id) } } } }), env, ctx);
  assert.equal(exp.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM film_keepsake_orders WHERE stripe_session_id = ?').get(copiesSession).n, 0);

  // Family copies paid: the addresses entered before checkout go into the receipt, the alert and admin.
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 2, recipients: [addr(3), addr(4)] }));
  env.EMAIL.sent.length = 0;
  res = await worker.fetch(await signedWebhook({ id: 'evt_keep_copies', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: {
    id: r.data.id, payment_status: 'paid', amount_total: 16748, total_details: { amount_tax: 948 }, payment_intent: 'pi_keep2',
    customer_details: { name: 'Pat Family', email: 'pat@family.example', address: { state: 'MD' } },
    metadata: { checkout_type: 'film_keepsake', film_project_id: String(id), keepsake: 'copies', qty: '2' } } } }), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const copiesReceipt = env.EMAIL.sent.find((m) => /Thank you for your order: Extra copies/.test(m.subject));
  assert.match(copiesReceipt.text, /Cousin 3, 3 Elm St, Portsmouth, NH 03801/);
  assert.match(env.EMAIL.sent.find((m) => /^Keepsake order:/.test(m.subject)).text, /Cousin 4, 4 Elm St/);
  assert.match(db.prepare(`SELECT content FROM film_messages WHERE project_id = ? ORDER BY id DESC`).get(id).content, /Cousin 3, Cousin 4/);

  // The dashboard and admin see the order.
  const dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.deepEqual(dash.data.project.keepsakeOrders.map((o) => o.item), ['book', 'copies']);
  assert.ok(dash.data.project.keepsakeOrders.every((o) => o.mine));
  const detail = await call(env, get(`/api/film/project?id=${id}`, ADMIN));
  assert.equal(detail.data.keepsakes.length, 2);
  assert.equal(detail.data.keepsakes[1].recipients.length, 2);
});

test('people the buyer adds: helpers add photos and chat, editors also edit, keepsakes-only invitations just order keepsakes', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { stripe, token, id } = await paidProject(t, env);
  const db = env.DB.sqlite;
  const owner = DEVICE;
  const codeFrom = (mail) => (mail.text.match(/is (\d{6})\./) || [])[1];
  db.prepare(`UPDATE film_projects SET project_name = 'Lake Week' WHERE id = ?`).run(id);

  // The buyer adds three people, each with a different level; each invitation fits.
  env.EMAIL.sent.length = 0;
  await call(env, post('/api/film/people', { t: token, email: 'sam@family.example', name: 'Sam Lee' }));
  await call(env, post('/api/film/people', { t: token, email: 'eve@family.example', name: 'Eve Lee', role: 'editor' }));
  let r = await call(env, post('/api/film/people', { t: token, email: 'kim@family.example', name: 'Kim Lee', role: 'keepsakes' }));
  assert.deepEqual(r.data.people.map((x) => x.role || 'owner'), ['owner', 'helper', 'editor', 'keepsakes']);
  const inviteTo = (who) => env.EMAIL.sent.find((m) => m.to.includes(who));
  assert.match(inviteTo('sam@family.example').text, /add your own photos and videos and chat with us/);
  assert.match(inviteTo('eve@family.example').text, /fill in the details and answers/);
  const kimInvite = inviteTo('kim@family.example');
  assert.match(kimInvite.subject, /invited you to order keepsakes/);
  assert.ok(kimInvite.text.includes(`my-keepsakes.html?t=${token}`));
  assert.ok(!kimInvite.text.includes('my-film.html'));

  const signIn = async (email) => {
    DEVICE = null;
    await call(env, post('/api/film/access/code', { t: token, email }));
    const v = await call(env, post('/api/film/access/verify', { t: token, email, code: codeFrom(env.EMAIL.sent.at(-1)) }));
    assert.equal(v.status, 200, JSON.stringify(v.data));
    return v.data.deviceToken;
  };
  const sam = await signIn('sam@family.example');
  const eve = await signIn('eve@family.example');
  const kim = await signIn('kim@family.example');
  const upload = async (name) => {
    const s = await call(env, post('/api/film/upload/start', { t: token, name, size: 5, type: 'image/jpeg' }));
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const res = await worker.fetch(new Request(`https://worker.example/api/film/upload/part?t=${token}&file=${s.data.fileId}&part=1`, {
      method: 'POST', headers: { Origin: SITE, 'Content-Type': 'application/octet-stream', ...dev() }, body: new Uint8Array(5).fill(1),
    }), env, ctx);
    const d = await res.json();
    await call(env, post('/api/film/upload/complete', { t: token, fileId: s.data.fileId, parts: [{ part: d.part, etag: d.etag }] }));
    return s.data.fileId;
  };

  // Sam (helper): uploads and chats, but can't change what the buyer wrote, start production or add people.
  DEVICE = sam;
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(r.data.project.me.can.edit, false);
  assert.equal(r.data.project.me.can.upload, true);
  assert.equal(r.data.project.me.can.decide, false);
  r = await call(env, post('/api/film/dashboard', { t: token, projectName: 'Sam was here', about: 'x' }));
  assert.equal(r.status, 403);
  assert.match(r.data.error, /Only Pat Family can change/);
  assert.equal((await call(env, post('/api/film/notes', { t: token, notes: 'hi' }))).status, 403);
  assert.equal(db.prepare('SELECT project_name FROM film_projects WHERE id = ?').get(id).project_name, 'Lake Week');
  const samFile = await upload('camping.jpg');
  assert.equal((await call(env, post('/api/film/chat', { t: token, content: 'Added the camping photos' }))).status, 200);
  assert.equal((await call(env, post('/api/film/start', { t: token }))).status, 403);
  assert.equal((await call(env, post('/api/film/people', { t: token, email: 'x@y.example' }))).status, 403);
  DEVICE = owner;
  const ownerFile = await upload('wedding.jpg');
  DEVICE = sam;
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.deepEqual(r.data.project.uploads.map((u) => [u.name, u.mine]), [['camping.jpg', true], ['wedding.jpg', false]]);
  r = await call(env, post('/api/film/upload/delete', { t: token, fileId: ownerFile }));
  assert.equal(r.status, 403, 'helpers remove only their own files');
  assert.equal((await call(env, post('/api/film/upload/delete', { t: token, fileId: samFile }))).status, 200);

  // Eve (editor): can change the details and notes, still not start production.
  DEVICE = eve;
  assert.equal((await call(env, post('/api/film/dashboard', { t: token, projectName: 'Lake Week 2026', about: 'Our week at the lake' }))).status, 200);
  assert.equal((await call(env, post('/api/film/notes', { t: token, notes: 'Grandma is Yiayia' }))).status, 200);
  assert.equal(db.prepare('SELECT project_name FROM film_projects WHERE id = ?').get(id).project_name, 'Lake Week 2026');
  assert.equal((await call(env, post('/api/film/start', { t: token }))).status, 403);

  // Kim (keepsakes only): the film's name and the keepsakes, nothing from the dashboard.
  DEVICE = kim;
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(r.status, 200);
  assert.equal(r.data.keepsakesOnly, true);
  assert.equal(r.data.project.projectName, 'Lake Week 2026');
  for (const k of ['uploads', 'answers', 'about', 'notes', 'people', 'customerEmail']) assert.equal(r.data.project[k], undefined, k);
  assert.equal(r.data.project.bookOrdered, false);
  assert.equal((await call(env, get(`/api/film/chat?t=${token}`))).status, 403);
  assert.equal((await call(env, post('/api/film/chat', { t: token, content: 'hi' }))).status, 403);
  assert.equal((await call(env, post('/api/film/upload/start', { t: token, name: 'a.jpg', size: 5 }))).status, 403);
  assert.equal((await call(env, post('/api/film/dashboard', { t: token, projectName: 'x' }))).status, 403);
  assert.equal((await call(env, get(`/api/film/keepsake-photos?t=${token}`))).status, 200);
  // Kim orders the hardcover herself: Stripe gets her email, and her receipt and updates come to her.
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 1 }));
  assert.equal(r.status, 409);
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'book' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const params = stripe.sessions.get(r.data.id);
  assert.equal(params.get('customer_email'), 'kim@family.example');
  assert.equal(params.get('metadata[ordered_by]'), 'kim@family.example');
  assert.match(params.get('custom_text[submit][message]'), /email you a proof/);
  env.EMAIL.sent.length = 0;
  const res = await worker.fetch(await signedWebhook({ id: 'evt_kim_book', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: {
    id: r.data.id, payment_status: 'paid', amount_total: 15794, total_details: { amount_tax: 894 }, payment_intent: 'pi_kim',
    customer_details: { name: 'Kim Lee', email: 'kim@family.example', address: { state: 'NH' } },
    collected_information: { shipping_details: { name: 'Kim Lee', address: { line1: '9 Oak St', city: 'Keene', state: 'NH', postal_code: '03431', country: 'US' } } },
    metadata: { checkout_type: 'film_keepsake', film_project_id: String(id), keepsake: 'book', qty: '1', ordered_by: 'kim@family.example' } } } }), env, ctx);
  assert.equal(res.status, 200, await res.clone().text());
  const receipt = env.EMAIL.sent.find((m) => /^Thank you for your order/.test(m.subject));
  assert.deepEqual(receipt.to, ['kim@family.example']);
  assert.match(receipt.text, /^Hi Kim,/);
  assert.match(receipt.text, /email you a proof/);
  assert.ok(receipt.text.includes(`my-keepsakes.html?t=${token}`));
  assert.ok(!receipt.text.includes('my-film.html'));
  assert.match(env.EMAIL.sent.find((m) => /^Keepsake order:/.test(m.subject)).text, /Kim Lee <kim@family\.example> \(added by Pat Family, "Order keepsakes only"\)/);
  assert.match(db.prepare(`SELECT content FROM film_messages WHERE project_id = ? ORDER BY id DESC`).get(id).content, /^Kim Lee ordered the Hardcover story book from the keepsakes page/);
  assert.equal(db.prepare(`SELECT ordered_by FROM film_keepsake_orders WHERE stripe_session_id = ?`).get(r.data.id).ordered_by, 'kim@family.example');
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.deepEqual(r.data.project.keepsakeOrders.map((o) => [o.item, o.mine]), [['book', true]]);
  // Now copies are open to everyone; the buyer sees who ordered the book.
  r = await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'copies', qty: 1 }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  DEVICE = owner;
  r = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(r.data.project.bookOrdered, true);
  assert.deepEqual(r.data.project.keepsakeOrders.map((o) => [o.item, o.mine, o.by]), [['book', false, 'Kim Lee']]);
  assert.equal((await call(env, post('/api/film/keepsake-checkout', { t: token, item: 'book' }))).status, 409);
  const detail = await call(env, get(`/api/film/project?id=${id}`, ADMIN));
  assert.equal(detail.data.keepsakes[0].by, 'Kim Lee');
  assert.equal(detail.data.keepsakes[0].byBuyer, false);

  // The buyer changes Sam to keepsakes only: Sam's dashboard closes at once.
  r = await call(env, post('/api/film/people/role', { t: token, email: 'sam@family.example', role: 'keepsakes' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.people.find((x) => x.email === 'sam@family.example').role, 'keepsakes');
  assert.equal((await call(env, post('/api/film/people/role', { t: token, email: 'sam@family.example', role: 'boss' }))).status, 400);
  DEVICE = sam;
  assert.equal((await call(env, get(`/api/film/dashboard?t=${token}`))).data.keepsakesOnly, true);
  assert.equal((await call(env, post('/api/film/people/role', { t: token, email: 'sam@family.example', role: 'editor' }))).status, 403);
});

test('audiobook: upload the MP3 on its line, deliver a private download link, players only for the people it belongs to; keepsake lines in admin', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { stripe, token, id } = await paidProject(t, env);
  const db = env.DB.sqlite;
  const owner = DEVICE;
  const codeFrom = (mail) => (mail.text.match(/is (\d{6})\./) || [])[1];
  db.prepare(`UPDATE film_projects SET project_name = 'Lake Week' WHERE id = ?`).run(id);
  await call(env, post('/api/film/people', { t: token, email: 'sam@family.example', name: 'Sam Lee' }));
  await call(env, post('/api/film/people', { t: token, email: 'kim@family.example', name: 'Kim Lee', role: 'keepsakes' }));
  const signIn = async (email) => {
    DEVICE = null;
    await call(env, post('/api/film/access/code', { t: token, email }));
    return (await call(env, post('/api/film/access/verify', { t: token, email, code: codeFrom(env.EMAIL.sent.at(-1)) }))).data.deviceToken;
  };
  const sam = await signIn('sam@family.example');
  const kim = await signIn('kim@family.example');
  // The buyer and Kim each buy the audiobook.
  const buy = async (device, item, extra = {}) => {
    DEVICE = device;
    const r = await call(env, post('/api/film/keepsake-checkout', { t: token, item, ...extra }));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const params = stripe.sessions.get(r.data.id);
    const res = await worker.fetch(await signedWebhook({ id: `evt_${r.data.id}`, type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000), data: { object: {
      id: r.data.id, payment_status: 'paid', amount_total: 2900, total_details: { amount_tax: 0 }, payment_intent: `pi_${r.data.id}`,
      customer_details: { name: 'Someone', email: params.get('customer_email'), address: { state: 'NH' } },
      collected_information: item === 'book' ? { shipping_details: { name: 'Pat Family', address: { line1: '1 Main St', city: 'Dover', state: 'NH', postal_code: '03820', country: 'US' } } } : undefined,
      metadata: { checkout_type: 'film_keepsake', film_project_id: String(id), keepsake: item, qty: '1', ordered_by: params.get('metadata[ordered_by]') } } } }), env, ctx);
    assert.equal(res.status, 200, await res.clone().text());
    return db.prepare('SELECT id FROM film_keepsake_orders WHERE stripe_session_id = ?').get(r.data.id).id;
  };
  const patOrder = await buy(owner, 'audiobook');
  const kimOrder = await buy(kim, 'audiobook');

  // Each order is its own line in admin.
  let list = await call(env, get('/api/film/projects', ADMIN));
  assert.deepEqual(list.data.keepsakes.map((k) => [k.item, k.status, k.ordered_by_name, k.ordered_by_buyer]), [['audiobook', 'paid', 'Kim Lee', false], ['audiobook', 'paid', 'Pat Family', true]]);
  assert.equal(list.data.summary.keepsakesOpen, 2);
  assert.deepEqual(list.data.keepsakeItemStatuses.audiobook, ['paid', 'in_progress', 'delivered']);
  // Delivering before the MP3 is uploaded is refused.
  let r = await call(env, post('/api/film/email', { id, kind: 'audiobook', orderId: patOrder, preview: true }, ADMIN));
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Upload the audiobook MP3/);

  // Upload the MP3 from admin (one file per film).
  const size = 3000;
  assert.equal((await call(env, post('/api/film/deliver/start', { id, kind: 'audiobook', name: 'lake.wav', size }, ADMIN))).status, 400, 'MP3 or M4A only');
  const st = await call(env, post('/api/film/deliver/start', { id, kind: 'audiobook', name: 'Lake Week audiobook.mp3', size, type: 'audio/mpeg' }, ADMIN));
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.match(st.data.key, new RegExp(`^deliverables/${id}/audiobook-[0-9a-f]{8}\\.mp3$`));
  const up = await worker.fetch(new Request(`https://worker.example/api/film/deliver/part?id=${id}&key=${encodeURIComponent(st.data.key)}&uploadId=${encodeURIComponent(st.data.uploadId)}&part=1`,
    { method: 'POST', headers: { Origin: SITE, ...ADMIN }, body: new Uint8Array(size).map((_, i) => i % 251) }), env, ctx);
  const part = await up.json();
  assert.equal((await call(env, post('/api/film/deliver/complete', { id, kind: 'audiobook', key: st.data.key, uploadId: st.data.uploadId, parts: [part] }, ADMIN))).status, 200);
  list = await call(env, get('/api/film/projects', ADMIN));
  assert.ok(list.data.keepsakes.every((k) => k.has_audiobook && k.audiobook_listen));

  // Uploaded but not delivered: nobody sees it yet.
  DEVICE = owner;
  assert.equal((await call(env, get(`/api/film/dashboard?t=${token}`))).data.project.audiobookSrc, undefined);

  // Deliver to the buyer: preview first, then the private listening page in the email.
  r = await call(env, post('/api/film/email', { id, kind: 'audiobook', orderId: patOrder, preview: true }, ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.to, 'pat@family.example');
  assert.match(r.data.body, /your private listening link goes here when you send/);
  assert.match(r.data.body, /new narration for everything the film shows on screen/);
  assert.match(r.data.body, /Apple Podcasts/);
  assert.equal((await call(env, post('/api/film/email', { id, kind: 'audiobook', orderId: patOrder, send: true, body: 'Hi Pat, here it is.' }, ADMIN))).status, 400, 'the link line must stay');
  env.EMAIL.sent.length = 0;
  r = await call(env, post('/api/film/email', { id, kind: 'audiobook', orderId: patOrder, send: true }, ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const mail = env.EMAIL.sent.find((m) => /^Your audiobook is ready: Lake Week/.test(m.subject));
  assert.deepEqual(mail.to, ['pat@family.example']);
  const listen = (mail.text.match(/https:\/\/www\.easternshore\.ai\/listen\.html\?l=([0-9a-f]{64})/) || []);
  assert.ok(listen[0], mail.text);
  const l = listen[1];
  assert.ok(mail.html.includes(listen[0]) && /Listen to the audiobook/.test(mail.html), 'the button carries the listening link');
  let order = db.prepare('SELECT * FROM film_keepsake_orders WHERE id = ?').get(patOrder);
  assert.equal(order.status, 'delivered');
  assert.equal(order.listen_token, l);
  assert.equal(order.download_uses_left, 5);

  // The listening page's info, the stream (never counted) and the podcast feed.
  let info = await call(env, get(`/api/film/listen?l=${l}`));
  assert.equal(info.status, 200, JSON.stringify(info.data));
  assert.equal(info.data.title, 'Lake Week');
  assert.equal(info.data.downloadsLeft, 5);
  assert.match(info.data.cover, /audiobook-cover\.jpg$/);
  assert.equal(info.data.applePodcastsUrl, info.data.feedUrl.replace('https:', 'podcast:'));
  let res = await worker.fetch(new Request(info.data.src), env, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
  assert.match(res.headers.get('Content-Disposition'), /^inline/);
  assert.equal((await res.arrayBuffer()).byteLength, size);
  res = await worker.fetch(new Request(info.data.src, { headers: { Range: 'bytes=100-199' } }), env, ctx);
  assert.equal(res.status, 206);
  assert.equal(db.prepare('SELECT download_uses_left AS n FROM film_keepsake_orders WHERE id = ?').get(patOrder).n, 5, 'streaming is not counted');
  res = await worker.fetch(new Request(info.data.feedUrl), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /application\/rss\+xml/);
  const xml = await res.text();
  assert.match(xml, /<itunes:block>Yes<\/itunes:block>/);
  assert.match(xml, /<title>Lake Week \(Audiobook\)<\/title>/);
  assert.ok(xml.includes(`<enclosure url="${info.data.src.replace(/&/g, '&amp;')}" length="${size}" type="audio/mpeg"/>`), xml);
  // Downloads are counted (byte ranges after the start aren't) and stop at zero.
  res = await worker.fetch(new Request(info.data.downloadUrl), env, ctx);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition'), /attachment; filename="Lake Week - Audiobook\.mp3"/);
  await worker.fetch(new Request(info.data.downloadUrl, { headers: { Range: 'bytes=100-199' } }), env, ctx);
  assert.equal(db.prepare('SELECT download_uses_left AS n FROM film_keepsake_orders WHERE id = ?').get(patOrder).n, 4);
  db.prepare('UPDATE film_keepsake_orders SET download_uses_left = 0 WHERE id = ?').run(patOrder);
  res = await worker.fetch(new Request(info.data.downloadUrl), env, ctx);
  assert.equal(res.status, 410);
  assert.match(await res.text(), /No downloads left/);
  assert.equal((await worker.fetch(new Request(info.data.src, { headers: { Range: 'bytes=0-9' } }), env, ctx)).status, 206, 'still streams');
  // Deliver Again keeps the same link (podcast apps keep working) and resets the downloads.
  assert.equal((await call(env, post('/api/film/email', { id, kind: 'audiobook', orderId: patOrder, send: true }, ADMIN))).status, 200);
  order = db.prepare('SELECT * FROM film_keepsake_orders WHERE id = ?').get(patOrder);
  assert.equal(order.listen_token, l);
  assert.equal(order.download_uses_left, 5);
  // Guesses, a malformed link, an order that isn't delivered, or a canceled film get nothing.
  assert.equal((await call(env, get(`/api/film/listen?l=${'0'.repeat(64)}`))).status, 404);
  assert.equal((await call(env, get('/api/film/listen?l=short'))).status, 404);
  assert.equal((await worker.fetch(new Request(`https://worker.example/api/film/listen/feed.xml?l=${'0'.repeat(64)}`), env, ctx)).status, 404);
  db.prepare("UPDATE film_keepsake_orders SET status = 'in_progress' WHERE id = ?").run(patOrder);
  assert.equal((await call(env, get(`/api/film/listen?l=${l}`))).status, 404);
  db.prepare("UPDATE film_keepsake_orders SET status = 'delivered' WHERE id = ?").run(patOrder);
  db.prepare("UPDATE film_projects SET status = 'canceled' WHERE id = ?").run(id);
  assert.equal((await worker.fetch(new Request(info.data.src), env, ctx)).status, 404);
  db.prepare("UPDATE film_projects SET status = 'collecting' WHERE id = ?").run(id);
  // Admin's line shows the listening page.
  list = await call(env, get('/api/film/projects', ADMIN));
  assert.equal(list.data.keepsakes.find((k) => k.id === patOrder).listen_url, listen[0]);

  // Players: the buyer (with their listening link) and Sam (dashboard access) get it; Kim's own order isn't delivered yet.
  DEVICE = owner;
  let dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.ok(dash.data.project.audiobookSrc && dash.data.project.audiobookDownload);
  assert.equal(dash.data.project.audiobookListenUrl, listen[0]);
  res = await worker.fetch(new Request(dash.data.project.audiobookSrc, { headers: { Range: 'bytes=0-9' } }), env, ctx);
  assert.equal(res.status, 206);
  DEVICE = sam;
  dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.ok(dash.data.project.audiobookSrc);
  assert.equal(dash.data.project.audiobookListenUrl, undefined, "Sam didn't order it, so no listening link of his own");
  DEVICE = kim;
  dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.data.keepsakesOnly, true);
  assert.equal(dash.data.project.audiobookSrc, undefined);
  // Deliver Kim's: her own listening link, and now she has the player on the keepsakes page.
  env.EMAIL.sent.length = 0;
  assert.equal((await call(env, post('/api/film/email', { id, kind: 'audiobook', orderId: kimOrder, send: true }, ADMIN))).status, 200);
  const kimMail = env.EMAIL.sent.find((m) => /^Your audiobook is ready/.test(m.subject));
  assert.deepEqual(kimMail.to, ['kim@family.example']);
  assert.match(kimMail.text, /^Hi Kim,/);
  const kimL = (kimMail.text.match(/listen\.html\?l=([0-9a-f]{64})/) || [])[1];
  assert.ok(kimL && kimL !== l, 'each order has its own link');
  assert.ok(!kimMail.text.includes('my-film.html'));
  dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.ok(dash.data.project.audiobookSrc);
  assert.match(dash.data.project.audiobookListenUrl, new RegExp(kimL));
  assert.equal(dash.data.project.uploads, undefined, 'still nothing else from the dashboard');

  // A book on its own line: status, tracking, then Email Shipped.
  const bookOrder = await buy(owner, 'book');
  assert.equal((await call(env, post('/api/film/keepsake/update', { orderId: bookOrder, status: 'printing' }))).status, 401);
  assert.equal((await call(env, post('/api/film/keepsake/update', { orderId: patOrder, status: 'printing' }, ADMIN))).status, 400, 'an audiobook does not print');
  r = await call(env, post('/api/film/keepsake/update', { orderId: bookOrder, status: 'printing', tracking: 'https://track.example/1Z999', notes: 'Lulu order 123' }, ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  env.EMAIL.sent.length = 0;
  r = await call(env, post('/api/film/email', { id, kind: 'shipped', orderId: bookOrder, send: true }, ADMIN));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const shipped = env.EMAIL.sent.find((m) => /^Your book is on its way/.test(m.subject));
  assert.deepEqual(shipped.to, ['pat@family.example']);
  assert.match(shipped.text, /https:\/\/track\.example\/1Z999/);
  assert.match(shipped.html, /Track the package/);
  const book = db.prepare('SELECT * FROM film_keepsake_orders WHERE id = ?').get(bookOrder);
  assert.equal(book.status, 'shipped');
  assert.ok(book.shipped_at);
  assert.equal(book.staff_notes, 'Lulu order 123');
  list = await call(env, get('/api/film/projects', ADMIN));
  assert.equal(list.data.summary.keepsakesOpen, 1, 'the shipped book is still open until delivered');
});

// Keep last: node:test runs this file's tests in order.
test('every email to a customer or someone they added is BCCed to the business, like Survival Node order emails', () => {
  const toCustomers = ALL_SENT.filter((m) => /contact@easternshore\.ai/.test(JSON.stringify(m.from)) && !(m.to || []).includes('owner@inbox.example'));
  const subjects = toCustomers.map((m) => m.subject).join(' | ');
  for (const pattern of [/^Your film dashboard|dashboard/i, /Folder to Film code/, /invited you to help/, /replied about your film/]) {
    assert.match(subjects, pattern);
  }
  for (const m of toCustomers) assert.deepEqual(m.bcc, ['emailconfirm@easternshore.ai'], m.subject);
});
