// Ask K on the Claude API, with abuse safeguards. Claude is the only AI.
//
// Order of checks for a public question (handleAskK in index.js does the
// per-address rate limits first):
//   1. Bot check: a Cloudflare Turnstile token, exchanged for a signed
//      conversation pass that is good for ASKK_CONVERSATION_LIMIT questions.
//   2. Topic check: a tiny Claude Haiku call decides whether the question is
//      about Survival Node / Eastern Shore AI / preparedness. Off-topic
//      requests ("write me a Python script") get a canned reply and never
//      reach the main model. Falls back to a keyword check if Claude is down.
//   3. Answer: the newest Claude Opus (picked from the Models API daily). If
//      Claude's credit is gone, its daily budget is spent, its key is missing
//      or rejected, or it's down, visitors get a "busy, contact us" reply.
//      There is no second AI provider (the MiniMax backup was removed
//      2026-11-12).
// Spend is estimated from each response's token usage (priced on the high
// side) and kept per Eastern day in D1 (askk_daily). Pausing emails staff once
// per day per reason.
//
// Two deployments run here, each with its own key, budget, wording and
// counters: Survival Node (node.html; counters have no prefix, as before) and
// Folder to Film (folder-to-film.html; FILM_ANTHROPIC_API_KEY, counters
// prefixed film_). Both share the bot check and the model list cache.

import Anthropic from '@anthropic-ai/sdk';
import { pageVisitSummary } from './page-visits.js';

const CLAUDE_FAMILY = 'claude-opus-';
const CLAUDE_FALLBACK_MODEL = 'claude-opus-5-5';
const TOPIC_FAMILY = 'claude-haiku-';
const TOPIC_FALLBACK_MODEL = 'claude-haiku-5-5';
const MODEL_REFRESH_SECS = 24 * 3600;

// Per-million-token prices for the spend estimate, at or above list prices.
const PRICE = {
  claude: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  topic: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};

export const ASKK_CONVERSATION_LIMIT = 20;
const PASS_TTL_SECS = 2 * 3600;

export const ASKK_BUSY_REPLY = "Ask K is busy right now. Our team can help directly: call (302) 907-9162 or use the contact form on easternshore.ai.";
const OFF_TOPIC_REPLY = "I can only help with questions about the Survival Node and Eastern Shore AI: what's included, how it works offline, power, maps, shipping, returns, warranty, and ordering. What would you like to know about the Survival Node?";

// ── Small helpers ──────────────────────────────────────────────

function easternDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function budget(env, key, fallback) {
  const n = Number(env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function ensureTables(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS askk_daily (
    day TEXT NOT NULL,
    provider TEXT NOT NULL,
    spent REAL NOT NULL DEFAULT 0,
    questions INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, provider)
  )`).run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS askk_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
}

async function getMeta(env, key) {
  const row = await env.DB.prepare('SELECT value FROM askk_meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

async function setMeta(env, key, value) {
  await env.DB.prepare('INSERT INTO askk_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, String(value)).run();
}

// provider: 'claude' (answers + topic checks), or a counter such as
// 'offtopic' / 'busy' / 'unverified' / 'ratelimited' (questions only).
// Rows named 'minimax' are from the old backup provider (before 2026-11-12).
async function addDaily(env, provider, cost = 0, questions = 0) {
  try {
    await env.DB.prepare(`INSERT INTO askk_daily (day, provider, spent, questions) VALUES (?, ?, ?, ?)
      ON CONFLICT(day, provider) DO UPDATE SET spent = spent + excluded.spent, questions = questions + excluded.questions`)
      .bind(easternDay(), provider, cost, questions).run();
  } catch (e) {
    console.error('askk_daily update failed:', e);
  }
}

async function spentToday(env, provider) {
  const row = await env.DB.prepare('SELECT spent FROM askk_daily WHERE day = ? AND provider = ?').bind(easternDay(), provider).first();
  return Number(row?.spent) || 0;
}

// One email per day per reason.
async function notifyOnce(env, notify, reason, subject, text) {
  if (!notify) return;
  const key = `notified:${easternDay()}:${reason}`;
  try {
    if (await getMeta(env, key)) return;
    await setMeta(env, key, Date.now());
    await notify(env, { subject, text });
  } catch (e) {
    console.error('askk notify failed:', e);
  }
}

// ── 1. Bot check (Turnstile → signed conversation pass) ─────────

async function verifyTurnstile(env, token, ip) {
  if (!token) return false;
  try {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET_KEY);
    body.append('response', String(token));
    if (ip) body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    console.error('turnstile verify failed:', e);
    return false;
  }
}

async function issuePass(env) {
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  const exp = Math.floor(Date.now() / 1000) + PASS_TTL_SECS;
  return `${id}.${exp}.${await hmacHex(env.ASKK_PASS_SECRET, `${id}.${exp}`)}`;
}

async function readPass(env, pass) {
  const [id, exp, sig] = String(pass || '').split('.');
  if (!id || !exp || !sig) return null;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return timingSafeEqual(await hmacHex(env.ASKK_PASS_SECRET, `${id}.${exp}`), sig) ? id : null;
}

// Returns { ok, pass, conversationId } or { ok:false, needsVerification }.
export async function checkAskKVisitor(env, { pass, turnstileToken, ip }) {
  // ASKK_TURNSTILE_ENFORCE ("1") switches the check on once the page has the
  // matching site key; with it off, Ask K keeps working without the widget.
  if (env.ASKK_TURNSTILE_ENFORCE !== '1' || !env.TURNSTILE_SECRET_KEY || !env.ASKK_PASS_SECRET) {
    return { ok: true, conversationId: null, pass: null };
  }
  let id = await readPass(env, pass);
  let newPass = null;
  if (!id) {
    if (!(await verifyTurnstile(env, turnstileToken, ip))) return { ok: false, needsVerification: true };
    newPass = await issuePass(env);
    id = newPass.split('.')[0];
  }
  return { ok: true, conversationId: id, pass: newPass };
}

// ── 2. Topic check ─────────────────────────────────────────────

const OFF_TOPIC_PATTERNS = [
  /\b(write|generate|create|code|build|debug|fix)\b[^.?!]{0,40}\b(script|code|program|function|app|website|sql|regex|class|essay|poem|story|song|letter|cover letter|resume|email)\b/i,
  /\b(python|javascript|typescript|java|c\+\+|c#|rust|golang|php|html|css|sql|bash|powershell)\b/i,
  /\b(homework|essay|translate|summari[sz]e this|solve for|integral|derivative)\b/i,
];
const ON_TOPIC_HINT = /\b(survival|node|kit|faraday|bags?|emp|solar|battery|batteries|charg\w*|offline|maps?|gps|ship\w*|deliver\w*|returns?|refund\w*|warranty|rma|orders?|track\w*|packages?|status|byog|price|pricing|cost|discount|sale|phone|moto\w*|case|padlock|silica|eastern shore|prepar\w*|emergency|persona|pocketpal|qwen|llm|apps?|software|storage|ram|sim|support)\b/i;

// Questions about an order already placed. Claude decides this itself (the
// `lookup` field); the "busy" reply and the error reply use this pattern.
const ORDER_STATUS_HINT = /\b(order status|status of (my|our|the) \w+|track(ing)?\b|where'?s my|where is my|(my|our) (order|package|shipment|delivery|node|kit)\b[^.?!]{0,40}\b(ship\w*|arriv\w*|deliver\w*|come|status|late)|(has|did|when (will|does|did))\b[^.?!]{0,30}\b(ship|shipped|arrive|be delivered|get here)\b|didn'?t (get|receive)\b[^.?!]{0,30}\b(order|package|node|kit|tracking))/i;

// ── Deployments ────────────────────────────────────────────────

export const ASKK_SURVIVAL_NODE = {
  id: 'node',
  name: 'Survival Node',
  prefix: '',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  budgetEnv: 'ASKK_CLAUDE_DAILY_BUDGET',
  budgetDefault: 3,
  workspace: 'survival-node',
  page: 'the Survival Node page',
  knowledgeLabel: 'Survival Node and Eastern Shore AI',
  offTopicReply: OFF_TOPIC_REPLY,
  onTopicHint: ON_TOPIC_HINT,
  orderHint: ORDER_STATUS_HINT,
  topicSystem: 'You screen messages sent to the shopping assistant on the Survival Node product page of Eastern Shore AI (an offline emergency-preparedness phone kit with offline AI, maps, solar power and Faraday bags; the company also does local AI setup services). Reply ON if the latest message is something a shopper or owner could reasonably ask that assistant: the product, its contents or specs, offline AI, power, maps, EMP protection, emergency preparedness, pricing, ordering, shipping, returns, warranty, setup, the company, or a greeting, thanks or follow-up. Reply OFF if it asks for unrelated work or chat: writing or fixing code, essays, homework, translations, other products, general knowledge, or using the assistant for something else. If you are unsure, reply ON. Reply with exactly one word: ON or OFF.',
};

export const ASKK_FOLDER_TO_FILM = {
  id: 'film',
  name: 'Folder to Film',
  prefix: 'film_',
  apiKeyEnv: 'FILM_ANTHROPIC_API_KEY',
  budgetEnv: 'FILM_ASKK_DAILY_BUDGET',
  budgetDefault: 2,
  workspace: 'folder-to-film',
  page: 'the Folder to Film page',
  knowledgeLabel: 'Folder to Film by Eastern Shore AI',
  offTopicReply: "I can only help with questions about Folder to Film: how it works, what you can upload, film styles, timing, pricing, keepsakes and your order. What would you like to know?",
  onTopicHint: /\b(film|films|video|videos|movie|documentary|folder|story|stories|upload\w*|photos?|pictures?|scans?|files?|music|song|narrat\w*|voice|style|styles|cartoon|animated|trailer|storybook|scrapbook|news|wedding|retire\w*|send-?off|goodbye|coworker|tribute|memorial|funeral|anniversar\w*|birthday|trip|vacation|demo|final|changes?|revision\w*|book|audiobook|prints?|plaque|price|pricing|cost|order\w*|status|dashboard|production|refund\w*|youtube|share|download|eastern shore|tax|illustrat\w*|church|family|gift)\b/i,
  orderHint: /\b(order status|status of (my|our|the) \w+|where'?s my|where is my|(my|our) (order|film|video|movie|demo|project)\b[^.?!]{0,40}\b(ready|done|status|finish\w*|late|come|coming|start\w*)|when (will|is|does|do)\b[^.?!]{0,30}\b(my|our|the) (film|video|demo|movie|project|final)|(film|video|demo|project)\b[^.?!]{0,20}\b(ready yet|done yet|status)|(lost|can'?t find|need)\b[^.?!]{0,20}\b(dashboard|my link|the link))/i,
  topicSystem: 'You screen messages sent to Ask K, the assistant on the Folder to Film page of Eastern Shore AI (a service that turns a customer\'s photos, videos, audio and files into a narrated short film: family histories, trips, funny family stories, retirements, coworker send-offs, weddings, tributes; with keepsakes like books and audiobooks). Reply ON if the latest message is something a shopper or customer could reasonably ask that assistant: the service, how it works, uploads and file types, film styles, narration, music, timing, pricing, sales tax, changes, sharing, privacy, AI use, keepsakes, their order or dashboard, the company, or a greeting, thanks or follow-up. Reply OFF if it asks for unrelated work or chat: writing or fixing code, essays, homework, writing their story or script for them in the chat, translations, other products, general knowledge. If you are unsure, reply ON. Reply with exactly one word: ON or OFF.',
};

export function wantsOrderStatus(question, dep = ASKK_SURVIVAL_NODE) {
  return dep.orderHint.test(String(question || ''));
}

function keywordOffTopic(question, dep) {
  const q = String(question || '');
  return !dep.onTopicHint.test(q) && OFF_TOPIC_PATTERNS.some(p => p.test(q));
}

// Messages that name the product or its topics skip the model check: a
// wrongly refused customer question costs more than an occasional stray one,
// and Opus still declines off-topic requests itself.
function clearlyOnTopic(question, dep) {
  return dep.onTopicHint.test(String(question || ''));
}

async function claudeTopicCheck(env, client, question, history, dep) {
  const lastUser = [...history].reverse().find(m => m && m.role === 'user' && m.content !== question);
  const models = await familyModels(env, client, TOPIC_FAMILY, TOPIC_FALLBACK_MODEL);
  const response = await client.messages.create({
    model: models[0],
    max_tokens: 5,
    thinking: { type: 'disabled' },
    system: dep.topicSystem,
    messages: [{ role: 'user', content: `${lastUser ? `Previous message: ${String(lastUser.content).slice(0, 300)}\n` : ''}Latest message: ${String(question).slice(0, 1000)}` }],
  });
  await addDaily(env, `${dep.prefix}claude`, costOf(PRICE.topic, response.usage), 0);
  const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim().toUpperCase();
  return !text.startsWith('OFF');
}

// ── 3. Answer: Claude ──────────────────────────────────────────

function anthropicClient(env, dep) {
  return new Anthropic({ apiKey: String(env[dep.apiKeyEnv] || '').trim(), maxRetries: 2 });
}

function costOf(price, usage) {
  const u = usage || {};
  return ((u.input_tokens || 0) * price.input
    + (u.output_tokens || 0) * price.output
    + (u.cache_creation_input_tokens || 0) * (price.cacheWrite || price.input)
    + (u.cache_read_input_tokens || 0) * (price.cacheRead || price.input)) / 1e6;
}

// Newest first, from the Models API, refreshed daily. The family is chosen
// instead of a fixed model so retirements never need a code change.
async function familyModels(env, client, family, fallback, force = false) {
  const now = Math.floor(Date.now() / 1000);
  let cached = [];
  try { cached = JSON.parse((await getMeta(env, `models:${family}`)) || '[]'); } catch { cached = []; }
  const fresh = Number(await getMeta(env, `models_at:${family}`)) > now - MODEL_REFRESH_SECS;
  if (cached.length && fresh && !force) return cached;
  try {
    const found = [];
    for await (const m of client.models.list()) {
      if (String(m.id).startsWith(family)) found.push({ id: m.id, created: Date.parse(m.created_at) || 0 });
    }
    const ids = found.sort((a, b) => b.created - a.created).map(m => m.id);
    if (ids.length) {
      await setMeta(env, `models:${family}`, JSON.stringify(ids));
      await setMeta(env, `models_at:${family}`, now);
      return ids;
    }
  } catch (e) {
    console.error('model list failed:', e);
  }
  return cached.length ? cached : [fallback];
}

// Server-side refusal fallback; dropped (once) if a future API rejects it.
async function createMessage(client, params) {
  try {
    return await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) return client.messages.create(params);
    throw e;
  }
}

function conversationMessages(history, question, context) {
  const turns = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 1200) }));
  if (turns.length && turns[turns.length - 1].role === 'user') turns.pop();
  const ctx = context && Object.keys(context).length ? `\n\n(Page context: ${JSON.stringify(context).slice(0, 1500)})` : '';
  turns.push({ role: 'user', content: `${question}${ctx}` });
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const out = [];
  for (const t of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.content += `\n\n${t.content}`;
    else out.push({ ...t });
  }
  return out.slice(-11);
}

// Claude answers in JSON: the reply, and whether to show the order-status box.
const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    lookup: { type: 'boolean' },
  },
  required: ['reply', 'lookup'],
  additionalProperties: false,
};
const ANSWER_FORMAT = 'Answer in JSON. reply is what the visitor sees. lookup is true only when your reply offers the order-status email box (the visitor asked about the status, ship date, tracking or delivery of an order they placed on this website); otherwise false.';

function parseAnswer(text) {
  let out;
  try { out = JSON.parse(text); } catch { out = null; }
  if (!out || typeof out !== 'object') return { text: String(text || '').trim(), lookup: false };
  return { text: String(out.reply || '').trim(), lookup: out.lookup === true };
}

async function claudeAnswer(env, client, { systemPrompt, knowledge, question, history, context }, dep) {
  let models = await familyModels(env, client, CLAUDE_FAMILY, CLAUDE_FALLBACK_MODEL);
  const tried = new Set();
  let refreshed = false;
  let lastError;
  const params = {
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
    system: [
      { type: 'text', text: `GROUNDED KNOWLEDGE (${dep.knowledgeLabel}):\n${knowledge}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ANSWER_FORMAT },
    ],
    messages: conversationMessages(history, question, context),
  };
  while (true) {
    const model = models.find(m => !tried.has(m));
    if (!model) break;
    tried.add(model);
    try {
      const response = await createMessage(client, { ...params, model });
      await addDaily(env, `${dep.prefix}claude`, costOf(PRICE.claude, response.usage), 1);
      if (tried.size > 1) await setMeta(env, `models:${CLAUDE_FAMILY}`, JSON.stringify(models.filter(m => m === model || !tried.has(m))));
      if (response.stop_reason === 'refusal') return { text: dep.offTopicReply, lookup: false };
      return parseAnswer((response.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
    } catch (e) {
      lastError = e;
      if (!(e instanceof Anthropic.NotFoundError || e instanceof Anthropic.BadRequestError)) throw e;
      if (!refreshed) { refreshed = true; models = await familyModels(env, client, CLAUDE_FAMILY, CLAUDE_FALLBACK_MODEL, true); }
    }
  }
  throw lastError || new Error('No Claude model available');
}

function claudeOutReason(e) {
  if (e instanceof Anthropic.APIError && (e.status === 402 || e.type === 'billing_error')) return 'credit';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'key';
  return 'error';
}

/**
 * Answer one Ask K question. `deps.notify(env, { subject, text })` emails staff.
 * Returns { reply, provider, lookup } where provider is 'claude' | 'offtopic' |
 * 'busy' and lookup says to show the order-status box.
 */
export async function answerAskK(env, { question, history = [], context = {}, systemPrompt, knowledge, deployment = ASKK_SURVIVAL_NODE }, deps) {
  const dep = deployment;
  await ensureTables(env);
  const hasClaude = !!String(env[dep.apiKeyEnv] || '').trim();
  const client = hasClaude ? anthropicClient(env, dep) : null;
  const claudeBudget = budget(env, dep.budgetEnv, dep.budgetDefault);
  let claudeOk = hasClaude && (await spentToday(env, `${dep.prefix}claude`)) < claudeBudget;
  let outReason = !hasClaude ? 'key' : claudeOk ? null : 'budget';

  // Topic check (cheap). Claude when available, keyword rules otherwise.
  let onTopic = !keywordOffTopic(question, dep);
  if (claudeOk && onTopic && !clearlyOnTopic(question, dep)) {
    try {
      onTopic = await claudeTopicCheck(env, client, question, history, dep);
    } catch (e) {
      const reason = claudeOutReason(e);
      if (reason !== 'error') { claudeOk = false; outReason = reason; }
      console.error('topic check failed, using keyword rules:', e?.message);
    }
  }
  if (!onTopic) {
    await addDaily(env, `${dep.prefix}offtopic`, 0, 1);
    return { reply: dep.offTopicReply, provider: 'offtopic', lookup: false };
  }

  if (claudeOk) {
    try {
      const { text, lookup } = await claudeAnswer(env, client, { systemPrompt, knowledge, question, history, context }, dep);
      if (text) return { reply: text, provider: 'claude', lookup };
      outReason = 'error';
    } catch (e) {
      outReason = claudeOutReason(e);
      console.error('Claude answer failed:', e?.message);
    }
  }

  // No backup AI: visitors get the "busy, contact us" reply and staff get one
  // email per day per reason.
  const why = {
    credit: "Claude's prepaid credit has run out",
    key: `the Claude API key (${dep.apiKeyEnv}) is missing or was rejected`,
    budget: `Claude's daily budget ($${claudeBudget.toFixed(2)}) was reached`,
    error: 'Claude returned an error or is down',
  }[outReason] || 'Claude was unavailable';
  const back = outReason === 'budget' ? 'tomorrow, when the daily budget resets' : 'once Claude works again';
  const fix = {
    credit: '\n\nAdd credit in the Eastern Shore AI Anthropic account: platform.claude.com → Billing.',
    key: `\n\nCheck the ${dep.workspace} key in the Eastern Shore AI Anthropic account, then: cd worker && npx wrangler secret put ${dep.apiKeyEnv} --config wrangler.toml`,
  }[outReason] || '';
  await addDaily(env, `${dep.prefix}busy`, 0, 1);
  await notifyOnce(env, deps.notify, `${dep.prefix}busy-${outReason || 'unknown'}`, dep.id === 'node' ? 'Ask K is paused' : `Ask K is paused (${dep.name})`,
    `Ask K on ${dep.page} can't answer right now because ${why}. Visitors are being shown your phone number and contact form instead. It starts answering again automatically ${back}.${fix}`);
  // The order-status box needs no AI, so it still shows while K is busy.
  return { reply: ASKK_BUSY_REPLY, provider: 'busy', lookup: wantsOrderStatus(question, dep) };
}

// Counts a blocked request (failed bot check, rate limit) or an order-status
// email request ('status') for the daily email.
export async function recordAskKBlocked(env, kind, dep = ASKK_SURVIVAL_NODE) {
  try {
    await ensureTables(env);
    await addDaily(env, `${dep.prefix}${kind}`, 0, 1);
  } catch (e) {
    console.error('askk blocked count failed:', e);
  }
}

// ── Daily summary email ────────────────────────────────────────
// One email (cron in wrangler.toml) covering yesterday, in Eastern time, for
// every Ask K deployment. No AI calls. Survival Node's numbers come from
// this worker's D1. The others answer POST /internal/daily-summary { day }
// with that deployment's token secret (the same value as SUMMARY_TOKEN on its
// side), with { day, answers, errors, est_spent, mtd_est_spent,
// credit: { loaded, spent, level } }. Just In Case and Florence Mae Gifts are
// Workers, reached through a service binding; iDesign is a Pages project
// (service bindings can't reach those), reached over HTTPS at the address in
// its `url` var. A deployment that fails, times out or isn't set up yet gets a
// one-line note and is left out of the totals; it never stops the email.
//
// `credit` is prepaid credit for Just In Case. Florence Mae Gifts and iDesign
// have no prepaid balance, so their `credit` is the monthly Ask K budget
// instead (loaded = the cap, spent = this month's estimate).

const REMOTE_ASKK = [
  { name: 'Just In Case', binding: 'JIC_ASKK', service: 'just-in-case-askk', token: 'SUMMARY_TOKEN', credit: 'prepaid' },
  { name: 'Florence Mae Gifts', binding: 'FMG_ASKK', service: 'fmg-stripe-api', token: 'FMG_ASKK_SUMMARY_TOKEN', credit: 'monthly' },
  { name: 'iDesign', url: 'IDESIGN_ASKK_URL', token: 'IDESIGN_ASKK_SUMMARY_TOKEN', credit: 'monthly' },
];
const COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const REMOTE_SUMMARY_TIMEOUT_MS = 10000;

// creditLevel in both remote Ask K workers (low = 20% or less left,
// critical = 5% or less).
const CREDIT_LEVELS = {
  ok: 'OK',
  low: 'low',
  critical: 'very low',
  out: 'out of credit',
  unset: 'no top-ups recorded',
};
// FMG's "out" also covers Claude refusing for billing until it answers again.
const BUDGET_LEVELS = {
  ok: 'OK',
  low: 'low',
  critical: 'very low',
  out: 'used up (cap reached or Claude refused for billing)',
  unset: 'no budget set',
};

const money = (v) => `$${(Number(v) || 0).toFixed(2)}`;

async function localSummary(env, day, month, dep) {
  await ensureTables(env);
  const rows = await env.DB.prepare('SELECT provider, spent, questions FROM askk_daily WHERE day = ?').bind(day).all();
  const by = Object.fromEntries((rows.results || []).map(r => [r.provider, r]));
  const n = (k) => Number(by[dep.prefix + k]?.questions || 0);
  const spent = (k) => Number(by[dep.prefix + k]?.spent || 0);
  const mtd = await env.DB.prepare('SELECT SUM(spent) AS s FROM askk_daily WHERE provider = ? AND substr(day, 1, 7) = ?').bind(`${dep.prefix}claude`, day.slice(0, 7)).first();
  const answers = n('claude');
  if (dep.id !== 'node' && !String(env[dep.apiKeyEnv] || '').trim() && !answers && !n('busy') && !n('status')) {
    return { status: `not live yet (${dep.apiKeyEnv} not set)` };
  }
  return {
    answers,
    spent: spent('claude'),
    claudeMtd: Number(mtd?.s || 0),
    lines: [
      `Answered: ${answers}`,
      `  • Claude: ${n('claude')} answers, about ${money(spent('claude'))} (daily cap ${money(budget(env, dep.budgetEnv, dep.budgetDefault))})`,
      `Blocked: ${n('offtopic') + n('unverified') + n('ratelimited')}`,
      `  • Off-topic requests refused: ${n('offtopic')}`,
      `  • Failed the bot check: ${n('unverified')}`,
      `  • Hit a rate limit: ${n('ratelimited')}`,
      `"Busy, contact us" replies: ${n('busy')}`,
      `Order-status emails requested: ${n('status')}`,
      `Claude spend so far in ${month}: about ${money(mtd?.s)}`,
    ],
  };
}

async function remoteSummary(env, remote, day, month, timeoutMs) {
  // A service binding, or the public fetch for a deployment with a `url` var.
  const service = remote.url ? (env[remote.url] ? { fetch: (u, init) => fetch(u, init) } : null) : env[remote.binding];
  if (!service) return { status: 'not live yet' };
  const token = env[remote.token];
  if (!token) throw new Error(`${remote.token} not set`);
  const address = remote.url ? env[remote.url] : `https://${remote.service}/internal/daily-summary`;
  const ask = async () => {
    // The host is ignored by service bindings. X-Summary-Token is what the
    // remote workers read; Authorization is the agreed contract.
    const res = await service.fetch(address, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Summary-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ day }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no reply in ${timeoutMs / 1000} s`)), timeoutMs);
  });
  let data;
  try {
    data = await Promise.race([ask(), timeout]);
  } finally {
    clearTimeout(timer);
  }
  if (!data || typeof data.answers !== 'number') throw new Error('unexpected reply');
  const credit = data.credit || {};
  const loaded = Number(credit.loaded) || 0;
  const left = Math.max(0, loaded - (Number(credit.spent) || 0));
  const creditLine = remote.credit === 'monthly'
    ? `Monthly Ask K budget: ${loaded > 0 ? `${money(credit.spent)} spent of ${money(loaded)}, ` : ''}${BUDGET_LEVELS[credit.level] || credit.level || 'unknown'}`
    : `K's credit: ${CREDIT_LEVELS[credit.level] || credit.level || 'unknown'}${loaded > 0 ? `, ${money(left)} left of ${money(loaded)} loaded` : ''}`;
  return {
    answers: data.answers,
    spent: Number(data.est_spent) || 0,
    claudeMtd: Number(data.mtd_est_spent) || 0,
    lines: [
      `Answered: ${data.answers}`,
      `Errors: ${Number(data.errors) || 0}`,
      `Spend: about ${money(data.est_spent)}`,
      `Claude spend so far in ${month}: about ${money(data.mtd_est_spent)}`,
      creditLine,
    ],
  };
}

export async function sendAskKDailySummary(env, notify, now = new Date(), { timeoutMs = REMOTE_SUMMARY_TIMEOUT_MS } = {}) {
  const day = easternDay(new Date(now.getTime() - 24 * 3600 * 1000));
  const month = new Date(`${day}T12:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const limit = budget(env, 'ASKK_ORG_MONTHLY_LIMIT', 100);
  const sources = [
    { name: ASKK_SURVIVAL_NODE.name, load: () => localSummary(env, day, month, ASKK_SURVIVAL_NODE) },
    { name: ASKK_FOLDER_TO_FILM.name, load: () => localSummary(env, day, month, ASKK_FOLDER_TO_FILM) },
    ...REMOTE_ASKK.map(r => ({ name: r.name, load: () => remoteSummary(env, r, day, month, timeoutMs) })),
  ];
  const sections = await Promise.all(sources.map(async ({ name, load }) => {
    try {
      return { name, ...(await load()) };
    } catch (e) {
      const reason = String(e?.message || e).slice(0, 80);
      console.error(`Ask K daily summary: ${name} failed:`, reason);
      return { name, status: `couldn't fetch (${reason})`, failed: true };
    }
  }));

  const counted = sections.filter(s => !s.status);
  const sum = (key) => counted.reduce((total, s) => total + s[key], 0);
  const answers = sum('answers');
  const spent = sum('spent');
  const claudeMtd = sum('claudeMtd');
  const lines = [`Ask K yesterday — ${day} (Eastern time)`, ''];
  for (const s of sections) {
    lines.push(...(s.status ? [`${s.name}: ${s.status}`] : [`── ${s.name} ──`, ...s.lines]), '');
  }
  lines.push(
    `── All ${COUNT_WORDS[sections.length] || sections.length} ──`,
    `Answered: ${answers}`,
    `Spend: about ${money(spent)}`,
    `Claude spend so far in ${month}: about ${money(claudeMtd)} of the $${limit} monthly org limit (${limit > 0 ? Math.round(claudeMtd / limit * 100) : 0}%)`,
  );
  const left = sections.filter(s => s.status);
  if (left.length) lines.push(`Not counted: ${left.map(s => s.name).join(', ')}`);
  lines.push('', 'Amounts are estimates from token counts, priced slightly high. Exact spend per workspace (survival-node, folder-to-film, jic-ask-k, fmg-ask-k, idesignas): platform.claude.com → Usage.');

  // Page visits (node.html) ride along in the same morning email.
  let visits = null;
  try { visits = await pageVisitSummary(env, day); } catch (e) { console.error('page visit summary failed', e); }
  if (visits) lines.push('', `Website visits yesterday — ${day}`, '', ...visits.lines);

  const failed = sections.filter(s => s.failed).map(s => s.name);
  const subject = `Ask K yesterday: ${answers} answered, about ${money(spent)}; ${month} so far ${money(claudeMtd)} of $${limit}`
    + (failed.length ? ` (${failed.join(', ')} couldn't fetch)` : '');
  await notify(env, { subject, text: lines.join('\n') });
}
