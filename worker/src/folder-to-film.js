// Folder to Film: pay-first story films (folder-to-film.html -> Stripe -> my-film.html).
//
// Flow: the page's "Start my film" button calls /api/film/checkout, which creates a
// film_projects row (pending_payment, random token) and a Stripe Checkout Session
// (automatic tax, downloaded-video tax code). Stripe sends the customer to their
// dashboard, my-film.html?t=TOKEN&session_id=..., which confirms the payment with
// Stripe right away (the webhook does the same, whichever comes first claims it).
// Paying books the income and Stripe fee, emails the customer their dashboard link
// and alerts staff. In the dashboard they name the project, answer the questions,
// upload files of any type straight into R2 (FILMS bucket, projects/<id>/, multipart
// so big videos work) and press Start production, which emails both sides the
// demo date (3 business days, Eastern). Staff run everything from the admin
// "Folder to Film" tab: status, demo/final links, file downloads, branded emails.
//
// Sales tax: Maryland treats a video delivered electronically as a digital
// product (Business Tax Tip #29, Photography and Videography), 6%. Stripe Tax
// charges it to Maryland buyers on top of the price; the books record the
// session total like the other ESA checkouts, with the tax noted.
import { sendEmail as deliverEmail, emailConfigured } from './email.js';
import { emailLayout, emailButton, callout, detailsBox, TAGLINES } from './email-layout.js';
import { easternDate } from './node-price.js';

export const FILM_PRICE_CENTS = 19999;
export const FILM_TAX_CODE = 'txcd_10402100'; // Digital Audio Visual Works - downloaded - non subscription - with permanent rights
export const FILM_TERMS_VERSION = '2026-11-14.6';
export const FILM_CHANGE_ROUNDS = 2;   // included in the price (folder-to-film.html, terms sections 2 and 10) // folder-to-film-terms.html; bump both together
export const FILM_PART_BYTES = 20 * 1024 * 1024; // R2 multipart: every part but the last must be this size
const MAX_FILE_BYTES = 50 * 1024 * 1024 * 1024; // 50 GB per file
const MAX_FILES = 2000;
const DEMO_BUSINESS_DAYS = 3;
const FILE_LINK_SECONDS = 3600;
const UPLOAD_KEEP_DAYS = 365;  // raw uploads, after the final film is sent (folder-to-film-terms.html "How long we keep it")
// The finished film, dashboard, share page and project chat are kept until the customer asks us to delete them.

export const FILM_STATUSES = {
  pending_payment: 'Awaiting payment',
  collecting: 'Collecting files',
  production: 'In production',
  demo_ready: 'Demo sent',
  changes: 'Changes requested',
  final_ready: 'Final sent',
  delivered: 'Delivered',
  canceled: 'Canceled',
};

// The 12 questions in the dashboard. Every chip question has "Experts pick";
// anything left blank is treated as Experts pick.
export const FILM_QUESTIONS = [
  { id: 'story_type', q: 'What kind of story is it?', type: 'single', options: ['Family trip', 'Funny family story', 'Retirement', "A coworker's send-off", 'Wedding', 'Life story or tribute', 'Milestone', 'History (family, church or business)', 'Something else'] },
  { id: 'style', q: 'Which film style?', type: 'single', options: ['Documentary', 'Animated cartoon', 'Storybook', 'Movie trailer', 'News report', 'Scrapbook', 'Experts pick'] },
  { id: 'tone', q: 'What tone should it have?', type: 'single', options: ['Heartfelt', 'Funny', 'Adventure', 'Reverent', 'Experts pick'] },
  { id: 'narrator', q: 'Who should narrate?', type: 'single', options: ['Older man', 'Older woman', 'Younger man', 'Younger woman', 'Record it myself', 'Experts pick'] },
  { id: 'music', q: 'What music?', type: 'single', options: ['Hymns', 'Piano', 'Folk', 'Orchestral', 'Upbeat', 'Music from their era', 'Experts pick'] },
  { id: 'no_photos', q: 'Moments with no photos?', type: 'single', options: ['Watercolor illustrations', 'Cartoon illustrations', 'Photos only', 'Experts pick'] },
  { id: 'length', q: 'How long should it be?', type: 'single', options: ['About 3 minutes', 'About 5 minutes', 'Up to 8 minutes', 'Experts pick'] },
  { id: 'shown_at', q: 'Where will it be shown?', type: 'multi', options: ['Family at home', 'A party or reception', 'A memorial service', 'At work', 'Online', 'Experts pick'] },
  { id: 'must_include', q: 'People or moments it must include', type: 'text', placeholder: 'e.g. the 1998 camping trip, Grandma Rose, the dog' },
  { id: 'names', q: 'Names, and how to say them', type: 'text', placeholder: 'e.g. Polychronis = poly-KRO-nis' },
  { id: 'avoid', q: 'Anything to leave out?', type: 'text', placeholder: 'Topics, people or photos to skip' },
  { id: 'ending', q: 'How should it end?', type: 'text', placeholder: 'A closing line, a message, or "Experts pick"' },
];

function clip(v, n) {
  return (v ?? '').toString().trim().slice(0, n);
}

