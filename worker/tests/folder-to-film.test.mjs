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

function fakeEmail() {
  const sent = [];
  return { sent, async send(message) { sent.push(message); return { messageId: `cf-${sent.length}` }; } };
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
  const r = await call(env, post('/api/film/checkout', { termsAccepted: true, termsVersion: '2026-11-14.5' }));
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
  assert.equal(c.row.terms_version, '2026-11-14.5');
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

test('project chat: customer messages reach the support console and staff once per half hour; console replies email the customer when away; notes save', async (t) => {
  quietConsole(t);
  const env = baseEnv();
  const { token, id } = await paidProject(t, env);
  const db = env.DB.sqlite;
  env.EMAIL.sent.length = 0;

  let r = await call(env, get(`/api/film/chat?t=${token}`));
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.messages, []);

  r = await call(env, post('/api/film/chat', { t: token, content: 'Can we use the song from our first dance?' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const proj = db.prepare('SELECT * FROM film_projects WHERE id = ?').get(id);
  assert.ok(proj.chat_session_id);
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(proj.chat_session_id);
  assert.match(session.page, /^Folder to Film: /);
  assert.equal(session.status, 'active');
  const staffMail = env.EMAIL.sent.filter((m) => /^Film chat: /.test(m.subject));
  assert.equal(staffMail.length, 1);
  assert.match(staffMail[0].text, /first dance/);
  assert.match(staffMail[0].text, /support-chat\.html/);
  await call(env, post('/api/film/chat', { t: token, content: 'Also, Grandma is Yiayia in the family.' }));
  assert.equal(env.EMAIL.sent.filter((m) => /^Film chat: /.test(m.subject)).length, 1, 'second message within 30 minutes: no second email');

  // Staff closes the chat in the console; the customer's next message reopens it.
  db.prepare(`UPDATE chat_sessions SET status = 'closed' WHERE id = ?`).run(proj.chat_session_id);
  await call(env, post('/api/film/chat', { t: token, content: 'One more thing!' }));
  assert.equal(db.prepare('SELECT status FROM chat_sessions WHERE id = ?').get(proj.chat_session_id).status, 'active');

  // Staff replies from the console while the customer is away: they get an email with the reply.
  db.prepare(`UPDATE film_projects SET customer_seen_at = datetime('now', '-10 minutes') WHERE id = ?`).run(id);
  const reply = await worker.fetch(post('/api/chat/message', { token: session.session_token, content: 'Great idea. We can use a licensed version that sounds just like it.', role: 'staff', senderName: 'Chris' }, ADMIN), env, ctx);
  assert.equal(reply.status, 200, await reply.clone().text());
  const toCustomer = env.EMAIL.sent.filter((m) => m.subject === 'Chris replied about your film');
  assert.equal(toCustomer.length, 1);
  assert.deepEqual(toCustomer[0].to, ['pat@family.example']);
  assert.match(toCustomer[0].text, /licensed version/);
  assert.match(toCustomer[0].html, /my-film\.html\?t=[^"]+#chat/);
  // A second reply soon after doesn't email again; the dashboard shows both.
  await worker.fetch(post('/api/chat/message', { token: session.session_token, content: 'Anything else?', role: 'staff', senderName: 'Chris' }, ADMIN), env, ctx);
  assert.equal(env.EMAIL.sent.filter((m) => m.subject === 'Chris replied about your film').length, 1);
  r = await call(env, get(`/api/film/chat?t=${token}`));
  assert.deepEqual(r.data.messages.map((m) => m.role), ['user', 'user', 'user', 'staff', 'staff']);
  assert.equal(r.data.messages[3].sender_name, 'Chris');

  // Customer on the dashboard right now: no email.
  db.prepare(`UPDATE film_projects SET last_reply_email_at = NULL WHERE id = ?`).run(id);
  await worker.fetch(post('/api/chat/message', { token: session.session_token, content: 'Seen?', role: 'staff', senderName: 'Chris' }, ADMIN), env, ctx);
  assert.equal(env.EMAIL.sent.filter((m) => m.subject === 'Chris replied about your film').length, 1);

  // Notes save any time after paying and show in admin with the chat.
  r = await call(env, post('/api/film/notes', { t: token, notes: 'Please leave out photos of Uncle Bob.' }));
  assert.equal(r.status, 200);
  const detail = await call(env, get(`/api/film/project?id=${id}`, ADMIN));
  assert.equal(detail.data.project.customer_notes, 'Please leave out photos of Uncle Bob.');
  assert.equal(detail.data.chat.length, 6);
  const dash = await call(env, get(`/api/film/dashboard?t=${token}`));
  assert.equal(dash.data.project.notes, 'Please leave out photos of Uncle Bob.');
  assert.equal(dash.data.project.chat, true);
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