function nice(iso) {
  if (!iso) return '';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// Weekends and the holidays the business closes for don't count toward the demo date.
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7;
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
function observed(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  else if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function closedDays(year) {
  return new Set([
    observed(`${year}-01-01`), lastWeekday(year, 4, 1), observed(`${year}-07-04`),
    nthWeekday(year, 8, 1, 1), nthWeekday(year, 10, 4, 4), observed(`${year}-12-25`),
  ]);
}
export function addBusinessDays(startIso, n) {
  const d = new Date(`${startIso}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6 || closedDays(d.getUTCFullYear()).has(iso)) continue;
    left--;
  }
  return d.toISOString().slice(0, 10);
}

function bytesText(n) {
  const b = Number(n || 0);
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} bytes`;
}

function safeFilename(name) {
  const base = clip(name, 180).replace(/[\\/]+/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '');
  return base || 'file';
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function createFilmHandlers(deps) {
  const {
    json, requireAdmin, escapeHtml, formatUsd, generateToken,
    upsertTaxIncomeJournal, upsertTaxExpenseJournal, stripeFee, sendStaffOperationalAlert,
    notifySupportPushes = async () => {}, enqueueSupportPushReminder = async () => {},
  } = deps;

  const SITE = 'https://www.easternshore.ai';
  const dashboardUrl = (token, origin = SITE) => `${origin}/my-film.html?t=${encodeURIComponent(token)}`;

  // ---------- helpers ----------

  async function getByToken(db, token) {
    const t = clip(token, 80);
    if (t.length < 24) return null;
    return db.prepare(`SELECT * FROM film_projects WHERE token = ?1`).bind(t).first();
  }

  // ---------- dashboard access ----------
  // The link finds the film; a trusted browser opens it. The browser that just
  // paid (back from Stripe within a day) is trusted automatically. Any other
  // browser needs a 6-digit code, which is only ever emailed to the buyer or to
  // a person the buyer added. Trust lasts DEVICE_DAYS in that browser.
  const DEVICE_DAYS = 90;
  // Staff (Red) open any film's dashboard from admin with a one-time link; they're
  // the "staff" person, their chat messages go out as Chris, and their sign-in lasts a week.
  const STAFF_ID = 'staff';
  const STAFF_NAME = 'Chris';
  const STAFF_DEVICE_DAYS = 7;
  const STAFF_LINK_MINUTES = 10;
  const CODE_MINUTES = 15;
  const MAX_PEOPLE = 10;

  async function sha256Hex(text) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const normEmail = (e) => clip(e, 200).toLowerCase();
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
  function maskEmail(e) {
    const [u, d] = String(e || '').split('@');
    if (!u || !d) return '';
    return `${u[0]}${'*'.repeat(Math.min(6, Math.max(2, u.length - 1)))}@${d}`;
  }

  async function peopleFor(env, row) {
    const added = (await env.DB.prepare(`SELECT email, name, added_at FROM film_people WHERE project_id = ?1 ORDER BY id`).bind(row.id).all()).results || [];
    return [{ email: normEmail(row.customer_email), name: row.customer_name || '', isOwner: true }, ...added.map((p) => ({ email: p.email, name: p.name || '', isOwner: false, addedAt: p.added_at }))];
  }

  async function personFor(env, row, email) {
    const e = normEmail(email);
    if (!e) return null;
    if (e === STAFF_ID) return { email: STAFF_ID, name: STAFF_NAME, isOwner: false, isStaff: true };
    if (e === normEmail(row.customer_email)) return { email: e, name: row.customer_name || '', isOwner: true };
    const p = await env.DB.prepare(`SELECT email, name FROM film_people WHERE project_id = ?1 AND email = ?2`).bind(row.id, e).first();
    return p ? { email: p.email, name: p.name || '', isOwner: false } : null;
  }

  async function deviceFor(env, row, request) {
    const tok = clip(request.headers.get('X-Film-Device'), 200);
    if (tok.length < 32) return null;
    const dev = await env.DB.prepare(
      `SELECT * FROM film_devices WHERE device_hash = ?1 AND project_id = ?2 AND expires_at > datetime('now')`
    ).bind(await sha256Hex(tok), row.id).first();
    if (!dev) return null;
    const person = await personFor(env, row, dev.email);   // removed people lose access at once
    if (!person) return null;
    if (!dev.last_seen_at || Date.parse(`${dev.last_seen_at.replace(' ', 'T')}Z`) < Date.now() - 600000) {
      await env.DB.prepare(`UPDATE film_devices SET last_seen_at = datetime('now') WHERE id = ?1`).bind(dev.id).run();
    }
    return person;
  }

  async function issueDevice(env, row, email) {
    const tok = generateToken() + generateToken();
    const days = normEmail(email) === STAFF_ID ? STAFF_DEVICE_DAYS : DEVICE_DAYS;
    await env.DB.prepare(`INSERT INTO film_devices (project_id, device_hash, email, expires_at) VALUES (?1, ?2, ?3, datetime('now', ?4))`)
      .bind(row.id, await sha256Hex(tok), normEmail(email), `+${days} days`).run();
    return tok;
  }

  function needsCode(row, corsHeaders) {
    return json({ ok: false, needsCode: true, maskedEmail: maskEmail(row.customer_email), projectName: row.project_name || '',
      error: 'Please confirm it’s you: we’ll email a code to the buyer or a person they added.' }, 401, corsHeaders);
  }

  // Film from the link + the person behind this browser, or an error response.
  async function access(env, request, corsHeaders, token) {
    const row = await getByToken(env.DB, token);
    if (!row) return { res: json({ ok: false, error: 'Film not found' }, 404, corsHeaders) };
    if (row.status === 'pending_payment') return { res: json({ ok: false, error: 'Payment is still confirming. Try again in a moment.' }, 409, corsHeaders) };
    const person = await deviceFor(env, row, request);
    if (!person) return { res: needsCode(row, corsHeaders) };
    return { row, person };
  }

  async function readJson(request) {
    try { return await request.json(); } catch { return null; }
  }

  function parseAnswers(row) {
    try { const a = JSON.parse(row.answers_json || '{}'); return a && typeof a === 'object' ? a : {}; } catch { return {}; }
  }

  async function uploadsFor(db, projectId, { all = false } = {}) {
    const rows = (await db.prepare(
      `SELECT id, filename, content_type, size_bytes, status, created_at, completed_at FROM film_uploads
       WHERE project_id = ?1 ${all ? '' : "AND status = 'done'"} ORDER BY id`
    ).bind(projectId).all()).results || [];
    return rows;
  }

  function editable(row) {
    return row.status === 'collecting';
  }

  function customerView(row, uploads) {
    return {
      id: row.id,
      status: row.status,
      statusLabel: FILM_STATUSES[row.status] || row.status,
      projectName: row.project_name || '',
      about: row.about || '',
      occasion: row.occasion || '',
      neededBy: row.needed_by || '',
      links: row.links || '',
      phone: row.customer_phone || '',
      answers: parseAnswers(row),
      customerName: row.customer_name || '',
      customerEmail: row.customer_email || '',
      paidAt: row.paid_at || '',
      productionStartedAt: row.production_started_at || '',
      demoDueDate: row.demo_due_date || '',
      demoDueText: row.demo_due_date ? nice(row.demo_due_date) : '',
      estimatedDoneText: row.estimated_done_date ? nice(row.estimated_done_date) : '',
      demoUrl: ['demo_ready', 'changes', 'final_ready', 'delivered'].includes(row.status) ? (row.demo_url || '') : '',
      finalUrl: ['final_ready', 'delivered'].includes(row.status) ? (row.final_url || '') : '',
      feedback: row.feedback || '',
      approvedAt: row.approved_at || '',
      changeRounds: Number(row.change_rounds || 0),
      roundsIncluded: FILM_CHANGE_ROUNDS,
      editable: editable(row),
      notes: row.customer_notes || '',
      chat: !['pending_payment', 'canceled'].includes(row.status),
      uploads: uploads.map((u) => ({ id: u.id, name: u.filename, type: u.content_type || '', size: Number(u.size_bytes || 0), at: u.completed_at || u.created_at })),
      totalBytes: uploads.reduce((s, u) => s + Number(u.size_bytes || 0), 0),
      questions: FILM_QUESTIONS,
      partBytes: FILM_PART_BYTES,
    };
  }

  async function sendCustomerEmail(env, row, { kind, subject, text, html, to: toOverride }) {
    const to = clip(toOverride || row.customer_email, 200);
    if (!to) throw new Error('This project has no customer email yet.');
    const from = env.CONTACT_FROM_EMAIL || env.FROM_EMAIL;
    if (!emailConfigured(env) || !from) throw new Error('Email provider is not configured');
    const payload = { from, to: [to], subject, html, text, reply_to: 'contact@easternshore.ai' };
    if (env.BCC_EMAIL) payload.bcc = [env.BCC_EMAIL];
    const res = await deliverEmail(env, payload);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to send email');
    await env.DB.prepare(`INSERT INTO film_emails (project_id, kind, subject, to_email) VALUES (?1, ?2, ?3, ?4)`).bind(row.id, kind, subject, to).run();
    return true;
  }

  function shell(innerHtml, { heading = '', preheader = '', link = '' } = {}) {
    const a = 'color:#0E6E86;text-decoration:none;';
    return emailLayout({
      heading,
      preheader,
      tagline: TAGLINES.films,
      body: innerHtml,
      panels: link ? [callout('Your film dashboard',
        `Everything for your film lives on your private dashboard: <a href="${escapeHtml(link)}" style="${a}">open it here</a>. Bookmark it. Lost the link? Just reply to this email and we'll send it again.`)] : [],
      footerNote: "You're receiving this about your Folder to Film order with Eastern Shore AI. Just reply if you have a question.",
    });
  }

  // Paragraph lines -> HTML; a line that is exactly `link` becomes the button.
  function linesHtml(lines, link, buttonLabel) {
    return lines.map((l) => {
      if (!l) return '';
      if (link && l === link) return emailButton(link, buttonLabel);
      let html = escapeHtml(l);
      if (link) html = html.replace(escapeHtml(link), `<a href="${escapeHtml(link)}" style="color:#0E6E86;">${escapeHtml(link)}</a>`);
      return `<p style="margin:0 0 12px;">${html}</p>`;
    }).join('');
  }

  function firstName(row) {
    const n = clip(row.customer_name, 80).split(/\s+/)[0];
    return n ? `Hi ${n},` : 'Hi,';
  }

  // Default text for each email staff can send from admin (and the automatic ones).
  function draftEmail(row, kind) {
    const link = dashboardUrl(row.token);
    const name = row.project_name ? `"${row.project_name}"` : 'your film';
    const hi = firstName(row);
    switch (kind) {
      case 'welcome':
        return {
          subject: 'Your Folder to Film dashboard is ready',
          heading: 'Your dashboard is ready',
          button: 'Open my dashboard',
          lines: [hi, '', "Thank you! Your payment went through, and your film's private dashboard is ready now. That's where you'll name your project, answer a few quick questions and upload everything you have: photos, videos, audio, scans, documents, any type of file, big videos included.", '',
            link, '', "Take as many days as you need. When you've added everything, press Start production, and we'll email you the date your demo will be ready (2 to 3 business days).", '', 'Questions? Just reply to this email, or call or text (302) 907-9162.', '', 'Chris', 'Folder to Film by Eastern Shore AI'],
        };
      case 'production':
        return {
          subject: `Production started: your demo will be ready by ${nice(row.demo_due_date)}`,
          heading: "We've started production",
          button: 'Open my dashboard',
          lines: [hi, '', `Thanks for sending everything for ${name}. We've started production, and your demo will be ready by ${nice(row.demo_due_date)}.`, '',
            "What happens next: we go through everything you sent, write the script, choose the narration and music, and build the first version. We'll email you the moment it's ready, and you can watch it on your dashboard and tell us what to change.", '',
            link, '', 'Thought of something else, or found another photo? Reply to this email and attach it, and we will work it in.', '', 'Chris'],
        };
      case 'demo':
        return {
          subject: `Your demo is ready: ${row.project_name || 'your film'}`,
          heading: 'Your demo is ready',
          button: 'Watch my demo',
          lines: [hi, '', `The first version of ${name} is ready to watch on your dashboard.`, '', link, '',
            'Watch it, then tell us what to change right there on the dashboard: names, dates, a photo you just found, anything at all. Or press Approve if it\'s just right. Your final version comes the next business day after.', '', 'Chris'],
        };
      case 'final':
        return {
          subject: `Your film is ready: ${row.project_name || 'your story'}`,
          heading: 'Your film is ready',
          button: 'Watch and download',
          lines: [hi, '', `The final version of ${name} is ready. You can watch it, share it with family, and download a copy to keep, all from your dashboard.`, '', link, '',
            ...(row.share_token ? [`To share the film itself (without dashboard access), send people this link: ${SITE}/film.html?s=${row.share_token}`, ''] : []),
            'Thank you for trusting us with your story. If you\'d like it as a hardcover book, a children\'s book or an audiobook, just reply and we\'ll put it together from what we already have.', '', 'Chris'],
        };
      default:
        return {
          subject: `About your film${row.project_name ? `: ${row.project_name}` : ''}`,
          heading: 'Your film',
          button: 'Open my dashboard',
          lines: [hi, '', '(Write your message here.)', '', link, '', 'Chris'],
        };
    }
  }

  async function sendDraft(env, row, kind, overrides = {}) {
    const d = draftEmail(row, kind);
    const link = dashboardUrl(row.token);
    const subject = clip(overrides.subject, 200) || d.subject;
    const body = typeof overrides.body === 'string' && overrides.body.trim() ? overrides.body.replace(/\r\n/g, '\n').slice(0, 8000) : d.lines.join('\n');
    const lines = body.split('\n').map((l) => l.trimEnd());
    const html = shell(linesHtml(lines, link, d.button), { heading: d.heading, preheader: lines.find((l) => l && !l.startsWith('Hi')) || '', link });
    return { subject, body, lines, html, to: clip(row.customer_email, 200), link };
  }

  async function stripeGetSession(env, id) {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
    return data;
  }

  // Mark a project paid exactly once (webhook and dashboard can both get here),
  // then book income + fee and send the emails.
  async function markPaid(env, row, session, incomeDate) {
    const amount = Math.round(Number(session.amount_total || 0));
    const tax = Math.round(Number(session.total_details?.amount_tax || 0));
    const name = clip(session.customer_details?.name, 120);
    const email = clip(session.customer_details?.email || session.customer_email, 200);
    const phone = clip(session.customer_details?.phone, 40);
    const state = clip(session.customer_details?.address?.state, 8).toUpperCase();
    const pi = clip(session.payment_intent?.id || session.payment_intent, 80);
    const claim = await env.DB.prepare(
      `UPDATE film_projects
       SET status = 'collecting', paid_at = datetime('now'), customer_name = COALESCE(NULLIF(?1, ''), customer_name),
           customer_email = COALESCE(NULLIF(?2, ''), customer_email), customer_phone = COALESCE(NULLIF(?3, ''), customer_phone),
           billing_state = ?4, amount_cents = ?5, tax_cents = ?6, stripe_payment_intent_id = ?7,
           stripe_session_id = COALESCE(stripe_session_id, ?8), updated_at = datetime('now')
       WHERE id = ?9 AND status = 'pending_payment'`
    ).bind(name, email, phone, state, amount, tax, pi, clip(session.id, 120), row.id).run();
    if (!Number(claim.meta?.changes || 0)) return false;
    const fresh = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(row.id).first();
    const key = clip(session.id, 120);

    // Books: same pattern as the other ESA checkouts (session total, deduped by session id).
    const existing = await env.DB.prepare(`SELECT id FROM tax_income WHERE stripe_session_id = ?1 LIMIT 1`).bind(key).first();
    if (!existing?.id && amount > 0) {
      const source = 'Stripe - Folder to Film';
      const category = 'Folder to Film Sales';
      const notes = `Folder to Film #${fresh.id} | ${fresh.customer_name || fresh.customer_email || 'customer'}${tax ? ` | includes ${formatUsd(tax)} sales tax (${state || 'state n/a'})` : ''} | session_id=${key}`;
      const ins = await env.DB.prepare(
        `INSERT INTO tax_income (income_date, source, category, amount_cents, stripe_session_id, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(incomeDate, source, category, amount, key, notes).run();
      const incomeId = Number(ins.meta?.last_row_id || 0) || null;
      if (incomeId) await upsertTaxIncomeJournal(env.DB, { id: incomeId, income_date: incomeDate, source, category, amount_cents: amount, notes });
    }
    try {
      const { cents: feeCents, estimated } = await stripeFee(env.STRIPE_SECRET_KEY, pi, amount);
      if (feeCents > 0) {
        const base = `Auto Stripe fee for Folder to Film session ${key}`;
        const dupe = await env.DB.prepare(`SELECT id FROM tax_expenses WHERE notes IN (?1, ?2) LIMIT 1`).bind(base, `${base} (estimated)`).first();
        if (!dupe?.id) {
          const feeNote = `${base}${estimated ? ' (estimated)' : ''}`;
          const insFee = await env.DB.prepare(
            `INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents, paid_via, notes) VALUES (?1, 'Stripe', 'Payment Processing Fees', ?2, 'stripe', ?3)`
          ).bind(incomeDate, feeCents, feeNote).run();
          const feeId = Number(insFee.meta?.last_row_id || 0) || null;
          if (feeId) await upsertTaxExpenseJournal(env.DB, { id: feeId, expense_date: incomeDate, vendor: 'Stripe', category: 'Payment Processing Fees', amount_cents: feeCents, paid_via: 'stripe', notes: feeNote });
        }
      }
    } catch (e) { console.error('Folder to Film fee booking failed', e); }

    try {
      const d = await sendDraft(env, fresh, 'welcome');
      await sendCustomerEmail(env, fresh, { kind: 'welcome', subject: d.subject, text: d.body, html: d.html });
    } catch (e) { console.error('Folder to Film welcome email failed', e); }
    try {
      await sendStaffOperationalAlert(env, {
        from: env.ALERTS_FROM_EMAIL,
        subject: `New Folder to Film order: ${fresh.customer_name || fresh.customer_email || `#${fresh.id}`}`,
        text: [`${formatUsd(amount)} paid${tax ? ` (includes ${formatUsd(tax)} sales tax, ${state})` : ''}.`, `Customer: ${fresh.customer_name || ''} <${fresh.customer_email || ''}>${fresh.customer_phone ? ` ${fresh.customer_phone}` : ''}`,
          `Project #${fresh.id}. Their dashboard is open; you'll get another email when they press Start production.`, '', 'Admin: https://www.easternshore.ai/admin.html (Folder to Film tab)'].join('\n'),
      });
    } catch (e) { console.error('staff alert failed', e); }
    return true;
  }

  // ---------- public: checkout ----------

  // POST /api/film/checkout
  async function handleCheckout(request, env, corsHeaders, originAllowed, allowedOrigins) {
    if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: 'Stripe not configured' }, 500, corsHeaders);
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    const d = (await readJson(request)) || {};
    if (d.termsAccepted !== true) return json({ ok: false, error: 'Please read and agree to the Folder to Film Terms and Privacy Notice first.' }, 400, corsHeaders);
    const termsVersion = clip(d.termsVersion, 32) || FILM_TERMS_VERSION;
    const origin = (originAllowed && request.headers.get('Origin')) || allowedOrigins[0] || SITE;
    const token = generateToken() + generateToken().slice(0, 12);
    const ins = await env.DB.prepare(`INSERT INTO film_projects (token, status, terms_version, terms_accepted_at) VALUES (?1, 'pending_payment', ?2, datetime('now'))`).bind(token, termsVersion).run();
    const projectId = Number(ins.meta?.last_row_id || 0);
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: `${dashboardUrl(token, origin)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/folder-to-film.html?canceled=1#start`,
      billing_address_collection: 'required',
      allow_promotion_codes: 'true',
      'automatic_tax[enabled]': 'true',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(FILM_PRICE_CENTS),
      'line_items[0][price_data][product_data][name]': 'Folder to Film: your story film',
      'line_items[0][price_data][product_data][description]': 'A narrated short film made from your photos, videos and files. Demo in 2 to 3 business days after you press Start production, two rounds of changes, final the next business day after you approve.',
      'line_items[0][price_data][product_data][tax_code]': FILM_TAX_CODE,
      'metadata[checkout_type]': 'folder_to_film',
      'metadata[film_project_id]': String(projectId),
      'metadata[terms_version]': termsVersion,
      'payment_intent_data[metadata][checkout_type]': 'folder_to_film',
      'payment_intent_data[metadata][film_project_id]': String(projectId),
      'custom_text[submit][message]': 'After paying you go straight to your private dashboard to name your project and upload everything.',
    });
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url || !data?.id) {
      await env.DB.prepare(`DELETE FROM film_projects WHERE id = ?1 AND status = 'pending_payment'`).bind(projectId).run();
      return json({ ok: false, error: 'Stripe session failed', detail: data?.error?.message || '' }, 502, corsHeaders);
    }
    await env.DB.prepare(`UPDATE film_projects SET stripe_session_id = ?1 WHERE id = ?2`).bind(data.id, projectId).run();
    return json({ ok: true, checkoutUrl: data.url, id: data.id }, 200, corsHeaders);
  }

  // checkout.session.completed with metadata.checkout_type = folder_to_film
  async function handleFilmPaid(env, event, incomeDate) {
    const session = event.data?.object || {};
    const id = Number(session.metadata?.film_project_id || 0);
    if (!id) return { ok: false, error: 'Missing film_project_id' };
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(id).first();
    if (!row) return { ok: false, error: 'Film project not found' };
    if (row.stripe_session_id && session.id && row.stripe_session_id !== session.id) return { ok: false, error: 'Session does not match project' };
    if (session.payment_status && session.payment_status !== 'paid') return { ok: true, waiting: session.payment_status };
    await markPaid(env, row, session, incomeDate);
    return { ok: true };
  }

  // checkout.session.expired: drop the unpaid project the checkout created.
  async function handleFilmExpired(env, session) {
    const id = Number(session.metadata?.film_project_id || 0);
    if (id) await env.DB.prepare(`DELETE FROM film_projects WHERE id = ?1 AND status = 'pending_payment'`).bind(id).run();
  }

  // ---------- public: dashboard ----------

  // GET /api/film/dashboard?t=&session_id=
  async function handleDashboardGet(request, env, corsHeaders, url) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    let row = await getByToken(env.DB, url.searchParams.get('t'));
    if (!row) return json({ ok: false, error: 'We could not find that film. Check the link in your email.' }, 404, corsHeaders);
    if (row.status === 'pending_payment' && row.stripe_session_id && env.STRIPE_SECRET_KEY) {
      // Back from Stripe before the webhook: confirm with Stripe directly.
      try {
        const s = await stripeGetSession(env, row.stripe_session_id);
        if (s.payment_status === 'paid' && Number(s.metadata?.film_project_id || 0) === row.id) {
          await markPaid(env, row, s, easternDate());
          row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(row.id).first();
        }
      } catch (e) { console.error('Folder to Film payment check failed', e); }
    }
    if (row.status === 'pending_payment') {
      return json({ ok: true, project: { status: 'pending_payment', statusLabel: FILM_STATUSES.pending_payment } }, 200, corsHeaders);
    }
    let person = await deviceFor(env, row, request);
    let deviceToken = null;
    // The browser that just paid: back from Stripe (matching session) within a day of paying.
    const sid = clip(url.searchParams.get('session_id'), 200);
    const paidRecently = row.paid_at && Date.parse(`${row.paid_at.replace(' ', 'T')}Z`) > Date.now() - 24 * 3600 * 1000;
    if (!person && sid && sid === row.stripe_session_id && paidRecently && row.customer_email) {
      deviceToken = await issueDevice(env, row, row.customer_email);
      person = await personFor(env, row, row.customer_email);
    }
    if (!person) return needsCode(row, corsHeaders);
    const uploads = await uploadsFor(env.DB, row.id);
    const view = customerView(row, uploads);
    Object.assign(view, await mediaFor(env, row, new URL(request.url).origin));
    view.me = person;
    if (person.isOwner || person.isStaff) view.people = await peopleFor(env, row);
    return json({ ok: true, project: view, ...(deviceToken ? { deviceToken } : {}) }, 200, corsHeaders);
  }

  // POST /api/film/access/code {t, email}: email a sign-in code, but only to the
  // buyer or someone they added. Same reply either way.
  async function handleAccessCode(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const email = normEmail(d.email);
    if (!validEmail(email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400, corsHeaders);
    const reply = json({ ok: true, message: 'If that email has access to this film, we just sent it a 6-digit code. It works for 15 minutes; check spam too.' }, 200, corsHeaders);
    const row = await getByToken(env.DB, d.t);
    if (!row || ['pending_payment', 'canceled'].includes(row.status)) return reply;
    const person = await personFor(env, row, email);
    if (!person) return reply;
    const recentProject = await env.DB.prepare(`SELECT COUNT(*) AS n FROM film_codes WHERE project_id = ?1 AND created_at > datetime('now', '-1 hour')`).bind(row.id).first();
    const recentEmail = await env.DB.prepare(`SELECT COUNT(*) AS n FROM film_codes WHERE project_id = ?1 AND email = ?2 AND created_at > datetime('now', '-10 minutes')`).bind(row.id, email).first();
    if (Number(recentProject?.n || 0) >= 8 || Number(recentEmail?.n || 0) >= 3) return reply;
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    await env.DB.prepare(`INSERT INTO film_codes (project_id, email, code_hash, expires_at) VALUES (?1, ?2, ?3, datetime('now', ?4))`)
      .bind(row.id, email, await sha256Hex(`${row.id}:${email}:${code}`), `+${CODE_MINUTES} minutes`).run();
    const name = row.project_name ? `"${row.project_name}"` : 'your Folder to Film project';
    const text = [`Your sign-in code for ${name} is ${code}.`, '', `It works for ${CODE_MINUTES} minutes. Type it on the dashboard to open it in this browser.`, '',
      "Didn't ask for this? You can ignore it: nobody can open the dashboard without this code.", '', 'Folder to Film by Eastern Shore AI'].join('\n');
    const html = shell(`<p style="margin:0 0 12px;">Your sign-in code for ${escapeHtml(name)} is:</p>`
      + `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px;color:#15181D;">${code}</p>`
      + `<p style="margin:0 0 12px;">It works for ${CODE_MINUTES} minutes. Type it on the dashboard to open it in this browser.</p>`
      + `<p style="margin:0 0 12px;color:#5B6370;">Didn't ask for this? You can ignore it: nobody can open the dashboard without this code.</p>`,
      { heading: 'Your sign-in code', preheader: `Your code is ${code}` });
    try {
      await sendCustomerEmail(env, row, { kind: 'code', to: email, subject: `Your Folder to Film code: ${code}`, text, html });
    } catch (e) { console.error('film code email', e); }
    return reply;
  }

  // POST /api/film/access/verify {t, email, code} -> { deviceToken }
  async function handleAccessVerify(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const row = await getByToken(env.DB, d.t);
    const email = normEmail(d.email);
    const code = clip(d.code, 12).replace(/\D/g, '');
    if (!row || code.length !== 6 || email === STAFF_ID) return json({ ok: false, error: "That code isn't right. Check the email and try again." }, 400, corsHeaders);
    const c = await env.DB.prepare(`SELECT * FROM film_codes WHERE project_id = ?1 AND email = ?2 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).bind(row.id, email).first();
    if (!c) return json({ ok: false, error: 'That code has expired. Ask for a new one.' }, 400, corsHeaders);
    if (Number(c.attempts) >= 5) return json({ ok: false, error: 'Too many tries. Ask for a new code.' }, 429, corsHeaders);
    if ((await sha256Hex(`${row.id}:${email}:${code}`)) !== c.code_hash) {
      await env.DB.prepare(`UPDATE film_codes SET attempts = attempts + 1 WHERE id = ?1`).bind(c.id).run();
      return json({ ok: false, error: "That code isn't right. Check the email and try again." }, 400, corsHeaders);
    }
    if (!(await personFor(env, row, email))) return json({ ok: false, error: 'That email no longer has access.' }, 403, corsHeaders);
    await env.DB.prepare(`DELETE FROM film_codes WHERE project_id = ?1 AND email = ?2`).bind(row.id, email).run();
    return json({ ok: true, deviceToken: await issueDevice(env, row, email) }, 200, corsHeaders);
  }

  // POST /api/film/people {t, email, name}  (the buyer only): add someone who can get a code.
  async function handlePeopleAdd(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    if (!a.person.isOwner && !a.person.isStaff) return json({ ok: false, error: 'Only the person who ordered the film can add people.' }, 403, corsHeaders);
    const email = normEmail(d.email);
    if (!validEmail(email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400, corsHeaders);
    if (email === normEmail(a.row.customer_email)) return json({ ok: false, error: "That's your own email; you already have access." }, 400, corsHeaders);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM film_people WHERE project_id = ?1`).bind(a.row.id).first();
    if (Number(n?.n || 0) >= MAX_PEOPLE) return json({ ok: false, error: `You can add up to ${MAX_PEOPLE} people.` }, 400, corsHeaders);
    const name = clip(d.name, 80);
    const ins = await env.DB.prepare(`INSERT OR IGNORE INTO film_people (project_id, email, name) VALUES (?1, ?2, ?3)`).bind(a.row.id, email, name || null).run();
    if (Number(ins.meta?.changes || 0) && d.invite !== false) {
      const owner = a.row.customer_name || a.row.customer_email;   // invitations always come in the buyer's name
      const film = a.row.project_name ? `"${a.row.project_name}"` : 'a Folder to Film project';
      const link = dashboardUrl(a.row.token);
      const hi = name ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,';
      const lines = [hi, '', `${owner} invited you to help with ${film}: a short film made from family photos, videos and stories. You can add your own photos and videos, answer questions and chat with us about it.`, '',
        link, '', `When you open it, ask for a sign-in code: we'll email it to this address (${email}). Only people ${owner} adds can get one.`, '', 'Chris', 'Folder to Film by Eastern Shore AI'];
      try {
        await sendCustomerEmail(env, a.row, { kind: 'invite', to: email, subject: `${owner} invited you to help with a film`, text: lines.join('\n'),
          html: shell(linesHtml(lines, link, 'Open the dashboard'), { heading: "You're invited", preheader: `${owner} invited you to help with ${film}.` }) });
      } catch (e) { console.error('film invite email', e); }
    }
    return json({ ok: true, people: await peopleFor(env, a.row) }, 200, corsHeaders);
  }

  // POST /api/film/people/remove {t, email}  (the buyer only): their devices stop working at once.
  async function handlePeopleRemove(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    if (!a.person.isOwner && !a.person.isStaff) return json({ ok: false, error: 'Only the person who ordered the film can remove people.' }, 403, corsHeaders);
    const email = normEmail(d.email);
    if (email === normEmail(a.row.customer_email)) return json({ ok: false, error: "You can't remove yourself." }, 400, corsHeaders);
    for (const table of ['film_people', 'film_devices', 'film_codes']) {
      await env.DB.prepare(`DELETE FROM ${table} WHERE project_id = ?1 AND email = ?2`).bind(a.row.id, email).run();
    }
    return json({ ok: true, people: await peopleFor(env, a.row) }, 200, corsHeaders);
  }

  // POST /api/film/dashboard {t, projectName, about, occasion, neededBy, links, phone, answers}
  async function handleDashboardSave(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    const row = a.row;
    if (!editable(row)) return json({ ok: false, error: row.status === 'pending_payment' ? 'Payment is still confirming. Try again in a moment.' : 'Production has started, so these details are locked. Reply to any of our emails to change something.' }, 409, corsHeaders);
    const answers = {};
    const src = d.answers && typeof d.answers === 'object' ? d.answers : {};
    for (const q of FILM_QUESTIONS) {
      const v = src[q.id];
      if (q.type === 'multi') {
        const list = (Array.isArray(v) ? v : []).map((x) => clip(x, 80)).filter((x) => q.options.includes(x));
        if (list.length) answers[q.id] = list;
      } else if (q.type === 'single') {
        const x = clip(v, 80);
        if (x && q.options.includes(x)) answers[q.id] = x;
      } else {
        const x = clip(v, 2000);
        if (x) answers[q.id] = x;
      }
    }
    const neededBy = /^\d{4}-\d{2}-\d{2}$/.test(clip(d.neededBy, 10)) ? clip(d.neededBy, 10) : '';
    await env.DB.prepare(
      `UPDATE film_projects SET project_name = ?1, about = ?2, occasion = ?3, needed_by = ?4, links = ?5,
         customer_phone = COALESCE(NULLIF(?6, ''), customer_phone), answers_json = ?7, updated_at = datetime('now') WHERE id = ?8`
    ).bind(clip(d.projectName, 120), clip(d.about, 4000), clip(d.occasion, 200), neededBy, clip(d.links, 4000), clip(d.phone, 40), JSON.stringify(answers), row.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- public: uploads (R2 multipart through the worker) ----------

  async function uploadGuard(env, corsHeaders, token, request) {
    if (!env.FILMS) return { res: json({ ok: false, error: "Uploads aren't switched on yet. Please call or text (302) 907-9162." }, 503, corsHeaders) };
    const a = await access(env, request, corsHeaders, token);
    if (a.res) return { res: a.res };
    const row = a.row;
    if (!editable(row)) return { res: json({ ok: false, error: 'Production has started, so uploads are closed. Reply to any of our emails and attach anything else.' }, 409, corsHeaders) };
    return { row };
  }

  // POST /api/film/upload/start {t, name, size, type}
  async function handleUploadStart(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const g = await uploadGuard(env, corsHeaders, d.t, request);
    if (g.res) return g.res;
    const size = Math.round(Number(d.size || 0));
    if (!Number.isFinite(size) || size < 0) return json({ ok: false, error: 'Bad file size' }, 400, corsHeaders);
    if (size > MAX_FILE_BYTES) return json({ ok: false, error: 'That file is over 50 GB. Please call us and we will set up another way to send it.' }, 413, corsHeaders);
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM film_uploads WHERE project_id = ?1`).bind(g.row.id).first();
    if (Number(count?.n || 0) >= MAX_FILES) return json({ ok: false, error: 'That is a lot of files! Zip the rest into one file, or call us.' }, 413, corsHeaders);
    const name = safeFilename(d.name);
    const type = clip(d.type, 120) || 'application/octet-stream';
    const key = `projects/${g.row.id}/${crypto.randomUUID().slice(0, 8)}-${name}`;
    const mpu = await env.FILMS.createMultipartUpload(key, { httpMetadata: { contentType: type }, customMetadata: { project: String(g.row.id), original: name } });
    const ins = await env.DB.prepare(
      `INSERT INTO film_uploads (project_id, r2_key, upload_id, filename, content_type, size_bytes, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'uploading')`
    ).bind(g.row.id, key, mpu.uploadId, name, type, size).run();
    return json({ ok: true, fileId: Number(ins.meta?.last_row_id || 0), partBytes: FILM_PART_BYTES, parts: Math.max(1, Math.ceil(size / FILM_PART_BYTES)) }, 200, corsHeaders);
  }

  async function uploadRow(env, projectId, fileId) {
    return env.DB.prepare(`SELECT * FROM film_uploads WHERE id = ?1 AND project_id = ?2`).bind(Math.round(Number(fileId || 0)), projectId).first();
  }

  // POST /api/film/upload/part?t=&file=&part=   body: the bytes of that part
  async function handleUploadPart(request, env, corsHeaders, url) {
    const g = await uploadGuard(env, corsHeaders, url.searchParams.get('t'), request);
    if (g.res) return g.res;
    const up = await uploadRow(env, g.row.id, url.searchParams.get('file'));
    if (!up || up.status !== 'uploading') return json({ ok: false, error: 'Upload not found' }, 404, corsHeaders);
    const part = Math.round(Number(url.searchParams.get('part') || 0));
    if (!(part >= 1 && part <= 10000)) return json({ ok: false, error: 'Bad part number' }, 400, corsHeaders);
    if (!request.body) return json({ ok: false, error: 'Empty part' }, 400, corsHeaders);
    const mpu = env.FILMS.resumeMultipartUpload(up.r2_key, up.upload_id);
    const uploaded = await mpu.uploadPart(part, request.body);
    return json({ ok: true, part: uploaded.partNumber, etag: uploaded.etag }, 200, corsHeaders);
  }

  // POST /api/film/upload/complete {t, fileId, parts: [{part, etag}]}
  async function handleUploadComplete(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const g = await uploadGuard(env, corsHeaders, d.t, request);
    if (g.res) return g.res;
    const up = await uploadRow(env, g.row.id, d.fileId);
    if (!up) return json({ ok: false, error: 'Upload not found' }, 404, corsHeaders);
    if (up.status === 'done') return json({ ok: true }, 200, corsHeaders);
    const parts = (Array.isArray(d.parts) ? d.parts : [])
      .map((p) => ({ partNumber: Math.round(Number(p.part || p.partNumber || 0)), etag: clip(p.etag, 200) }))
      .filter((p) => p.partNumber > 0 && p.etag)
      .sort((a, b) => a.partNumber - b.partNumber);
    if (!parts.length) return json({ ok: false, error: 'No parts' }, 400, corsHeaders);
    const mpu = env.FILMS.resumeMultipartUpload(up.r2_key, up.upload_id);
    const obj = await mpu.complete(parts);
    await env.DB.prepare(`UPDATE film_uploads SET status = 'done', size_bytes = ?1, completed_at = datetime('now') WHERE id = ?2`)
      .bind(Number(obj?.size ?? up.size_bytes ?? 0), up.id).run();
    return json({ ok: true, file: { id: up.id, name: up.filename, type: up.content_type, size: Number(obj?.size ?? up.size_bytes ?? 0) } }, 200, corsHeaders);
  }

  // POST /api/film/upload/delete {t, fileId}  (also aborts an unfinished upload)
  async function handleUploadDelete(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const g = await uploadGuard(env, corsHeaders, d.t, request);
    if (g.res) return g.res;
    const up = await uploadRow(env, g.row.id, d.fileId);
    if (!up) return json({ ok: true }, 200, corsHeaders);
    try {
      if (up.status === 'done') await env.FILMS.delete(up.r2_key);
      else await env.FILMS.resumeMultipartUpload(up.r2_key, up.upload_id).abort();
    } catch (e) { console.error('film upload delete', e); }
    await env.DB.prepare(`DELETE FROM film_uploads WHERE id = ?1`).bind(up.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- public: start production, feedback ----------

  // POST /api/film/start {t}
  async function handleStart(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    const row = a.row;
    if (row.status !== 'collecting') return json({ ok: false, error: 'Production has already started.' }, 409, corsHeaders);
    const uploads = await uploadsFor(env.DB, row.id);
    const missing = [];
    if (!clip(row.project_name, 120)) missing.push('a project name');
    if (!clip(row.about, 4000)) missing.push('a few words about the story');
    if (!uploads.length && !clip(row.links, 4000)) missing.push('at least one file or link');
    if (missing.length) return json({ ok: false, error: `Before we start, please add ${missing.join(', ')}.` }, 400, corsHeaders);
    const today = easternDate();
    const due = addBusinessDays(today, DEMO_BUSINESS_DAYS);
    const claim = await env.DB.prepare(
      `UPDATE film_projects SET status = 'production', production_started_at = datetime('now'), demo_due_date = ?1, updated_at = datetime('now') WHERE id = ?2 AND status = 'collecting'`
    ).bind(due, row.id).run();
    if (!Number(claim.meta?.changes || 0)) return json({ ok: false, error: 'Production has already started.' }, 409, corsHeaders);
    const fresh = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(row.id).first();
    // Unfinished uploads can't be finished now; clear them.
    const stale = (await env.DB.prepare(`SELECT * FROM film_uploads WHERE project_id = ?1 AND status != 'done'`).bind(row.id).all()).results || [];
    for (const s of stale) {
      try { if (env.FILMS) await env.FILMS.resumeMultipartUpload(s.r2_key, s.upload_id).abort(); } catch {}
      await env.DB.prepare(`DELETE FROM film_uploads WHERE id = ?1`).bind(s.id).run();
    }
    try {
      const m = await sendDraft(env, fresh, 'production');
      await sendCustomerEmail(env, fresh, { kind: 'production', subject: m.subject, text: m.body, html: m.html });
    } catch (e) { console.error('production email failed', e); }
    const total = uploads.reduce((s, u) => s + Number(u.size_bytes || 0), 0);
    try {
      await sendStaffOperationalAlert(env, {
        from: env.ALERTS_FROM_EMAIL,
        subject: `Start production: ${fresh.project_name} (demo due ${nice(due)})`,
        text: [`${fresh.customer_name || ''} <${fresh.customer_email || ''}> pressed Start production on Folder to Film #${fresh.id}.`,
          `Demo promised by ${nice(due)}.`, `${uploads.length} files (${bytesText(total)})${fresh.links ? ' plus links' : ''}.`, '',
          `About: ${clip(fresh.about, 600)}`, fresh.occasion ? `Occasion: ${fresh.occasion}` : '', fresh.needed_by ? `Needed by: ${fresh.needed_by}` : '', '',
          'Admin: https://www.easternshore.ai/admin.html (Folder to Film tab)'].filter((l) => l !== null).join('\n'),
      });
    } catch (e) { console.error('staff alert failed', e); }
    return json({ ok: true, demoDueDate: due, demoDueText: nice(due) }, 200, corsHeaders);
  }

  // POST /api/film/feedback {t, text, approve}
  async function handleFeedback(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    const row = a.row;
    if (!['demo_ready', 'changes'].includes(row.status)) return json({ ok: false, error: 'There is no demo waiting for feedback right now.' }, 409, corsHeaders);
    const text = clip(d.text, 8000);
    const approve = d.approve === true;
    if (!approve && !text) return json({ ok: false, error: 'Tell us what to change, or press Approve.' }, 400, corsHeaders);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const combined = [row.feedback, `[${stamp} UTC] ${approve ? 'APPROVED' : 'Changes'}${text ? `: ${text}` : ''}`].filter(Boolean).join('\n\n').slice(0, 20000);
    await env.DB.prepare(
      `UPDATE film_projects SET status = 'changes', feedback = ?1, feedback_at = datetime('now'), approved_at = CASE WHEN ?2 = 1 THEN datetime('now') ELSE approved_at END,
         change_rounds = change_rounds + ?4, updated_at = datetime('now') WHERE id = ?3`
    ).bind(combined, approve ? 1 : 0, row.id, !approve && row.status === 'demo_ready' ? 1 : 0).run();   // more notes before the next demo = same round
    try {
      await sendStaffOperationalAlert(env, {
        from: env.ALERTS_FROM_EMAIL,
        subject: `${approve ? 'Demo approved' : 'Changes requested'}: ${row.project_name || `Folder to Film #${row.id}`}`,
        text: [`${row.customer_name || row.customer_email} ${approve ? 'approved the demo' : 'asked for changes'}. Final is due the next business day.`, text ? `\n${text}` : '', '', 'Admin: https://www.easternshore.ai/admin.html (Folder to Film tab)'].join('\n'),
      });
    } catch (e) { console.error('staff alert failed', e); }
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- admin ----------

  async function adminGuard(request, env, corsHeaders, url) {
    if (!env.DB) return { ok: false, res: json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders) };
    return requireAdmin(request, env, corsHeaders, url);
  }

  function adminView(row, extra = {}) {
    return {
      ...row,
      statusLabel: FILM_STATUSES[row.status] || row.status,
      answers: parseAnswers(row),
      dashboard_url: dashboardUrl(row.token),
      demo_due_text: row.demo_due_date ? nice(row.demo_due_date) : '',
      estimated_done_text: row.estimated_done_date ? nice(row.estimated_done_date) : '',
      rounds_included: FILM_CHANGE_ROUNDS,
      has_demo_video: !!row.demo_key,
      has_final_video: !!row.final_key,
      share_url: row.share_token && row.final_key ? `${SITE}/film.html?s=${row.share_token}` : '',
      ...extra,
    };
  }

  // GET /api/film/projects
  async function handleAdminList(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const rows = (await env.DB.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM film_uploads u WHERE u.project_id = p.id AND u.status = 'done') AS file_count,
              (SELECT COALESCE(SUM(size_bytes), 0) FROM film_uploads u WHERE u.project_id = p.id AND u.status = 'done') AS file_bytes
       FROM film_projects p
       WHERE p.status != 'pending_payment' OR p.created_at > datetime('now', '-2 days')
       ORDER BY CASE p.status WHEN 'changes' THEN 0 WHEN 'production' THEN 1 WHEN 'collecting' THEN 2 WHEN 'demo_ready' THEN 3 WHEN 'final_ready' THEN 4 WHEN 'pending_payment' THEN 6 ELSE 5 END,
                COALESCE(p.demo_due_date, '9999'), p.id DESC`
    ).all()).results || [];
    const projects = rows.map((r) => adminView(r));
    const open = projects.filter((p) => ['collecting', 'production', 'demo_ready', 'changes', 'final_ready'].includes(p.status));
    return json({
      ok: true,
      projects,
      questions: FILM_QUESTIONS,
      statuses: FILM_STATUSES,
      summary: {
        open: open.length,
        inProduction: projects.filter((p) => p.status === 'production').length,
        changes: projects.filter((p) => p.status === 'changes').length,
        collecting: projects.filter((p) => p.status === 'collecting').length,
        revenueCents: projects.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount_cents || 0), 0),
      },
    }, 200, corsHeaders);
  }

  // GET /api/film/project?id=
  async function handleAdminDetail(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(url.searchParams.get('id') || 0)).first();
    if (!row) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    const uploads = await uploadsFor(env.DB, row.id, { all: true });
    const emails = (await env.DB.prepare(`SELECT kind, subject, to_email, sent_at FROM film_emails WHERE project_id = ?1 ORDER BY id DESC`).bind(row.id).all()).results || [];
    const chat = row.chat_session_id ? ((await env.DB.prepare(
      `SELECT role, content, sender_name, created_at FROM chat_messages WHERE session_id = ?1 AND role IN ('user', 'staff') ORDER BY id DESC LIMIT 30`
    ).bind(row.chat_session_id).all()).results || []).reverse() : [];
    const people = row.customer_email ? await peopleFor(env, row) : [];
    const devices = (await env.DB.prepare(`SELECT email, COUNT(*) AS n, MAX(last_seen_at) AS seen FROM film_devices WHERE project_id = ?1 AND expires_at > datetime('now') GROUP BY email`).bind(row.id).all()).results || [];
    return json({ ok: true, project: adminView(row), uploads, emails, chat, people, devices, questions: FILM_QUESTIONS }, 200, corsHeaders);
  }

  // POST /api/film/project/update {id, status?, demoUrl?, finalUrl?, notes?, demoDueDate?, estimatedDoneDate?}
  async function handleAdminUpdate(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(d.id || 0)).first();
    if (!row) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    const status = d.status === undefined ? row.status : clip(d.status, 30);
    if (!FILM_STATUSES[status]) return json({ ok: false, error: 'Unknown status' }, 400, corsHeaders);
    if (status !== row.status && row.status === 'pending_payment') return json({ ok: false, error: 'This checkout was never paid.' }, 400, corsHeaders);
    const urlOk = (v) => !v || /^https:\/\/\S+$/i.test(v);
    const demoUrl = d.demoUrl === undefined ? row.demo_url : clip(d.demoUrl, 500);
    const finalUrl = d.finalUrl === undefined ? row.final_url : clip(d.finalUrl, 500);
    if (!urlOk(demoUrl) || !urlOk(finalUrl)) return json({ ok: false, error: 'Links must start with https://' }, 400, corsHeaders);
    const due = d.demoDueDate === undefined ? row.demo_due_date : (/^\d{4}-\d{2}-\d{2}$/.test(clip(d.demoDueDate, 10)) ? clip(d.demoDueDate, 10) : null);
    const done = d.estimatedDoneDate === undefined ? row.estimated_done_date : (/^\d{4}-\d{2}-\d{2}$/.test(clip(d.estimatedDoneDate, 10)) ? clip(d.estimatedDoneDate, 10) : null);
    const notes = d.notes === undefined ? row.internal_notes : clip(d.notes, 8000);
    if (d.rotateToken === true) {
      // A leaked dashboard link: the old one stops working at once.
      await env.DB.prepare(`UPDATE film_projects SET token = ?1, updated_at = datetime('now') WHERE id = ?2`).bind(generateToken() + generateToken().slice(0, 12), row.id).run();
      await env.DB.prepare(`DELETE FROM film_devices WHERE project_id = ?1`).bind(row.id).run();   // every browser must sign in again
      return json({ ok: true, rotated: true }, 200, corsHeaders);
    }
    await env.DB.prepare(
      `UPDATE film_projects SET status = ?1, demo_url = ?2, final_url = ?3, demo_due_date = ?4, estimated_done_date = ?5, internal_notes = ?6, updated_at = datetime('now') WHERE id = ?7`
    ).bind(status, demoUrl || null, finalUrl || null, due || null, done || null, notes || null, row.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // POST /api/film/email {id, kind: welcome|demo|final|message, preview?, send?, subject?, body?}
  async function handleAdminEmail(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(d.id || 0)).first();
    if (!row) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    const kind = ['welcome', 'demo', 'final', 'message', 'production'].includes(d.kind) ? d.kind : 'message';
    if (kind === 'demo' && !row.demo_url && !row.demo_key) return json({ ok: false, error: 'Upload the demo video or add its link first.' }, 400, corsHeaders);
    if (kind === 'final' && !row.final_url && !row.final_key) return json({ ok: false, error: 'Upload the final film or add its link first.' }, 400, corsHeaders);
    const m = await sendDraft(env, row, kind, { subject: d.subject, body: d.body });
    if (d.preview) return json({ ok: true, preview: true, to: m.to, subject: m.subject, body: m.body, html: m.html, link: m.link }, 200, corsHeaders);
    if (!d.send) return json({ ok: true, link: m.link }, 200, corsHeaders);
    if (kind === 'message' && (!m.body.trim() || m.body.includes('(Write your message here.)'))) return json({ ok: false, error: 'Write your message first.' }, 400, corsHeaders);
    try {
      await sendCustomerEmail(env, row, { kind, subject: m.subject, text: m.body, html: m.html });
    } catch (e) {
      return json({ ok: false, error: e.message || 'Email failed' }, 502, corsHeaders);
    }
    if (kind === 'demo') await env.DB.prepare(`UPDATE film_projects SET status = CASE WHEN status IN ('production', 'changes') THEN 'demo_ready' ELSE status END, demo_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
    if (kind === 'final') await env.DB.prepare(`UPDATE film_projects SET status = CASE WHEN status != 'delivered' THEN 'final_ready' ELSE status END, final_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
    return json({ ok: true, emailed: true }, 200, corsHeaders);
  }

  function linkSecret(env) {
    return env.FILM_LINK_SECRET || env.ADMIN_PASSWORD || '';
  }

  // POST /api/film/file-link {fileId} -> a one-hour download link for one uploaded file
  async function handleAdminFileLink(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    const fileId = Math.round(Number(d?.fileId || 0));
    const up = await env.DB.prepare(`SELECT id FROM film_uploads WHERE id = ?1 AND status = 'done'`).bind(fileId).first();
    if (!up) return json({ ok: false, error: 'File not found' }, 404, corsHeaders);
    const secret = linkSecret(env);
    if (!secret) return json({ ok: false, error: 'No signing secret' }, 500, corsHeaders);
    const exp = Math.floor(Date.now() / 1000) + FILE_LINK_SECONDS;
    const sig = await hmacHex(secret, `film-file:${fileId}:${exp}`);
    const base = new URL(request.url).origin;
    return json({ ok: true, url: `${base}/api/film/file?f=${fileId}&e=${exp}&s=${sig}` }, 200, corsHeaders);
  }

  // GET /api/film/file?f=&e=&s=  (signed, no other auth: it's opened as a plain download)
  async function handleFileDownload(request, env, corsHeaders, url) {
    const fileId = Math.round(Number(url.searchParams.get('f') || 0));
    const exp = Math.round(Number(url.searchParams.get('e') || 0));
    const sig = clip(url.searchParams.get('s'), 128);
    const secret = linkSecret(env);
    if (!fileId || !exp || !sig || !secret || exp < Math.floor(Date.now() / 1000)) return new Response('This download link has expired. Get a new one from the admin page.', { status: 403 });
    const want = await hmacHex(secret, `film-file:${fileId}:${exp}`);
    if (!timingSafeEqual(want, sig)) return new Response('Bad link.', { status: 403 });
    const up = await env.DB.prepare(`SELECT * FROM film_uploads WHERE id = ?1 AND status = 'done'`).bind(fileId).first();
    if (!up || !env.FILMS) return new Response('Not found.', { status: 404 });
    const obj = await env.FILMS.get(up.r2_key);
    if (!obj) return new Response('Not found.', { status: 404 });
    const ascii = up.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return new Response(obj.body, {
      headers: {
        'Content-Type': up.content_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(up.filename)}`,
        'Cache-Control': 'private, no-store',
        ...(obj.size != null ? { 'Content-Length': String(obj.size) } : {}),
      },
    });
  }

  // POST /api/film/project/delete {id}  (unpaid or canceled projects only; removes their files too)
  async function handleAdminDelete(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(d?.id || 0)).first();
    if (!row) return json({ ok: true }, 200, corsHeaders);
    if (!['pending_payment', 'canceled'].includes(row.status)) return json({ ok: false, error: 'Mark it Canceled first (and refund it in Stripe if it was paid).' }, 400, corsHeaders);
    const ups = (await env.DB.prepare(`SELECT * FROM film_uploads WHERE project_id = ?1`).bind(row.id).all()).results || [];
    for (const u of ups) {
      try {
        if (!env.FILMS) break;
        if (u.status === 'done') await env.FILMS.delete(u.r2_key);
        else await env.FILMS.resumeMultipartUpload(u.r2_key, u.upload_id).abort();
      } catch (e) { console.error('film delete file', e); }
    }
    await env.DB.prepare(`DELETE FROM film_uploads WHERE project_id = ?1`).bind(row.id).run();
    for (const k of [row.demo_key, row.final_key]) { if (k && env.FILMS) { try { await env.FILMS.delete(k); } catch {} } }
    for (const table of ['film_emails', 'film_people', 'film_devices', 'film_codes']) {
      await env.DB.prepare(`DELETE FROM ${table} WHERE project_id = ?1`).bind(row.id).run();
    }
    await env.DB.prepare(`DELETE FROM film_projects WHERE id = ?1`).bind(row.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- Ask K order updates ----------

  // What each status means, in the customer's words (Ask K status email).
  function statusSentence(row) {
    const due = row.demo_due_date ? nice(row.demo_due_date) : '';
    const done = row.estimated_done_date ? nice(row.estimated_done_date) : '';
    switch (row.status) {
      case 'collecting': return "Waiting for your files. Open your dashboard to name the project, upload everything and answer the quick questions, then press Start production. Your demo comes 2 to 3 business days after that.";
      case 'production': return `In production. Your demo is expected by ${due || 'the date we emailed you'}${done ? `, and the finished film by ${done}` : ''}.`;
      case 'demo_ready': return `Your demo is ready to watch on your dashboard. Tell us what to change there, or approve it.${done ? ` Finished film expected by ${done}.` : ''}`;
      case 'changes': return `We have your notes and are making the changes.${done ? ` Finished film expected by ${done}.` : ' Your final film comes the next business day.'}`;
      case 'final_ready':
      case 'delivered': return 'Your finished film is ready to watch, share and download on your dashboard.';
      case 'canceled': return 'This order was canceled.';
      default: return FILM_STATUSES[row.status] || row.status;
    }
  }

  // Email the status of every film ordered with this address to that address.
  // Called from Ask K; the visitor sees the same reply either way.
  async function sendStatusEmail(env, email) {
    const rows = (await env.DB.prepare(
      `SELECT * FROM film_projects WHERE lower(trim(customer_email)) = ?1 AND status != 'pending_payment' ORDER BY id DESC LIMIT 10`
    ).bind(String(email || '').trim().toLowerCase()).all()).results || [];
    if (!rows.length) return false;
    const blocks = rows.map((r) => ({
      r,
      name: r.project_name || `Folder to Film order #${r.id}`,
      status: FILM_STATUSES[r.status] || r.status,
      sentence: statusSentence(r),
      link: dashboardUrl(r.token),
    }));
    const hi = firstName(rows[0]);
    const text = [hi, '', `Here's the latest on your Folder to Film order${rows.length > 1 ? 's' : ''}:`, '',
      ...blocks.flatMap((b) => [`${b.name}: ${b.status}`, b.sentence, `Your dashboard: ${b.link}`, '']),
      'Questions? Just reply to this email, or call or text (302) 907-9162.', '', 'Folder to Film by Eastern Shore AI'].join('\n');
    const html = shell([
      `<p style="margin:0 0 12px;">${escapeHtml(hi)}</p>`,
      `<p style="margin:0 0 12px;">Here's the latest on your Folder to Film order${rows.length > 1 ? 's' : ''}:</p>`,
      ...blocks.map((b) => detailsBox([['Film', b.name], ['Status', b.status]]) + `<p style="margin:10px 0 0;">${escapeHtml(b.sentence)}</p>` + emailButton(b.link, 'Open my dashboard')),
      '<p style="margin:0 0 12px;">Questions? Just reply to this email, or call or text (302) 907-9162.</p>',
    ].join(''), { heading: 'Your film status', preheader: `${blocks[0].name}: ${blocks[0].status}` });
    await sendCustomerEmail(env, rows[0], { kind: 'status', subject: rows.length > 1 ? 'Your Folder to Film orders: latest status' : `${blocks[0].name}: ${blocks[0].status}`, text, html });
    return true;
  }

  // Daily (scheduled handler): raw uploads go 12 months after the final film was
  // sent, and canceled projects' uploads go at once. The finished film, dashboard,
  // share page and chat stay (keepsakes and family copies can be ordered for
  // years); they're removed only on request (admin Delete after Canceled).
  async function purgeOldFilms(env) {
    if (!env.DB) return { uploads: 0 };
    const due = (await env.DB.prepare(
      `SELECT id FROM film_projects WHERE uploads_purged_at IS NULL AND (
         (final_sent_at IS NOT NULL AND final_sent_at <= datetime('now', ?1)) OR status = 'canceled')`
    ).bind(`-${UPLOAD_KEEP_DAYS} days`).all()).results || [];
    let files = 0;
    for (const { id } of due) {
      const ups = (await env.DB.prepare(`SELECT * FROM film_uploads WHERE project_id = ?1`).bind(id).all()).results || [];
      let failed = false;
      for (const u of ups) {
        try {
          if (!env.FILMS) { failed = true; break; }
          if (u.status === 'done') await env.FILMS.delete(u.r2_key);
          else await env.FILMS.resumeMultipartUpload(u.r2_key, u.upload_id).abort();
          await env.DB.prepare(`DELETE FROM film_uploads WHERE id = ?1`).bind(u.id).run();
          files++;
        } catch (e) { failed = true; console.error('film purge file', e); }
      }
      if (!failed) await env.DB.prepare(`UPDATE film_projects SET uploads_purged_at = datetime('now') WHERE id = ?1`).bind(id).run();
    }
    await env.DB.prepare(`DELETE FROM film_devices WHERE expires_at <= datetime('now')`).run();
    await env.DB.prepare(`DELETE FROM film_codes WHERE expires_at <= datetime('now', '-1 day')`).run();
    // Unpaid checkouts Stripe never expired (should be none): drop after 3 days.
    await env.DB.prepare(`DELETE FROM film_projects WHERE status = 'pending_payment' AND created_at <= datetime('now', '-3 days')`).run();
    return { uploads: files };
  }

  // ---------- project chat + notes ----------
  // Each film gets one chat_sessions row (page "Folder to Film: <name>"), so it
  // shows up in support-chat.html with push alerts like Survival Node's
  // "Talk to a human". The dashboard talks to these film-token routes; staff
  // reply from the console (/api/chat/message), which calls onStaffReply.

  const STAFF_ALERT_GAP_MIN = 30;   // at most one "new message" email to staff per project per half hour
  const REPLY_EMAIL_GAP_MIN = 20;   // at most one "Chris replied" email to the customer per 20 minutes
  const SEEN_WINDOW_SEC = 90;       // the customer is on the dashboard: no email needed

  async function ensureChat(env, row) {
    if (row.chat_session_id) {
      const s = await env.DB.prepare(`SELECT * FROM chat_sessions WHERE id = ?1`).bind(row.chat_session_id).first();
      if (s) return s;
    }
    const now = new Date().toISOString();
    const token = `film-${generateToken()}`;
    const page = `Folder to Film: ${row.project_name || `#${row.id}`}`.slice(0, 100);
    const ins = await env.DB.prepare(
      `INSERT INTO chat_sessions (session_token, page, page_url, customer_name, customer_email, status, escalated_at, last_activity_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6, ?6)`
    ).bind(token, page, `${SITE}/admin.html`, row.customer_name || null, row.customer_email || null, now).run();
    const id = Number(ins.meta?.last_row_id || 0);
    await env.DB.prepare(`INSERT INTO chat_messages (session_id, role, content, sender_name, created_at) VALUES (?1, 'system', ?2, 'System', ?3)`)
      .bind(id, `Project chat for Folder to Film #${row.id}. The customer is writing from their film dashboard.`, now).run();
    await env.DB.prepare(`UPDATE film_projects SET chat_session_id = ?1 WHERE id = ?2`).bind(id, row.id).run();
    return env.DB.prepare(`SELECT * FROM chat_sessions WHERE id = ?1`).bind(id).first();
  }

  function chatGuard(row, corsHeaders) {
    if (!row) return json({ ok: false, error: 'Film not found' }, 404, corsHeaders);
    if (row.status === 'pending_payment') return json({ ok: false, error: 'Payment is still confirming.' }, 409, corsHeaders);
    if (row.status === 'canceled') return json({ ok: false, error: 'This film was canceled.' }, 409, corsHeaders);
    return null;
  }

  // GET /api/film/chat?t=&after=
  async function handleChatGet(request, env, corsHeaders, url) {
    const a = await access(env, request, corsHeaders, url.searchParams.get('t'));
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    if (!a.person.isStaff) await env.DB.prepare(`UPDATE film_projects SET customer_seen_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
    if (!row.chat_session_id) return json({ ok: true, messages: [], typing: false }, 200, corsHeaders);
    const after = Math.max(0, Math.round(Number(url.searchParams.get('after') || 0)));
    const msgs = (await env.DB.prepare(
      `SELECT id, role, content, sender_name, created_at FROM chat_messages WHERE session_id = ?1 AND id > ?2 AND role IN ('user', 'staff') ORDER BY id ASC LIMIT 200`
    ).bind(row.chat_session_id, after).all()).results || [];
    const since = new Date(Date.now() - 5000).toISOString();
    const typing = await env.DB.prepare(`SELECT sender_name FROM chat_typing WHERE session_id = ?1 AND role = ?3 AND updated_at > ?2`).bind(row.chat_session_id, since, a.person.isStaff ? 'user' : 'staff').first();
    return json({ ok: true, messages: msgs, typing: typing ? (typing.sender_name || 'Chris') : false }, 200, corsHeaders);
  }

  // POST /api/film/chat {t, content}
  async function handleChatSend(request, env, corsHeaders, ctx) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    const who = a.person.name || a.person.email;
    const content = clip(d.content, 4000);
    if (!content) return json({ ok: false, error: 'Type a message first.' }, 400, corsHeaders);
    const session = await ensureChat(env, row);
    const now = new Date().toISOString();
    if (a.person.isStaff) {
      // Staff writing from the customer's dashboard: the same as replying from the console.
      const insStaff = await env.DB.prepare(`INSERT INTO chat_messages (session_id, role, content, sender_name, created_at) VALUES (?1, 'staff', ?2, ?3, ?4)`)
        .bind(session.id, content, STAFF_NAME, now).run();
      await env.DB.prepare(`UPDATE chat_sessions SET last_activity_at = ?1 WHERE id = ?2`).bind(now, session.id).run();
      await env.DB.prepare(`DELETE FROM chat_typing WHERE session_id = ?1 AND role = 'staff'`).bind(session.id).run();
      try {
        await env.DB.prepare(`INSERT INTO support_push_state (session_id, acknowledged_at, updated_at) VALUES (?1, ?2, datetime('now'))
          ON CONFLICT(session_id) DO UPDATE SET acknowledged_at = excluded.acknowledged_at, updated_at = datetime('now')`).bind(session.id, Math.floor(Date.now() / 1000)).run();
      } catch {}
      try { await onStaffReply(env, session.id, content, STAFF_NAME); } catch (e) { console.error('film staff reply email', e); }
      return json({ ok: true, message: { id: Number(insStaff.meta?.last_row_id || 0), role: 'staff', content, sender_name: STAFF_NAME, created_at: now } }, 200, corsHeaders);
    }
    const ins = await env.DB.prepare(`INSERT INTO chat_messages (session_id, role, content, sender_name, created_at) VALUES (?1, 'user', ?2, ?3, ?4)`)
      .bind(session.id, content, who, now).run();
    // A closed console chat reopens when the customer writes again.
    await env.DB.prepare(`UPDATE chat_sessions SET status = 'active', closed_at = NULL, last_activity_at = ?1, page = ?2 WHERE id = ?3`)
      .bind(now, `Folder to Film: ${row.project_name || `#${row.id}`}`.slice(0, 100), session.id).run();
    await env.DB.prepare(`DELETE FROM chat_typing WHERE session_id = ?1 AND role = 'user'`).bind(session.id).run();
    try { await env.DB.prepare(`DELETE FROM support_push_state WHERE session_id = ?1`).bind(session.id).run(); } catch {}
    const pushes = Promise.all([
      notifySupportPushes(env, { id: session.id, page: `Folder to Film: ${row.project_name || `#${row.id}`}`, customerName: row.customer_name || '' }, 0),
      enqueueSupportPushReminder(env, session.id, 300),
    ]).catch((e) => console.error('film chat push', e));
    if (ctx?.waitUntil) ctx.waitUntil(pushes); else await pushes;
    // Staff email, throttled.
    const recent = row.last_staff_alert_at && Date.parse(`${row.last_staff_alert_at.replace(' ', 'T')}Z`) > Date.now() - STAFF_ALERT_GAP_MIN * 60000;
    if (!recent) {
      await env.DB.prepare(`UPDATE film_projects SET last_staff_alert_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
      try {
        await sendStaffOperationalAlert(env, {
          from: env.ALERTS_FROM_EMAIL,
          subject: `Film chat: ${row.customer_name || row.customer_email || 'customer'} (${row.project_name || `#${row.id}`})`,
          text: [`${who}${a.person.isOwner ? '' : ` (added by ${row.customer_name || row.customer_email})`} wrote in the Folder to Film project chat:`, '', content, '',
            'Reply in Support Chat: https://www.easternshore.ai/support-chat.html', `(More messages in the next ${STAFF_ALERT_GAP_MIN} minutes won't email again; the console and push alerts show them.)`].join('\n'),
        });
      } catch (e) { console.error('film chat staff alert', e); }
    }
    return json({ ok: true, message: { id: Number(ins.meta?.last_row_id || 0), role: 'user', content, sender_name: who, created_at: now } }, 200, corsHeaders);
  }

  // POST /api/film/chat/typing {t, typing}
  async function handleChatTyping(request, env, corsHeaders) {
    const d = await readJson(request);
    const a = await access(env, request, corsHeaders, d?.t);
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    if (!row.chat_session_id) return json({ ok: true }, 200, corsHeaders);
    const role = a.person.isStaff ? 'staff' : 'user';
    if (d.typing === false) {
      await env.DB.prepare(`DELETE FROM chat_typing WHERE session_id = ?1 AND role = ?2`).bind(row.chat_session_id, role).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO chat_typing (session_id, role, sender_name, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(session_id, role) DO UPDATE SET sender_name = excluded.sender_name, updated_at = excluded.updated_at`
      ).bind(row.chat_session_id, role, a.person.name || a.person.email, new Date().toISOString()).run();
    }
    return json({ ok: true }, 200, corsHeaders);
  }

  // Called after a staff message in the support console: if the session is a
  // film chat and the customer isn't on their dashboard, email them the reply.
  async function onStaffReply(env, sessionId, content, senderName) {
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE chat_session_id = ?1`).bind(sessionId).first();
    if (!row || !row.customer_email) return false;
    const ago = (v) => (v ? Date.now() - Date.parse(`${String(v).replace(' ', 'T')}Z`) : Infinity);
    if (ago(row.customer_seen_at) < SEEN_WINDOW_SEC * 1000) return false;
    if (ago(row.last_reply_email_at) < REPLY_EMAIL_GAP_MIN * 60000) return false;
    await env.DB.prepare(`UPDATE film_projects SET last_reply_email_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
    const link = `${dashboardUrl(row.token)}#chat`;
    const who = clip(senderName, 60) || 'Chris';
    const hi = firstName(row);
    const text = [hi, '', `${who} replied in your project chat${row.project_name ? ` for "${row.project_name}"` : ''}:`, '', clip(content, 4000), '',
      `Reply on your dashboard: ${link}`, '', 'Folder to Film by Eastern Shore AI'].join('\n');
    const html = shell(
      `<p style="margin:0 0 12px;">${escapeHtml(hi)}</p><p style="margin:0 0 12px;">${escapeHtml(who)} replied in your project chat${row.project_name ? ` for "${escapeHtml(row.project_name)}"` : ''}:</p>`
      + `<div style="margin:0 0 16px;padding:12px 16px;background:#F7F8FA;border-left:4px solid #00B8D4;border-radius:6px;white-space:pre-wrap;">${escapeHtml(clip(content, 4000))}</div>`
      + emailButton(link, 'Reply on my dashboard'),
      { heading: 'New message about your film', preheader: clip(content, 120) });
    try {
      await sendCustomerEmail(env, row, { kind: 'chat_reply', subject: `${who} replied about your film`, text, html });
      return true;
    } catch (e) { console.error('film chat reply email', e); return false; }
  }

  // POST /api/film/notes {t, notes}
  async function handleNotes(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    await env.DB.prepare(`UPDATE film_projects SET customer_notes = ?1, customer_notes_at = datetime('now'), updated_at = datetime('now') WHERE id = ?2`)
      .bind(clip(d.notes, 20000) || null, row.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- delivering the demo and the final film ----------
  // Staff upload the video files from admin (multipart into R2, deliverables/<id>/).
  // The dashboard plays them through short-lived signed links (a <video> tag can't
  // send the sign-in header); the final film also gets a share page,
  // film.html?s=SHARE_TOKEN, which plays and downloads it without dashboard access.
  const WATCH_LINK_SECONDS = 12 * 3600;
  const DELIVER_KINDS = ['demo', 'final'];

  async function signedWatch(env, origin, id, kind, download = false) {
    const exp = Math.floor(Date.now() / 1000) + WATCH_LINK_SECONDS;
    const sig = await hmacHex(linkSecret(env), `film-watch:${id}:${kind}:${exp}`);
    return `${origin}/api/film/watch?f=${id}&k=${kind}&e=${exp}&sig=${sig}${download ? '&dl=1' : ''}`;
  }

  async function mediaFor(env, row, origin) {
    const out = {};
    const shows = (kind) => kind === 'demo' ? ['demo_ready', 'changes', 'final_ready', 'delivered'].includes(row.status) : ['final_ready', 'delivered'].includes(row.status);
    if (row.demo_key && shows('demo') && linkSecret(env)) out.demoSrc = await signedWatch(env, origin, row.id, 'demo');
    if (row.final_key && shows('final') && linkSecret(env)) {
      out.finalSrc = await signedWatch(env, origin, row.id, 'final');
      out.downloadUrl = await signedWatch(env, origin, row.id, 'final', true);
      if (row.share_token) out.shareUrl = `${SITE}/film.html?s=${row.share_token}`;
    }
    return out;
  }

  function deliverKey(id, key) {
    return typeof key === 'string' && key.startsWith(`deliverables/${id}/`) && !key.includes('..');
  }

  // POST /api/film/deliver/start {id, kind, name, size, type}
  async function handleDeliverStart(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    if (!env.FILMS) return json({ ok: false, error: 'FILMS storage is not set up' }, 503, corsHeaders);
    const d = await readJson(request);
    const row = await env.DB.prepare(`SELECT id FROM film_projects WHERE id = ?1`).bind(Number(d?.id || 0)).first();
    if (!row) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    const kind = DELIVER_KINDS.includes(d.kind) ? d.kind : null;
    if (!kind) return json({ ok: false, error: 'kind must be demo or final' }, 400, corsHeaders);
    const size = Math.round(Number(d.size || 0));
    if (!(size > 0) || size > MAX_FILE_BYTES) return json({ ok: false, error: 'Bad file size' }, 400, corsHeaders);
    const ext = (safeFilename(d.name).match(/\.([a-z0-9]{2,5})$/i) || [, 'mp4'])[1].toLowerCase();
    const key = `deliverables/${row.id}/${kind}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const mpu = await env.FILMS.createMultipartUpload(key, { httpMetadata: { contentType: clip(d.type, 80) || 'video/mp4' } });
    return json({ ok: true, key, uploadId: mpu.uploadId, partBytes: FILM_PART_BYTES, parts: Math.max(1, Math.ceil(size / FILM_PART_BYTES)) }, 200, corsHeaders);
  }

  // POST /api/film/deliver/part?id=&key=&uploadId=&part=   body: the bytes
  async function handleDeliverPart(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const id = Number(url.searchParams.get('id') || 0);
    const key = url.searchParams.get('key') || '';
    const part = Math.round(Number(url.searchParams.get('part') || 0));
    if (!env.FILMS || !deliverKey(id, key) || !(part >= 1 && part <= 10000) || !request.body) return json({ ok: false, error: 'Bad upload' }, 400, corsHeaders);
    const up = await env.FILMS.resumeMultipartUpload(key, clip(url.searchParams.get('uploadId'), 400)).uploadPart(part, request.body);
    return json({ ok: true, part: up.partNumber, etag: up.etag }, 200, corsHeaders);
  }

  // POST /api/film/deliver/complete {id, kind, key, uploadId, parts}
  async function handleDeliverComplete(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(d?.id || 0)).first();
    if (!row || !env.FILMS) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    const kind = DELIVER_KINDS.includes(d.kind) ? d.kind : null;
    if (!kind || !deliverKey(row.id, d.key)) return json({ ok: false, error: 'Bad upload' }, 400, corsHeaders);
    const parts = (Array.isArray(d.parts) ? d.parts : []).map((x) => ({ partNumber: Math.round(Number(x.part || x.partNumber || 0)), etag: clip(x.etag, 200) }))
      .filter((x) => x.partNumber > 0 && x.etag).sort((a, b) => a.partNumber - b.partNumber);
    if (!parts.length) return json({ ok: false, error: 'No parts' }, 400, corsHeaders);
    await env.FILMS.resumeMultipartUpload(d.key, clip(d.uploadId, 400)).complete(parts);
    const previous = kind === 'demo' ? row.demo_key : row.final_key;
    if (previous && previous !== d.key) { try { await env.FILMS.delete(previous); } catch {} }
    const share = row.share_token || generateToken() + generateToken().slice(0, 8);
    if (kind === 'demo') await env.DB.prepare(`UPDATE film_projects SET demo_key = ?1, updated_at = datetime('now') WHERE id = ?2`).bind(d.key, row.id).run();
    else await env.DB.prepare(`UPDATE film_projects SET final_key = ?1, share_token = ?2, updated_at = datetime('now') WHERE id = ?3`).bind(d.key, share, row.id).run();
    return json({ ok: true, kind, shareUrl: kind === 'final' ? `${SITE}/film.html?s=${share}` : '' }, 200, corsHeaders);
  }

  // GET /api/film/share?s=SHARE_TOKEN -> what the share page needs
  async function handleShareInfo(request, env, corsHeaders, url) {
    const token = clip(url.searchParams.get('s'), 80);
    const row = token.length >= 24 ? await env.DB.prepare(`SELECT * FROM film_projects WHERE share_token = ?1`).bind(token).first() : null;
    if (!row || !row.final_key || !['final_ready', 'delivered'].includes(row.status)) return json({ ok: false, error: 'This film link is not available.' }, 404, corsHeaders);
    const base = `${new URL(request.url).origin}/api/film/watch?share=${encodeURIComponent(token)}`;
    return json({ ok: true, title: row.project_name || 'Our film', src: base, downloadUrl: `${base}&dl=1` }, 200, corsHeaders);
  }

  // GET /api/film/watch?f=&k=&e=&sig=[&dl=1]  or  ?share=SHARE_TOKEN[&dl=1]
  // Streams a delivered video from R2, with byte ranges so phones can seek.
  async function handleWatch(request, env, corsHeaders, url) {
    if (!env.FILMS) return new Response('Not found.', { status: 404 });
    let row = null;
    let kind = 'final';
    const share = clip(url.searchParams.get('share'), 80);
    if (share) {
      row = share.length >= 24 ? await env.DB.prepare(`SELECT * FROM film_projects WHERE share_token = ?1`).bind(share).first() : null;
      if (row && !['final_ready', 'delivered'].includes(row.status)) row = null;
    } else {
      const id = Math.round(Number(url.searchParams.get('f') || 0));
      kind = url.searchParams.get('k') === 'demo' ? 'demo' : 'final';
      const exp = Math.round(Number(url.searchParams.get('e') || 0));
      const sig = clip(url.searchParams.get('sig'), 128);
      const secret = linkSecret(env);
      if (!id || !exp || !sig || !secret || exp < Math.floor(Date.now() / 1000)) return new Response('This video link has expired. Reload your dashboard.', { status: 403 });
      if (!timingSafeEqual(await hmacHex(secret, `film-watch:${id}:${kind}:${exp}`), sig)) return new Response('Bad link.', { status: 403 });
      row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(id).first();
    }
    const key = row ? (kind === 'demo' ? row.demo_key : row.final_key) : null;
    if (!key) return new Response('Not found.', { status: 404 });
    const head = await env.FILMS.head(key);
    if (!head) return new Response('Not found.', { status: 404 });
    const size = Number(head.size || 0);
    const type = head.httpMetadata?.contentType || 'video/mp4';
    const name = `${(row.project_name || 'film').replace(/[^\w\s-]+/g, '').trim().slice(0, 60) || 'film'}${kind === 'demo' ? ' (demo)' : ''}.${(key.split('.').pop() || 'mp4')}`;
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${url.searchParams.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`,
    };
    const m = (request.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
    if (m && size > 0) {
      let start = m[1] === '' ? Math.max(0, size - Number(m[2] || 0)) : Number(m[1]);
      let end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (!(start <= end) || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      const obj = await env.FILMS.get(key, { range: { offset: start, length: end - start + 1 } });
      if (!obj) return new Response('Not found.', { status: 404 });
      return new Response(obj.body, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
    }
    const obj = await env.FILMS.get(key);
    if (!obj) return new Response('Not found.', { status: 404 });
    return new Response(obj.body, { headers: { ...headers, 'Content-Length': String(size) } });
  }

  // POST /api/film/staff-link {id} (admin) -> a one-time link that opens the dashboard as staff
  async function handleStaffLink(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(d?.id || 0)).first();
    if (!row) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    if (row.status === 'pending_payment') return json({ ok: false, error: 'This checkout was never paid.' }, 400, corsHeaders);
    const code = generateToken() + generateToken();
    await env.DB.prepare(`INSERT INTO film_codes (project_id, email, code_hash, expires_at) VALUES (?1, ?2, ?3, datetime('now', ?4))`)
      .bind(row.id, STAFF_ID, await sha256Hex(`${row.id}:${STAFF_ID}:${code}`), `+${STAFF_LINK_MINUTES} minutes`).run();
    return json({ ok: true, url: `${dashboardUrl(row.token)}&staff=${code}` }, 200, corsHeaders);
  }

  // POST /api/film/access/staff {t, code} -> { deviceToken } (the one-time link from admin)
  async function handleStaffAccess(request, env, corsHeaders) {
    const d = await readJson(request);
    const row = d ? await getByToken(env.DB, d.t) : null;
    const code = clip(d?.code, 80);
    const fail = json({ ok: false, error: 'This staff link has expired or was already used. Open the dashboard again from admin.' }, 403, corsHeaders);
    if (!row || code.length < 40) return fail;
    const c = await env.DB.prepare(`SELECT * FROM film_codes WHERE project_id = ?1 AND email = ?2 AND code_hash = ?3 AND expires_at > datetime('now')`)
      .bind(row.id, STAFF_ID, await sha256Hex(`${row.id}:${STAFF_ID}:${code}`)).first();
    if (!c) return fail;
    await env.DB.prepare(`DELETE FROM film_codes WHERE id = ?1`).bind(c.id).run();
    return json({ ok: true, deviceToken: await issueDevice(env, row, STAFF_ID) }, 200, corsHeaders);
  }

  return {
    handleStaffLink, handleStaffAccess,
    handleDeliverStart, handleDeliverPart, handleDeliverComplete, handleShareInfo, handleWatch,
    handleAccessCode, handleAccessVerify, handlePeopleAdd, handlePeopleRemove,
    handleChatGet, handleChatSend, handleChatTyping, handleNotes, onStaffReply,
    sendStatusEmail, purgeOldFilms,
    handleCheckout, handleFilmPaid, handleFilmExpired,
    handleDashboardGet, handleDashboardSave,
    handleUploadStart, handleUploadPart, handleUploadComplete, handleUploadDelete,
    handleStart, handleFeedback,
    handleAdminList, handleAdminDetail, handleAdminUpdate, handleAdminEmail, handleAdminFileLink, handleAdminDelete,
    handleFileDownload,
  };
}
