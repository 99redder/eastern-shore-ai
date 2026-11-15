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
import { filmEmailLayout, filmButton, filmCallout, filmDetailsBox, filmQuote, FILM_LINK } from './email-layout.js';
import { easternDate } from './node-price.js';

export const FILM_PRICE_CENTS = 19999;
export const FILM_TAX_CODE = 'txcd_10402100'; // Digital Audio Visual Works - downloaded - non subscription - with permanent rights
// Keepsakes customers can buy straight from my-keepsakes.html (keep the page's prices in step).
// Red, 2026-11-14: start simple, one printed book (the hardcover, printed by Lulu) plus its copies,
// and the audiobook. The picture book, prints and QR plaque were dropped for now.
// Costs from Lulu's calculator on 2026-11-14 for an 8.5" square hardcover, premium color, 80# coated:
// 60 pages $23.87, 80 pages $28.16; one book by US Ground $13.74 (Mail $5.69).
// U.S. only, free shipping built into the price, high markup (about 3.5x on the book).
// Keepsakes aren't refundable once paid (terms section 12); damaged or misprinted books are replaced.
export const FILM_KEEPSAKES = {
  book: { name: 'Hardcover story book', cents: 14900, taxCode: 'txcd_35010000', ship: true, maxQty: 1,
    desc: 'Your film as an 8.5-inch square hardcover book: every chapter, photo and illustration. Free shipping to U.S. addresses.' },
  copies: { name: 'Extra copies of the hardcover book', cents: 7900, taxCode: 'txcd_35010000', ship: false, maxQty: 25,
    desc: 'Reprints of the hardcover book for family, shipped free to each U.S. address.' },
  audiobook: { name: 'Audiobook (MP3)', cents: 2900, taxCode: 'txcd_10301000', ship: false, maxQty: 1,
    desc: "Made to be an audiobook, not just the film's soundtrack: the narration plus new narration for everything the film shows on screen (photos, maps, captions), so the whole story works by ear. MP3 download." },
};

export const FILM_TERMS_VERSION = '2026-11-14.8';
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
  } = deps;

  const SITE = 'https://www.easternshore.ai';
  const dashboardUrl = (token, origin = SITE) => `${origin}/my-film.html?t=${encodeURIComponent(token)}`;
  const keepsakesUrl = (token, origin = SITE) => `${origin}/my-keepsakes.html?t=${encodeURIComponent(token)}`;

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
  // What a person the buyer adds may do (asked when they're added; the buyer can change it later).
  // The buyer and staff can do everything, including adding people, Start production and the demo feedback.
  const FILM_ROLES = {
    helper: { label: 'Add photos and chat', can: ['view', 'upload', 'chat', 'keepsakes'] },
    editor: { label: 'Add photos, chat and edit the details', can: ['view', 'upload', 'deleteAny', 'chat', 'edit', 'keepsakes'] },
    keepsakes: { label: 'Order keepsakes only', can: ['keepsakes'] },
  };
  const roleOf = (v) => (Object.prototype.hasOwnProperty.call(FILM_ROLES, v) ? v : 'helper');
  function can(person, what) {
    if (!person) return false;
    if (person.isOwner || person.isStaff) return true;
    return FILM_ROLES[roleOf(person.role)].can.includes(what);
  }
  function forbidden(row, need, corsHeaders) {
    const buyer = clip(row.customer_name, 60) || 'the person who ordered the film';
    const msg = {
      view: 'This invitation is for ordering keepsakes. Open the keepsakes page instead.',
      edit: `Only ${buyer} can change what's written here. Send your ideas in the project chat.`,
      decide: `Only ${buyer} can do this. Share your thoughts in the project chat.`,
      people: `Only ${buyer} can add or remove people.`,
    }[need] || "Your invitation doesn't include this.";
    return json({ ok: false, error: msg, ...(need === 'view' ? { keepsakesOnly: true } : {}) }, 403, corsHeaders);
  }

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
    const added = (await env.DB.prepare(`SELECT email, name, role, added_at FROM film_people WHERE project_id = ?1 ORDER BY id`).bind(row.id).all()).results || [];
    return [{ email: normEmail(row.customer_email), name: row.customer_name || '', isOwner: true },
      ...added.map((p) => ({ email: p.email, name: p.name || '', isOwner: false, role: roleOf(p.role), roleLabel: FILM_ROLES[roleOf(p.role)].label, addedAt: p.added_at }))];
  }

  async function personFor(env, row, email) {
    const e = normEmail(email);
    if (!e) return null;
    if (e === STAFF_ID) return { email: STAFF_ID, name: STAFF_NAME, isOwner: false, isStaff: true };
    if (e === normEmail(row.customer_email)) return { email: e, name: row.customer_name || '', isOwner: true };
    const p = await env.DB.prepare(`SELECT email, name, role FROM film_people WHERE project_id = ?1 AND email = ?2`).bind(row.id, e).first();
    return p ? { email: p.email, name: p.name || '', isOwner: false, role: roleOf(p.role) } : null;
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
  // `need` is what the route lets them do (see FILM_ROLES); most routes need 'view'.
  async function access(env, request, corsHeaders, token, need = 'view') {
    const row = await getByToken(env.DB, token);
    if (!row) return { res: json({ ok: false, error: 'Film not found' }, 404, corsHeaders) };
    if (row.status === 'pending_payment') return { res: json({ ok: false, error: 'Payment is still confirming. Try again in a moment.' }, 409, corsHeaders) };
    const person = await deviceFor(env, row, request);
    if (!person) return { res: needsCode(row, corsHeaders) };
    if (need && !can(person, need)) return { res: forbidden(row, need, corsHeaders) };
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
      `SELECT id, filename, content_type, size_bytes, status, created_at, completed_at, uploaded_by, uploader_email FROM film_uploads
       WHERE project_id = ?1 ${all ? '' : "AND status = 'done'"} ORDER BY id`
    ).bind(projectId).all()).results || [];
    return rows;
  }

  function editable(row) {
    return row.status === 'collecting';
  }

  function customerView(row, uploads, person = null) {
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
      uploads: uploads.map((u) => ({ id: u.id, name: u.filename, type: u.content_type || '', size: Number(u.size_bytes || 0), at: u.completed_at || u.created_at, by: u.uploaded_by || '',
        mine: !!(person && u.uploader_email && u.uploader_email === person.email) })),
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
    return filmEmailLayout({
      heading,
      preheader,
      body: innerHtml,
      panels: link ? [filmCallout('Your film dashboard',
        `Everything for your film lives on your private dashboard: <a href="${escapeHtml(link)}" style="${FILM_LINK}">open it here</a>. Bookmark it. Lost the link? Just reply to this email and we'll send it again.`)] : [],
      footerNote: "You're receiving this about your Folder to Film order with Eastern Shore AI. Just reply if you have a question.",
    });
  }

  // Paragraph lines -> HTML; a line that is exactly `link` becomes the button.
  function linesHtml(lines, link, buttonLabel) {
    return lines.map((l) => {
      if (!l) return '';
      if (link && l === link) return filmButton(link, buttonLabel);
      let html = escapeHtml(l);
      if (link) html = html.replace(escapeHtml(link), `<a href="${escapeHtml(link)}" style="${FILM_LINK}">${escapeHtml(link)}</a>`);
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
            link, '', 'Thought of something else, or found another photo? Your details and uploads are locked now, so tell us in the project chat on your dashboard. If you have more files, we can reopen uploads for you there.', '', 'Chris'],
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
            'Thank you for trusting us with your story. You can also turn it into a hardcover book or an audiobook (with extra narration, made for listening) from the Keepsakes link on your dashboard.', '', 'Chris'],
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
    const people = await peopleFor(env, row);
    const orders = await keepsakeOrders(env, row.id);
    const me = { ...person, ...(person.isOwner || person.isStaff ? {} : { roleLabel: FILM_ROLES[roleOf(person.role)].label }),
      can: Object.fromEntries(['view', 'upload', 'deleteAny', 'chat', 'edit', 'decide', 'people', 'keepsakes'].map((k) => [k, k === 'decide' || k === 'people' ? !!(person.isOwner || person.isStaff) : can(person, k)])) };
    const orderView = (o) => ({ item: o.item, qty: o.qty, status: o.status, paidAt: o.paid_at, mine: orderIsMine(o, row, person), by: orderedByName(o, row, people) });
    // Keepsakes-only invitations see the film's name and the keepsakes, nothing from the dashboard.
    if (!can(person, 'view')) {
      return json({ ok: true, keepsakesOnly: true, project: {
        id: row.id, status: row.status, statusLabel: FILM_STATUSES[row.status] || row.status, projectName: row.project_name || '', occasion: row.occasion || '',
        customerName: row.customer_name || '', me, bookOrdered: hasBook(orders), names: people.map((x) => x.name).filter(Boolean),
        keepsakeOrders: orders.filter((o) => orderIsMine(o, row, person)).map(orderView),
        ...(await mediaFor(env, { ...row, demo_key: null, final_key: null }, new URL(request.url).origin, { audiobook: audiobookAccess(row, person, orders, people) })),
        ...myListen(row, person, orders),
      } }, 200, corsHeaders);
    }
    const uploads = await uploadsFor(env.DB, row.id);
    const view = customerView(row, uploads, person);
    Object.assign(view, await mediaFor(env, row, new URL(request.url).origin, { audiobook: audiobookAccess(row, person, orders, people) }), myListen(row, person, orders));
    view.me = me;
    if (person.isOwner || person.isStaff) view.people = people;
    view.names = people.map((x) => x.name).filter(Boolean);
    view.bookOrdered = hasBook(orders);
    view.keepsakeOrders = orders.map(orderView);
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
    const text = [`Your sign-in code for ${name} is ${code}.`, '', `It works for ${CODE_MINUTES} minutes. Type it on the page that asked for it, and that browser will remember you.`, '',
      "Didn't ask for this? You can ignore it: nobody can open your film's pages without this code.", '', 'Folder to Film by Eastern Shore AI'].join('\n');
    const html = shell(`<p style="margin:0 0 12px;">Your sign-in code for ${escapeHtml(name)} is:</p>`
      + `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px;color:#2A2118;">${code}</p>`
      + `<p style="margin:0 0 12px;">It works for ${CODE_MINUTES} minutes. Type it on the page that asked for it, and that browser will remember you.</p>`
      + `<p style="margin:0 0 12px;color:#7D725F;">Didn't ask for this? You can ignore it: nobody can open your film's pages without this code.</p>`,
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

  // POST /api/film/people {t, email, name, role}  (the buyer only): add someone who can get a code.
  // role: helper (add photos and chat, the default), editor (also edit the details), keepsakes (order keepsakes only).
  async function handlePeopleAdd(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    if (!a.person.isOwner && !a.person.isStaff) return forbidden(a.row, 'people', corsHeaders);
    const email = normEmail(d.email);
    if (!validEmail(email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400, corsHeaders);
    if (email === normEmail(a.row.customer_email)) return json({ ok: false, error: "That's your own email; you already have access." }, 400, corsHeaders);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM film_people WHERE project_id = ?1`).bind(a.row.id).first();
    if (Number(n?.n || 0) >= MAX_PEOPLE) return json({ ok: false, error: `You can add up to ${MAX_PEOPLE} people.` }, 400, corsHeaders);
    const name = clip(d.name, 80);
    const role = roleOf(clip(d.role, 20));
    const ins = await env.DB.prepare(`INSERT OR IGNORE INTO film_people (project_id, email, name, role) VALUES (?1, ?2, ?3, ?4)`).bind(a.row.id, email, name || null, role).run();
    if (Number(ins.meta?.changes || 0) && d.invite !== false) {
      try {
        const m = inviteEmail(a.row, { email, name, role });
        await sendCustomerEmail(env, a.row, { kind: 'invite', to: email, subject: m.subject, text: m.text, html: m.html });
      } catch (e) { console.error('film invite email', e); }
    }
    return json({ ok: true, people: await peopleFor(env, a.row) }, 200, corsHeaders);
  }

  // The invitation, in the buyer's name. Keepsakes-only invitations open the keepsakes page.
  function inviteEmail(row, { email, name, role }) {
    const owner = row.customer_name || row.customer_email;
    const film = row.project_name ? `"${row.project_name}"` : 'a Folder to Film project';
    const hi = name ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,';
    const signIn = `When you open it, ask for a sign-in code: we'll email it to this address (${email}). Only people ${owner} adds can get one.`;
    if (role === 'keepsakes') {
      const link = keepsakesUrl(row.token);
      const lines = [hi, '', `${owner} invited you to order keepsakes from ${film}: a short film made from family photos, videos and stories. You can order your own copy of the hardcover story book (shipped free anywhere in the U.S.) or the audiobook, which has extra narration so the whole story works by ear.`, '',
        link, '', signIn, '', 'Chris', 'Folder to Film by Eastern Shore AI'];
      return { subject: `${owner} invited you to order keepsakes from a family film`, text: lines.join('\n'),
        html: shell(linesHtml(lines, link, 'See the keepsakes'), { heading: "You're invited", preheader: `${owner} invited you to order keepsakes from ${film}.` }) };
    }
    const link = dashboardUrl(row.token);
    const what = role === 'editor'
      ? 'You can add your own photos and videos, fill in the details and answers, and chat with us about it.'
      : 'You can add your own photos and videos and chat with us about it.';
    const lines = [hi, '', `${owner} invited you to help with ${film}: a short film made from family photos, videos and stories. ${what}`, '',
      link, '', signIn, '', 'Chris', 'Folder to Film by Eastern Shore AI'];
    return { subject: `${owner} invited you to help with a film`, text: lines.join('\n'),
      html: shell(linesHtml(lines, link, 'Open the dashboard'), { heading: "You're invited", preheader: `${owner} invited you to help with ${film}.` }) };
  }

  // POST /api/film/people/role {t, email, role}  (the buyer only): change what someone may do.
  async function handlePeopleRole(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    if (!a.person.isOwner && !a.person.isStaff) return forbidden(a.row, 'people', corsHeaders);
    if (!Object.prototype.hasOwnProperty.call(FILM_ROLES, clip(d.role, 20))) return json({ ok: false, error: 'Unknown access level' }, 400, corsHeaders);
    await env.DB.prepare(`UPDATE film_people SET role = ?1 WHERE project_id = ?2 AND email = ?3`).bind(clip(d.role, 20), a.row.id, normEmail(d.email)).run();
    return json({ ok: true, people: await peopleFor(env, a.row) }, 200, corsHeaders);
  }

  // POST /api/film/people/remove {t, email}  (the buyer only): their devices stop working at once.
  async function handlePeopleRemove(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    if (!a.person.isOwner && !a.person.isStaff) return forbidden(a.row, 'people', corsHeaders);
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
    const a = await access(env, request, corsHeaders, d.t, 'edit');
    if (a.res) return a.res;
    const row = a.row;
    if (!editable(row)) return json({ ok: false, error: row.status === 'pending_payment' ? 'Payment is still confirming. Try again in a moment.' : 'Production has started, so these details are locked. Send any changes in the project chat.' }, 409, corsHeaders);
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
    ).bind(clip(d.projectName, 120), clip(d.about, 50000), clip(d.occasion, 200), neededBy, clip(d.links, 4000), clip(d.phone, 40), JSON.stringify(answers), row.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- public: uploads (R2 multipart through the worker) ----------

  async function uploadGuard(env, corsHeaders, token, request) {
    if (!env.FILMS) return { res: json({ ok: false, error: "Uploads aren't switched on yet. Please call or text (302) 907-9162." }, 503, corsHeaders) };
    const a = await access(env, request, corsHeaders, token, 'upload');
    if (a.res) return { res: a.res };
    const row = a.row;
    if (!editable(row)) return { res: json({ ok: false, error: 'Production has started, so uploads are closed. Tell us in the project chat; we can reopen uploads if you have more files.' }, 409, corsHeaders) };
    return { row, person: a.person };
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
      `INSERT INTO film_uploads (project_id, r2_key, upload_id, filename, content_type, size_bytes, status, uploaded_by, uploader_email) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'uploading', ?7, ?8)`
    ).bind(g.row.id, key, mpu.uploadId, name, type, size, clip(g.person?.name || g.person?.email || '', 120) || null, g.person?.email || null).run();
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
    return json({ ok: true, file: { id: up.id, name: up.filename, type: up.content_type, size: Number(obj?.size ?? up.size_bytes ?? 0), at: new Date().toISOString(), by: up.uploaded_by || '', mine: true } }, 200, corsHeaders);
  }

  // POST /api/film/upload/delete {t, fileId}  (also aborts an unfinished upload)
  async function handleUploadDelete(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const g = await uploadGuard(env, corsHeaders, d.t, request);
    if (g.res) return g.res;
    const up = await uploadRow(env, g.row.id, d.fileId);
    if (!up) return json({ ok: true }, 200, corsHeaders);
    // Helpers can take back their own files; the buyer and editors can remove any.
    if (!can(g.person, 'deleteAny') && !(up.uploader_email && up.uploader_email === g.person.email)) {
      return json({ ok: false, error: `You can remove the files you uploaded. Ask ${clip(g.row.customer_name, 60) || 'the person who ordered the film'} to remove this one.` }, 403, corsHeaders);
    }
    try {
      if (up.status === 'done') await env.FILMS.delete(up.r2_key);
      else await env.FILMS.resumeMultipartUpload(up.r2_key, up.upload_id).abort();
    } catch (e) { console.error('film upload delete', e); }
    await env.DB.prepare(`DELETE FROM film_uploads WHERE id = ?1`).bind(up.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // ---------- public: start production, feedback ----------

  // POST /api/film/start {t}  (the buyer only)
  async function handleStart(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t);
    if (a.res) return a.res;
    if (!a.person.isOwner && !a.person.isStaff) return forbidden(a.row, 'decide', corsHeaders);
    const row = a.row;
    if (row.status !== 'collecting') return json({ ok: false, error: 'Production has already started.' }, 409, corsHeaders);
    const uploads = await uploadsFor(env.DB, row.id);
    const missing = [];
    if (!clip(row.project_name, 120)) missing.push('a project name');
    if (!clip(row.about, 50000)) missing.push('a few words about the story');
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
    if (!a.person.isOwner && !a.person.isStaff) return forbidden(a.row, 'decide', corsHeaders);
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
    const keepsakes = await adminKeepsakes(env, new URL(request.url).origin);
    return json({
      ok: true,
      projects,
      keepsakes,
      keepsakeStatuses: KEEPSAKE_STATUSES,
      keepsakeItemStatuses: KEEPSAKE_ITEM_STATUSES,
      questions: FILM_QUESTIONS,
      statuses: FILM_STATUSES,
      summary: {
        open: open.length,
        inProduction: projects.filter((p) => p.status === 'production').length,
        changes: projects.filter((p) => p.status === 'changes').length,
        collecting: projects.filter((p) => p.status === 'collecting').length,
        revenueCents: projects.filter((p) => p.paid_at).reduce((s, p) => s + Number(p.amount_cents || 0), 0),
        keepsakesOpen: keepsakes.filter((k) => k.status !== 'delivered').length,
      },
    }, 200, corsHeaders);
  }

  // Every paid keepsake order, newest first, each as its own line in admin's Folder to Film tab.
  async function adminKeepsakes(env, origin) {
    let rows = [];
    try {
      rows = (await env.DB.prepare(
        `SELECT o.*, p.project_name, p.customer_name, p.customer_email, p.token, p.status AS film_status, p.audiobook_key, p.audiobook_uploaded_at
         FROM film_keepsake_orders o JOIN film_projects p ON p.id = o.project_id
         WHERE o.status != 'pending' ORDER BY CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END, o.id DESC LIMIT 300`
      ).all()).results || [];
    } catch { return []; }
    const out = [];
    for (const o of rows) {
      const row = { id: o.project_id, customer_email: o.customer_email, customer_name: o.customer_name };
      const who = await orderPerson(env, row, o);
      let recipients = [];
      try { recipients = JSON.parse(o.recipients || '[]') || []; } catch {}
      out.push({
        id: o.id, film_id: o.project_id, film_name: o.project_name || '', film_status: o.film_status, item: o.item,
        item_label: FILM_KEEPSAKES[o.item]?.name || o.item, qty: o.qty, amount_cents: o.amount_cents, tax_cents: o.tax_cents,
        paid_at: o.paid_at, status: o.status, status_label: KEEPSAKE_STATUSES[o.status] || o.status, status_at: o.status_at,
        tracking: o.tracking || '', staff_notes: o.staff_notes || '', shipped_at: o.shipped_at, delivered_at: o.delivered_at,
        ship_to: o.ship_to || '', recipients, ordered_by_email: who.email, ordered_by_name: who.name, ordered_by_buyer: who.buyer,
        ordered_by_role: who.role, has_audiobook: !!o.audiobook_key, audiobook_uploaded_at: o.audiobook_uploaded_at || '',
        audiobook_listen: o.item === 'audiobook' && o.audiobook_key && linkSecret(env) ? await signedWatch(env, origin, o.project_id, 'audiobook') : '',
        listen_url: o.listen_token ? listenUrl(o.listen_token) : '', link_uses_left: o.download_uses_left ?? null,
      });
    }
    return out;
  }

  // POST /api/film/keepsake/update {orderId, status?, tracking?, notes?}  (admin)
  async function handleKeepsakeUpdate(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    const o = await env.DB.prepare(`SELECT * FROM film_keepsake_orders WHERE id = ?1 AND status != 'pending'`).bind(Number(d?.orderId || 0)).first();
    if (!o) return json({ ok: false, error: 'Keepsake order not found' }, 404, corsHeaders);
    const allowed = KEEPSAKE_ITEM_STATUSES[o.item] || Object.keys(KEEPSAKE_STATUSES);
    const status = d.status === undefined ? o.status : clip(d.status, 20);
    if (!allowed.includes(status)) return json({ ok: false, error: 'That status doesn\'t fit this keepsake.' }, 400, corsHeaders);
    await env.DB.prepare(
      `UPDATE film_keepsake_orders SET status = ?1, tracking = ?2, staff_notes = ?3,
         status_at = CASE WHEN status != ?1 THEN datetime('now') ELSE status_at END,
         shipped_at = CASE WHEN ?1 = 'shipped' AND shipped_at IS NULL THEN datetime('now') ELSE shipped_at END,
         delivered_at = CASE WHEN ?1 = 'delivered' AND delivered_at IS NULL THEN datetime('now') ELSE delivered_at END
       WHERE id = ?4`
    ).bind(status, d.tracking === undefined ? o.tracking : (clip(d.tracking, 300) || null), d.notes === undefined ? o.staff_notes : (clip(d.notes, 4000) || null), o.id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // The keepsake emails staff send from an order's line: the audiobook's download link, or a book's tracking.
  const LISTEN_PLACEHOLDER = '(your private listening link goes here when you send)';
  async function keepsakeDraft(env, row, o, kind, origin) {
    const who = await orderPerson(env, row, o);
    const first = clip(who.name, 80).split(/\s+/)[0];
    const hi = first && !first.includes('@') ? `Hi ${first},` : 'Hi,';
    const film = row.project_name ? `"${row.project_name}"` : 'your film';
    const page = who.dashboard ? `${dashboardUrl(row.token)}#audiobook-card` : `${keepsakesUrl(row.token)}#audiobook`;
    if (kind === 'audiobook') {
      return {
        to: who.email, who, link: LISTEN_PLACEHOLDER, button: 'Listen to the audiobook', heading: 'Your audiobook is ready',
        subject: `Your audiobook is ready: ${row.project_name || 'your story'}`,
        lines: [hi, '', `The audiobook of ${film} is ready. It's made for listening: the film's narration plus new narration for everything the film shows on screen, so the whole story works by ear.`, '',
          LISTEN_PLACEHOLDER, '',
          'Tap the button to listen on your phone or computer, with no app to install. It remembers where you stopped, and it keeps playing with the screen off.', '',
          `On that page you can also add it to Apple Podcasts (or another podcast app) to listen offline and in the car, or download the MP3 (up to ${AUDIOBOOK_DOWNLOADS} times).`, '',
          "The link is private: anyone who has it can listen, so share it only with people you'd like to have it.", '', 'Chris'],
      };
    }
    const track = clip(o.tracking, 300);
    const trackUrl = /^https?:\/\//i.test(track) ? track : '';
    const label = `${FILM_KEEPSAKES[o.item]?.name || 'book'}${Number(o.qty) > 1 ? ` (${o.qty} copies)` : ''}`;
    let recipients = [];
    try { recipients = JSON.parse(o.recipients || '[]') || []; } catch {}
    return {
      to: who.email, who, link: trackUrl || page, button: trackUrl ? 'Track the package' : (who.dashboard ? 'Open my dashboard' : 'See my keepsakes'),
      heading: 'Your book is on its way', subject: `Your book is on its way: ${row.project_name || 'your story'}`,
      lines: [hi, '', `Good news: your ${label} for ${film} has shipped.`, '',
        ...(recipients.length ? [`Going to: ${recipients.map((r) => r.name).join(', ')}.`, ''] : (o.ship_to ? [`Shipping to: ${o.ship_to}`, ''] : [])),
        ...(trackUrl ? [trackUrl, ''] : track ? [`Tracking: ${track}`, ''] : []),
        'If anything arrives damaged or misprinted, reply to this email with a photo within 30 days and we\'ll replace it free.', '', 'Chris'],
    };
  }

  // ---------- the audiobook's private listening page (listen.html?l=TOKEN) ----------
  function plainPage(title, text, status) {
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>`
      + `<body style="font-family:Georgia,serif;background:#12100D;color:#F4EDE0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px;"><div style="max-width:520px;">`
      + `<h1 style="font-weight:600;font-size:30px;margin:0 0 12px;">${escapeHtml(title)}</h1><p style="color:#C9BFA9;font-size:18px;line-height:1.5;margin:0;">${text}</p></div></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  // The order behind a listening link: delivered audiobooks only, with the MP3 still there and the film not canceled.
  async function listenGuard(env, url) {
    const token = clip(url.searchParams.get('l'), 128);
    if (!/^[0-9a-f]{48,128}$/.test(token) || !env.FILMS) return null;
    const o = await env.DB.prepare(`SELECT * FROM film_keepsake_orders WHERE listen_token = ?1 AND item = 'audiobook'`).bind(token).first();
    if (!o || o.status !== 'delivered') return null;
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(o.project_id).first();
    if (!row || !row.audiobook_key || row.status === 'canceled') return null;
    return { o, row, token };
  }
  const NOT_AVAILABLE = 'This listening link isn\'t available. Please use the link in your audiobook email, or reply to that email and we\'ll help.';

  // GET /api/film/listen?l=  -> what listen.html needs
  async function handleListenInfo(request, env, corsHeaders, url) {
    const g = await listenGuard(env, url);
    if (!g) return json({ ok: false, error: NOT_AVAILABLE }, 404, corsHeaders);
    const base = new URL(request.url).origin;
    const q = `l=${g.token}`;
    const feed = `${base}/api/film/listen/feed.xml?${q}`;
    return json({
      ok: true, title: g.row.project_name || 'Our Story', cover: AUDIOBOOK_COVER,
      src: `${base}/api/film/listen/audio.mp3?${q}`, downloadUrl: `${base}/api/film/listen/download?${q}`,
      downloadsLeft: Math.max(0, Number(g.o.download_uses_left ?? 0)), downloadsAllowed: AUDIOBOOK_DOWNLOADS,
      feedUrl: feed, applePodcastsUrl: feed.replace(/^https?:/, 'podcast:'),
    }, 200, corsHeaders);
  }

  // GET /api/film/listen/audio.mp3?l=  (players and podcast apps; not counted)
  // GET /api/film/listen/download?l=   (a download; counted when it starts from the beginning)
  async function handleListenAudio(request, env, corsHeaders, url, download = false) {
    const g = await listenGuard(env, url);
    if (!g) return plainPage('Link not available', escapeHtml(NOT_AVAILABLE), 404);
    if (download) {
      const range = request.headers.get('Range') || '';
      if (!range || /^bytes=0-/.test(range)) {
        const took = await env.DB.prepare(`UPDATE film_keepsake_orders SET download_uses_left = download_uses_left - 1 WHERE id = ?1 AND download_uses_left > 0`).bind(g.o.id).run();
        if (!Number(took.meta?.changes || 0)) {
          return plainPage('No downloads left', `You've downloaded this audiobook ${AUDIOBOOK_DOWNLOADS} times. You can still listen any time on <a style="color:#E3C58E;" href="${escapeHtml(listenUrl(g.token))}">your listening page</a>, or reply to your audiobook email and we'll reset the downloads.`, 410);
        }
      }
    }
    return streamDeliverable(env, request, g.row, 'audiobook', g.row.audiobook_key, download);
  }

  // GET /api/film/listen/feed.xml?l=  A private podcast feed (Apple Podcasts "Follow a Show by URL",
  // Pocket Casts and other apps) with the audiobook as one episode; marked not to be listed anywhere.
  async function handleListenFeed(request, env, corsHeaders, url) {
    const g = await listenGuard(env, url);
    if (!g) return new Response('Not found.', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
    const head = await env.FILMS.head(g.row.audiobook_key);
    const x = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const title = g.row.project_name || 'Our Story';
    const base = new URL(request.url).origin;
    const audio = `${base}/api/film/listen/audio.mp3?l=${g.token}`;
    const ext = (g.row.audiobook_key.split('.').pop() || 'mp3').toLowerCase();
    const when = g.o.delivered_at || g.row.audiobook_uploaded_at || g.o.paid_at;
    const pub = new Date(when ? Date.parse(`${String(when).replace(' ', 'T')}Z`) : Date.now()).toUTCString();
    const about = `The audiobook of ${title}: the film's narration plus new narration for everything the film shows on screen. Made privately for this family with Folder to Film by Eastern Shore AI. Please don't share this feed's link.`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title>${x(title)} (Audiobook)</title>
<link>${x(listenUrl(g.token))}</link>
<language>en-us</language>
<description>${x(about)}</description>
<itunes:summary>${x(about)}</itunes:summary>
<itunes:author>Folder to Film</itunes:author>
<itunes:image href="${x(AUDIOBOOK_COVER)}"/>
<image><url>${x(AUDIOBOOK_COVER)}</url><title>${x(title)} (Audiobook)</title><link>${x(listenUrl(g.token))}</link></image>
<itunes:explicit>false</itunes:explicit>
<itunes:block>Yes</itunes:block>
<itunes:type>episodic</itunes:type>
<item>
<title>${x(title)}: the audiobook</title>
<description>${x(about)}</description>
<enclosure url="${x(audio)}" length="${Number(head?.size || 0)}" type="${ext === 'mp3' ? 'audio/mpeg' : 'audio/x-m4a'}"/>
<guid isPermaLink="false">folder-to-film-audiobook-${g.o.id}-${x(g.row.audiobook_key.split('/').pop())}</guid>
<pubDate>${x(pub)}</pubDate>
<itunes:explicit>false</itunes:explicit>
</item>
</channel>
</rss>`;
    return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' } });
  }

  // GET /api/film/project?id=
  async function handleAdminDetail(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(url.searchParams.get('id') || 0)).first();
    if (!row) return json({ ok: false, error: 'Project not found' }, 404, corsHeaders);
    const uploads = await uploadsFor(env.DB, row.id, { all: true });
    const emails = (await env.DB.prepare(`SELECT kind, subject, to_email, sent_at FROM film_emails WHERE project_id = ?1 ORDER BY id DESC`).bind(row.id).all()).results || [];
    const chat = await chatMessages(env, row.id, { limit: 500 });
    const people = row.customer_email ? await peopleFor(env, row) : [];
    const keepsakes = (await keepsakeOrders(env, row.id)).map((o) => ({ ...o, by: orderedByName(o, row, people), byBuyer: orderedBy(o, row) === normEmail(row.customer_email) }));
    const devices = (await env.DB.prepare(`SELECT email, COUNT(*) AS n, MAX(last_seen_at) AS seen FROM film_devices WHERE project_id = ?1 AND expires_at > datetime('now') GROUP BY email`).bind(row.id).all()).results || [];
    return json({ ok: true, project: adminView(row), uploads, emails, chat, people, devices, keepsakes, questions: FILM_QUESTIONS }, 200, corsHeaders);
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
    if (['audiobook', 'shipped'].includes(d.kind)) return handleKeepsakeEmail(request, env, corsHeaders, row, d);
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

  // Admin's Deliver Audiobook / Email Shipped, from the order's own line (preview, then send).
  async function handleKeepsakeEmail(request, env, corsHeaders, row, d) {
    const o = await env.DB.prepare(`SELECT * FROM film_keepsake_orders WHERE id = ?1 AND project_id = ?2 AND status != 'pending'`).bind(Number(d.orderId || 0), row.id).first();
    if (!o) return json({ ok: false, error: 'Keepsake order not found' }, 404, corsHeaders);
    const kind = d.kind;
    if (kind === 'audiobook' && o.item !== 'audiobook') return json({ ok: false, error: 'That order isn\'t an audiobook.' }, 400, corsHeaders);
    if (kind === 'audiobook' && !row.audiobook_key) return json({ ok: false, error: 'Upload the audiobook MP3 on this line first.' }, 400, corsHeaders);
    if (kind === 'shipped' && o.item === 'audiobook') return json({ ok: false, error: 'An audiobook doesn\'t ship.' }, 400, corsHeaders);
    const draft = await keepsakeDraft(env, row, o, kind, new URL(request.url).origin);
    const subject = clip(d.subject, 200) || draft.subject;
    let body = typeof d.body === 'string' && d.body.trim() ? d.body.replace(/\r\n/g, '\n').slice(0, 8000) : draft.lines.join('\n');
    if (kind === 'audiobook' && !body.includes(LISTEN_PLACEHOLDER)) return json({ ok: false, error: `Keep the line "${LISTEN_PLACEHOLDER}" in the email: that's where the listening link goes.` }, 400, corsHeaders);
    const render = (text, link) => {
      const lines = text.split('\n').map((l) => l.trimEnd());
      return shell(linesHtml(lines, link, draft.button), { heading: draft.heading, preheader: lines.find((l) => l && !l.startsWith('Hi')) || '', link });
    };
    if (d.preview) return json({ ok: true, preview: true, to: draft.to, subject, body, html: render(body, draft.link), link: draft.link }, 200, corsHeaders);
    if (!d.send) return json({ ok: true }, 200, corsHeaders);
    let link = draft.link;
    if (kind === 'audiobook') {
      // The listening link is made once and kept (a podcast app following its feed keeps working);
      // each delivery resets the downloads.
      const token = o.listen_token || generateToken() + generateToken();
      link = listenUrl(token);
      body = body.split(LISTEN_PLACEHOLDER).join(link);
      await env.DB.prepare(`UPDATE film_keepsake_orders SET listen_token = ?1, download_uses_left = ?2 WHERE id = ?3`).bind(token, AUDIOBOOK_DOWNLOADS, o.id).run();
    }
    try {
      await sendCustomerEmail(env, row, { kind: `keepsake_${kind}`, to: draft.to, subject, text: body, html: render(body, link) });
    } catch (e) {
      return json({ ok: false, error: e.message || 'Email failed' }, 502, corsHeaders);
    }
    const next = kind === 'audiobook' ? 'delivered' : 'shipped';
    await env.DB.prepare(
      `UPDATE film_keepsake_orders SET status = CASE WHEN status = 'delivered' THEN status ELSE ?1 END, status_at = datetime('now'),
         shipped_at = CASE WHEN ?1 = 'shipped' AND shipped_at IS NULL THEN datetime('now') ELSE shipped_at END,
         delivered_at = CASE WHEN ?1 = 'delivered' AND delivered_at IS NULL THEN datetime('now') ELSE delivered_at END WHERE id = ?2`
    ).bind(next, o.id).run();
    return json({ ok: true, emailed: true, to: draft.to }, 200, corsHeaders);
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
    const inline = url.searchParams.get('inline') === '1' && /^image\/(jpeg|png|webp|gif)$/i.test(up.content_type || '');
    return new Response(obj.body, {
      headers: {
        'Content-Type': up.content_type || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(up.filename)}`,
        'Cache-Control': inline ? 'private, max-age=3600' : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(obj.size != null ? { 'Content-Length': String(obj.size) } : {}),
      },
    });
  }

  // GET /api/film/keepsake-photos?t=  -> a few of the customer's own photos, as signed links to show
  // on their keepsakes page (my-keepsakes.html). Spread across what they uploaded; browser-viewable
  // types only; skips tiny files (icons, screenshots of buttons) and very large ones.
  async function handleKeepsakePhotos(request, env, corsHeaders, url) {
    const a = await access(env, request, corsHeaders, url.searchParams.get('t'), 'keepsakes');
    if (a.res) return a.res;
    const bad = chatGuard(a.row, corsHeaders);
    if (bad) return bad;
    const secret = linkSecret(env);
    if (!secret) return json({ ok: true, photos: [] }, 200, corsHeaders);
    const rows = ((await env.DB.prepare(
      `SELECT id, filename, content_type, size_bytes FROM film_uploads WHERE project_id = ?1 AND status = 'done' AND size_bytes BETWEEN 40000 AND 15000000 ORDER BY id`
    ).bind(a.row.id).all()).results || []).filter((r) => /^image\/(jpeg|png|webp|gif)$/i.test(r.content_type || ''));
    const want = 8;
    const picked = rows.length <= want ? rows : Array.from({ length: want }, (_, i) => rows[Math.floor(i * rows.length / want)]);
    const exp = Math.floor(Date.now() / 1000) + 2 * 3600;
    const base = new URL(request.url).origin;
    const photos = await Promise.all(picked.map(async (r) => ({
      name: r.filename,
      url: `${base}/api/film/file?f=${r.id}&e=${exp}&s=${await hmacHex(secret, `film-file:${r.id}:${exp}`)}&inline=1`,
    })));
    return json({ ok: true, photos }, 200, corsHeaders);
  }

  // Ask K on the dashboard: a signed-in customer (film link + trusted browser) skips the bot check,
  // and Ask K is told where their film stands so it can answer process questions about it.
  async function askKDashboardContext(env, request, corsHeaders, token) {
    const a = await access(env, request, corsHeaders, token);
    if (a.res) return { res: a.res };
    const row = a.row;
    if (row.status === 'pending_payment') return { res: json({ ok: false, error: 'Payment is still confirming.' }, 409, corsHeaders) };
    const uploads = await uploadsFor(env.DB, row.id);
    const v = customerView(row, uploads);
    const answered = Object.keys(v.answers || {}).length;
    const facts = [
      `Project name: ${v.projectName || '(not named yet)'}.`,
      `Status: ${v.statusLabel}.`,
      row.status === 'collecting' ? `They have uploaded ${uploads.length} file${uploads.length === 1 ? '' : 's'} and answered ${answered} of ${FILM_QUESTIONS.length} questions, and have not pressed Start production yet.` : '',
      v.demoDueText ? `Demo due by ${v.demoDueText}.` : '',
      v.estimatedDoneText ? `Estimated completion: ${v.estimatedDoneText}.` : '',
      ['demo_ready', 'changes', 'final_ready', 'delivered'].includes(row.status) ? `Rounds of changes used: ${v.changeRounds} of ${v.roundsIncluded}.` : '',
      v.neededBy ? `They need it by ${v.neededBy}.` : '',
      a.person.isStaff ? 'The person asking is Eastern Shore AI staff using the staff view.' : (a.person.isOwner ? 'The person asking is the buyer.'
        : `The person asking is someone the buyer added to the dashboard, with "${FILM_ROLES[roleOf(a.person.role)].label}" access${a.person.role === 'editor' ? '' : " (they can't change the details or answers)"}; only the buyer can press Start production, approve the demo or ask for changes, and add people.`),
    ].filter(Boolean).join(' ');
    return { row, person: a.person, facts, conversationKey: `film-dash:${row.id}` };
  }

  // POST /api/film/email-samples (admin): sends the main customer emails, filled in with made-up
  // details, to TO_EMAIL, to see how they look (admin's "Email me samples" button).
  async function handleEmailSamples(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const to = clip(env.TO_EMAIL, 200);
    const from = env.CONTACT_FROM_EMAIL || env.FROM_EMAIL;
    if (!to || !from || !emailConfigured(env)) return json({ ok: false, error: 'Email is not set up (TO_EMAIL / sender).' }, 500, corsHeaders);
    const due = addBusinessDays(easternDate(), DEMO_BUSINESS_DAYS);
    const row = { id: 0, token: 'sample-not-a-real-dashboard-link-000000000', status: 'production', project_name: 'Christian Believers Fellowship: Our Story',
      customer_name: 'Pat Sample', customer_email: to, demo_due_date: due, estimated_done_date: addBusinessDays(due, 2), change_rounds: 0 };
    const emails = [];
    for (const kind of ['welcome', 'production', 'demo']) {
      const d = await sendDraft(env, row, kind);
      emails.push({ subject: d.subject, text: d.body, html: d.html });
    }
    emails.push(chatReplyEmail(row, "Thanks for sending the old chapel scans! Do you know roughly what year the snow photos were taken? I'd like to place them in the right part of the story.", STAFF_NAME));
    const sent = [];
    for (const e of emails) {
      const res = await deliverEmail(env, { from, to: [to], subject: `[Sample] ${e.subject}`, html: e.html, text: e.text, reply_to: 'contact@easternshore.ai' });
      if (res.ok) sent.push(e.subject);
    }
    return json({ ok: sent.length === emails.length, sent, to }, sent.length ? 200 : 502, corsHeaders);
  }

  // ---------- keepsakes: pay on the keepsakes page ----------

  const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
  // Family copies: one U.S. address per copy, checked before checkout.
  function cleanRecipients(list, qty) {
    if (!Array.isArray(list) || list.length !== qty) return { error: `Please add an address for each of the ${qty} cop${qty === 1 ? 'y' : 'ies'}.` };
    const out = [];
    for (const [i, r] of list.entries()) {
      const one = { name: clip(r?.name, 80), line1: clip(r?.line1, 120), line2: clip(r?.line2, 80), city: clip(r?.city, 60),
        state: clip(r?.state, 2).toUpperCase(), zip: clip(r?.zip, 10) };
      if (!one.name || !one.line1 || !one.city) return { error: `Copy ${i + 1}: please add the name, street and city.` };
      if (!US_STATES.has(one.state)) return { error: `Copy ${i + 1}: books ship to U.S. addresses only. Please pick a state.` };
      if (!/^\d{5}(-\d{4})?$/.test(one.zip)) return { error: `Copy ${i + 1}: please check the ZIP code.` };
      out.push(one);
    }
    return { recipients: out };
  }
  const addressLine = (r) => [r.name, r.line1, r.line2, `${r.city}, ${r.state} ${r.zip}`].filter(Boolean).join(', ');
  // The first hardcover includes designing the book; copies are reprints, so they need it first.
  const hasBook = (orders) => orders.some((o) => o.item === 'book' && o.status !== 'pending');
  // Where each keepsake order stands (admin sets it on the order's own line; the emails set delivered/shipped).
  const KEEPSAKE_STATUSES = {
    paid: 'Paid, not started', in_progress: 'In progress', proof_sent: 'Proof sent', approved: 'Proof approved',
    printing: 'Printing at Lulu', shipped: 'Shipped', delivered: 'Delivered',
  };
  const KEEPSAKE_ITEM_STATUSES = {
    book: ['paid', 'in_progress', 'proof_sent', 'approved', 'printing', 'shipped', 'delivered'],
    copies: ['paid', 'printing', 'shipped', 'delivered'],
    audiobook: ['paid', 'in_progress', 'delivered'],
  };
  // The audiobook's private listening page (listen.html?l=TOKEN): streaming isn't counted; downloads are.
  const AUDIOBOOK_DOWNLOADS = 5;
  const listenUrl = (token) => `${SITE}/listen.html?l=${token}`;
  const AUDIOBOOK_COVER = `${SITE}/images/story-video/audiobook-cover.jpg`;
  // Who can play and download the audiobook once it's delivered: everyone on the dashboard when the buyer
  // (or anyone with dashboard access) ordered it; a keepsakes-only relative only for their own order.
  function audiobookAccess(row, person, orders, people) {
    if (!row.audiobook_key || !person) return false;
    if (person.isStaff) return true;
    const done = orders.filter((o) => o.item === 'audiobook' && o.status === 'delivered');
    if (!done.length) return false;
    if (can(person, 'view')) {
      return done.some((o) => {
        const by = orderedBy(o, row);
        if (by === normEmail(row.customer_email) || by === STAFF_ID) return true;
        const p = people.find((x) => x.email === by);
        return !!(p && p.role !== 'keepsakes');
      });
    }
    return done.some((o) => orderIsMine(o, row, person));
  }
  // The viewer's own delivered audiobook's listening page, for the dashboard card and the keepsakes page.
  function myListen(row, person, orders) {
    const o = row.audiobook_key ? orders.find((x) => x.item === 'audiobook' && x.status === 'delivered' && x.listen_token && orderIsMine(x, row, person)) : null;
    return o ? { audiobookListenUrl: listenUrl(o.listen_token) } : {};
  }
  // The person behind an order, for emails: their email, first name, and whether they can open the dashboard.
  async function orderPerson(env, row, o) {
    const by = orderedBy(o, row);
    const buyer = by === normEmail(row.customer_email) || by === STAFF_ID;
    const person = buyer ? null : await personFor(env, row, by);
    const email = buyer ? normEmail(row.customer_email) : by;
    const name = buyer ? (row.customer_name || '') : (person?.name || '');
    return { email, name, buyer, dashboard: buyer || can(person, 'view'), role: person?.role || '' };
  }
  const orderedBy = (o, row) => normEmail(o.ordered_by) || normEmail(row.customer_email);   // older orders: the buyer
  const orderIsMine = (o, row, person) => orderedBy(o, row) === (person.isStaff ? STAFF_ID : person.email);
  function orderedByName(o, row, people) {
    const by = orderedBy(o, row);
    if (by === STAFF_ID) return STAFF_NAME;
    const p = people.find((x) => x.email === by);
    return p ? (p.name || p.email) : by;
  }

  // POST /api/film/keepsake-checkout {t, item, qty, recipients?} -> { checkoutUrl }
  async function handleKeepsakeCheckout(request, env, corsHeaders, originAllowed, allowedOrigins) {
    if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: 'Stripe not configured' }, 500, corsHeaders);
    const d = (await readJson(request)) || {};
    const a = await access(env, request, corsHeaders, d.t, 'keepsakes');
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    const key = clip(d.item, 20);
    const item = Object.prototype.hasOwnProperty.call(FILM_KEEPSAKES, key) ? FILM_KEEPSAKES[key] : null;
    if (!item) return json({ ok: false, error: 'Unknown keepsake' }, 400, corsHeaders);
    const qty = Math.max(1, Math.min(item.maxQty, Math.round(Number(d.qty || 1)) || 1));
    const booked = hasBook(await keepsakeOrders(env, row.id));
    if (key === 'book' && booked) return json({ ok: false, bookOrdered: true, error: `The hardcover book is already ordered, so you can get a copy for ${formatUsd(FILM_KEEPSAKES.copies.cents)} instead.` }, 409, corsHeaders);
    if (key === 'copies' && !booked) return json({ ok: false, bookOrdered: false, error: 'Copies are reprints of the hardcover book, so the book has to be ordered first.' }, 409, corsHeaders);
    // Copies: one copy can use Stripe's shipping address; two or more need an address each, entered first.
    let recipients = null;
    if (key === 'copies' && (qty > 1 || (Array.isArray(d.recipients) && d.recipients.length))) {
      const c = cleanRecipients(d.recipients, qty);
      if (c.error) return json({ ok: false, error: c.error }, 400, corsHeaders);
      recipients = c.recipients;
    }
    const stripeShips = item.ship || (key === 'copies' && !recipients);
    const canChat = can(a.person, 'chat');
    const by = a.person.isStaff ? STAFF_ID : a.person.email;
    const origin = (originAllowed && request.headers.get('Origin')) || allowedOrigins[0] || SITE;
    const back = `${origin}/my-keepsakes.html?t=${encodeURIComponent(row.token)}`;
    const film = clip(row.project_name, 80) || 'your film';
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: `${back}&paid=${encodeURIComponent(key)}`,
      cancel_url: back,
      billing_address_collection: 'required',
      allow_promotion_codes: 'true',
      'automatic_tax[enabled]': 'true',
      'line_items[0][quantity]': String(qty),
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(item.cents),
      'line_items[0][price_data][product_data][name]': `${item.name}: ${film}`,
      'line_items[0][price_data][product_data][description]': item.desc,
      'line_items[0][price_data][product_data][tax_code]': item.taxCode,
      'metadata[checkout_type]': 'film_keepsake',
      'metadata[film_project_id]': String(row.id),
      'metadata[keepsake]': key,
      'metadata[qty]': String(qty),
      'metadata[ordered_by]': by,
      'metadata[terms_version]': FILM_TERMS_VERSION,
      'payment_intent_data[metadata][checkout_type]': 'film_keepsake',
      'payment_intent_data[metadata][film_project_id]': String(row.id),
      'custom_text[submit][message]': `${item.ship
        ? (canChat ? "We design it from your film and post a proof in your project chat before it's printed." : "We design it from the film and email you a proof to approve before it's printed.")
        : key === 'copies'
          ? (recipients ? 'We ship a copy to each address you entered, free, once the book is final.' : 'We ship it free to this address once the book is final.')
          : (canChat ? "We'll put the MP3 on your dashboard and let you know in your project chat." : "We'll email you the MP3 when it's ready.")} Keepsakes are made to order, so they can't be refunded; a damaged or misprinted book is replaced free.`,
    });
    if (stripeShips) body.set('shipping_address_collection[allowed_countries][0]', 'US');
    if (!a.person.isStaff && validEmail(a.person.email)) body.set('customer_email', a.person.email);
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) return json({ ok: false, error: 'Checkout could not start. Please try again or ask in your project chat.', detail: data?.error?.message || '' }, 502, corsHeaders);
    // Saved as pending (with the addresses for copies); the webhook marks it paid, an expired checkout deletes it.
    await env.DB.prepare(`INSERT OR IGNORE INTO film_keepsake_orders (project_id, item, qty, stripe_session_id, recipients, ordered_by, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending')`)
      .bind(row.id, key, qty, clip(data.id, 120), recipients ? JSON.stringify(recipients) : null, by).run();
    return json({ ok: true, checkoutUrl: data.url, id: data.id }, 200, corsHeaders);
  }

  function shipToText(session) {
    const sd = session.collected_information?.shipping_details || session.shipping_details || null;
    const ad = sd?.address;
    if (!ad) return '';
    return [sd.name, ad.line1, ad.line2, [ad.city, ad.state, ad.postal_code].filter(Boolean).join(' '), ad.country].filter(Boolean).join(', ');
  }

  // checkout.session.completed with metadata.checkout_type = film_keepsake
  async function handleKeepsakePaid(env, event, incomeDate) {
    const session = event.data?.object || {};
    const id = Number(session.metadata?.film_project_id || 0);
    const key = clip(session.metadata?.keepsake, 20);
    const item = Object.prototype.hasOwnProperty.call(FILM_KEEPSAKES, key) ? FILM_KEEPSAKES[key] : null;
    const row = id ? await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(id).first() : null;
    if (!row || !item) return { ok: false, error: 'Keepsake order not recognized' };
    if (session.payment_status && session.payment_status !== 'paid') return { ok: true, waiting: session.payment_status };
    const qty = Math.max(1, Math.round(Number(session.metadata?.qty || 1)) || 1);
    const sid = clip(session.id, 120);
    const amount = Math.round(Number(session.amount_total || 0));
    const tax = Math.round(Number(session.total_details?.amount_tax || 0));
    const state = clip(session.customer_details?.address?.state, 8).toUpperCase();
    const pi = clip(session.payment_intent?.id || session.payment_intent, 80);
    const shipTo = shipToText(session);
    let claimed = await env.DB.prepare(
      `UPDATE film_keepsake_orders SET status = 'paid', amount_cents = ?1, tax_cents = ?2, ship_to = COALESCE(?3, ship_to), paid_at = datetime('now')
       WHERE stripe_session_id = ?4 AND status = 'pending'`
    ).bind(amount, tax, shipTo || null, sid).run();
    if (!Number(claimed.meta?.changes || 0)) {
      claimed = await env.DB.prepare(
        `INSERT OR IGNORE INTO film_keepsake_orders (project_id, item, qty, amount_cents, tax_cents, stripe_session_id, ship_to, ordered_by, status, paid_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'paid', datetime('now'))`
      ).bind(row.id, key, qty, amount, tax, sid, shipTo || null, normEmail(session.metadata?.ordered_by) || null).run();
      if (!Number(claimed.meta?.changes || 0)) return { ok: true, duplicate: true };
    }
    const order = await env.DB.prepare(`SELECT * FROM film_keepsake_orders WHERE stripe_session_id = ?1`).bind(sid).first();
    let recipients = [];
    try { recipients = JSON.parse(order?.recipients || '[]') || []; } catch {}
    const label = `${item.name}${qty > 1 ? ` x ${qty}` : ''}`;
    // Who ordered: the buyer (or staff), or someone the buyer added (their receipt and updates go to them).
    const byEmail = orderedBy(order || {}, row);
    const byBuyer = byEmail === normEmail(row.customer_email) || byEmail === STAFF_ID;
    const person = byBuyer ? null : await personFor(env, row, byEmail);
    const canChat = byBuyer || can(person, 'chat');
    const byName = byBuyer ? (row.customer_name || row.customer_email || 'customer') : (person?.name || clip(session.customer_details?.name, 80) || byEmail);

    // Books: income (session total) and the Stripe fee, deduped by session id like the film itself.
    const existing = await env.DB.prepare(`SELECT id FROM tax_income WHERE stripe_session_id = ?1 LIMIT 1`).bind(sid).first();
    if (!existing?.id && amount > 0) {
      const source = 'Stripe - Folder to Film';
      const category = 'Folder to Film Keepsakes';
      const notes = `${label} | Folder to Film #${row.id} | ${byName}${byBuyer ? '' : ` (added by ${row.customer_name || row.customer_email})`}${tax ? ` | includes ${formatUsd(tax)} sales tax (${state || 'state n/a'})` : ''} | session_id=${sid}`;
      const insIncome = await env.DB.prepare(
        `INSERT INTO tax_income (income_date, source, category, amount_cents, stripe_session_id, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(incomeDate, source, category, amount, sid, notes).run();
      const incomeId = Number(insIncome.meta?.last_row_id || 0) || null;
      if (incomeId) await upsertTaxIncomeJournal(env.DB, { id: incomeId, income_date: incomeDate, source, category, amount_cents: amount, notes });
    }
    try {
      const { cents: feeCents, estimated } = await stripeFee(env.STRIPE_SECRET_KEY, pi, amount);
      if (feeCents > 0) {
        const base = `Auto Stripe fee for Folder to Film keepsake session ${sid}`;
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
    } catch (e) { console.error('Keepsake fee booking failed', e); }

    // Next steps: in the project chat for people who have it, by email for keepsakes-only invitations.
    const changeAddr = canChat ? 'Tell us here.' : 'Just reply to this email.';
    const next = item.ship
      ? (canChat
        ? `Thank you for ordering the ${label}! We'll design it from your film and post a proof here for you to approve before it's printed. It ships about 2 to 3 weeks after you approve it.`
        : `Thank you for ordering the ${label}! We'll design it from the film and email you a proof to approve before it's printed. It ships about 2 to 3 weeks after you approve it.`)
      : key === 'copies'
        ? `Thank you for ordering ${qty} cop${qty === 1 ? 'y' : 'ies'} of the book! ${recipients.length ? `We'll ship one free to each address you gave us (${recipients.map((r) => r.name).join(', ')})` : "We'll ship it free to the address you gave at checkout"} once the book is final. Need to change an address? ${changeAddr}`
        : (canChat
          ? `Thank you for ordering the audiobook! We'll record the extra narration and put the MP3 on your dashboard, and let you know here when it's ready.`
          : `Thank you for ordering the audiobook! We'll record the extra narration and email you the MP3 when it's ready.`);
    const chatNote = byBuyer || canChat ? next
      : `${byName} ordered ${key === 'copies' ? `${qty === 1 ? 'a copy' : `${qty} copies`} of the book` : `the ${label}`} from the keepsakes page. We'll keep them posted by email.`;
    try {
      await env.DB.prepare(`INSERT INTO film_messages (project_id, role, sender_name, content, created_at) VALUES (?1, 'staff', ?2, ?3, ?4)`)
        .bind(row.id, STAFF_NAME, byBuyer ? chatNote : (canChat ? `${byName} ordered the ${label}. ${next}` : chatNote), new Date().toISOString()).run();
    } catch (e) { console.error('keepsake chat note', e); }
    try {
      const link = canChat ? `${dashboardUrl(row.token)}#chat` : keepsakesUrl(row.token);
      const first = clip(byBuyer ? row.customer_name : byName, 80).split(/\s+/)[0];
      const hi = first && !first.includes('@') ? `Hi ${first},` : 'Hi,';
      const text = [hi, '', `Thanks for your order: ${label} for ${row.project_name || 'your film'} (${formatUsd(amount)}${tax ? `, including ${formatUsd(tax)} tax` : ''}).`, '', next,
        ...(shipTo ? ['', `Shipping to: ${shipTo}`] : []), ...(recipients.length ? ['', 'Shipping a copy to:', ...recipients.map((r) => `- ${addressLine(r)}`)] : []), '',
        `${canChat ? 'Your project chat' : 'Your keepsakes page'}: ${link}`, '', 'Folder to Film by Eastern Shore AI'].join('\n');
      const html = shell(`<p style="margin:0 0 12px;">${escapeHtml(hi)}</p>`
        + filmDetailsBox([['Keepsake', label], ['Film', row.project_name || ''], ['Paid', formatUsd(amount) + (tax ? ` (includes ${formatUsd(tax)} tax)` : '')], ['Ship to', shipTo]])
        + (recipients.length ? `<p style="margin:0 0 6px;"><b>Shipping a copy to:</b></p><ul style="margin:0 0 14px;padding-left:20px;">${recipients.map((r) => `<li>${escapeHtml(addressLine(r))}</li>`).join('')}</ul>` : '')
        + `<p style="margin:0 0 12px;">${escapeHtml(next)}</p>` + filmButton(link, canChat ? 'Open my project chat' : 'See the keepsakes'),
        { heading: 'Thank you for your order', preheader: `${label}: ${next}` });
      await sendCustomerEmail(env, row, { kind: 'keepsake', subject: `Thank you for your order: ${label}`, text, html,
        ...(byBuyer || !validEmail(byEmail) ? {} : { to: byEmail }) });
    } catch (e) { console.error('keepsake receipt', e); }
    try {
      await sendStaffOperationalAlert(env, {
        from: env.ALERTS_FROM_EMAIL,
        subject: `Keepsake order: ${label} (${row.project_name || `Film #${row.id}`})`,
        text: [`${byBuyer ? byName : `${byName} <${byEmail}> (added by ${row.customer_name || row.customer_email}${person ? `, "${FILM_ROLES[roleOf(person.role)].label}"` : ''})`} bought ${label} for ${formatUsd(amount)}${tax ? ` (includes ${formatUsd(tax)} tax, ${state})` : ''}.`,
          shipTo ? `Ship to: ${shipTo}` : '', ...(recipients.length ? ['Ship a copy to:', ...recipients.map((r) => `- ${addressLine(r)}`)] : []),
          '', `Admin: ${SITE}/admin.html (Folder to Film > Details & Files)`].filter((l) => l !== '').join('\n'),
      });
    } catch (e) { console.error('keepsake staff alert', e); }
    return { ok: true };
  }

  async function keepsakeOrders(env, projectId) {
    try {
      const rows = (await env.DB.prepare(`SELECT id, item, qty, amount_cents, tax_cents, ship_to, recipients, ordered_by, status, paid_at, tracking, staff_notes, status_at, shipped_at, delivered_at, stripe_session_id, listen_token
        FROM film_keepsake_orders WHERE project_id = ?1 AND status != 'pending' ORDER BY id`).bind(projectId).all()).results || [];
      return rows.map((o) => { let r = []; try { r = JSON.parse(o.recipients || '[]') || []; } catch {} return { ...o, recipients: r }; });
    } catch { return []; }
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
    for (const k of [row.demo_key, row.final_key, row.audiobook_key]) { if (k && env.FILMS) { try { await env.FILMS.delete(k); } catch {} } }
    for (const table of ['film_emails', 'film_people', 'film_devices', 'film_codes', 'film_messages', 'film_typing', 'film_keepsake_orders']) {
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
      ...blocks.map((b) => filmDetailsBox([['Film', b.name], ['Status', b.status]]) + `<p style="margin:10px 0 0;">${escapeHtml(b.sentence)}</p>` + filmButton(b.link, 'Open my dashboard')),
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
  // The project chat has its own tables (film_messages, film_typing); it is not the
  // Survival Node support chat and never shows in support-chat.html. A customer
  // message emails staff; staff reply from admin (POST /api/film/chat/reply) or the
  // staff view of the dashboard, and the customer gets an email if they're away.

  const STAFF_BURST_MIN = 3;        // more customer messages this soon after an alert, before any reply: no second email
  const STAFF_SEEN_SEC = 120;       // staff has the chat open in the staff view: no email
  const REPLY_EMAIL_GAP_MIN = 20;   // at most one "Chris replied" email to the customer per 20 minutes
  const SEEN_WINDOW_SEC = 90;       // the customer is on the dashboard: no email needed
  const ms = (v) => {
    if (!v) return 0;
    const t = String(v);
    return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`) || 0;
  };
  const ago = (v) => (v ? Date.now() - ms(v) : Infinity);

  function chatGuard(row, corsHeaders) {
    if (!row) return json({ ok: false, error: 'Film not found' }, 404, corsHeaders);
    if (row.status === 'pending_payment') return json({ ok: false, error: 'Payment is still confirming.' }, 409, corsHeaders);
    if (row.status === 'canceled') return json({ ok: false, error: 'This film was canceled.' }, 409, corsHeaders);
    return null;
  }

  async function chatMessages(env, projectId, { after = 0, limit = 200 } = {}) {
    return (await env.DB.prepare(
      `SELECT id, role, content, sender_name, created_at FROM film_messages WHERE project_id = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3`
    ).bind(projectId, after, limit).all()).results || [];
  }

  // GET /api/film/chat?t=&after=
  async function handleChatGet(request, env, corsHeaders, url) {
    const a = await access(env, request, corsHeaders, url.searchParams.get('t'), 'chat');
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    await env.DB.prepare(`UPDATE film_projects SET ${a.person.isStaff ? 'staff_seen_at' : 'customer_seen_at'} = datetime('now') WHERE id = ?1`).bind(row.id).run();
    const after = Math.max(0, Math.round(Number(url.searchParams.get('after') || 0)));
    const msgs = await chatMessages(env, row.id, { after });
    const since = new Date(Date.now() - 5000).toISOString();
    const typing = await env.DB.prepare(`SELECT sender_name FROM film_typing WHERE project_id = ?1 AND role = ?2 AND updated_at > ?3`)
      .bind(row.id, a.person.isStaff ? 'user' : 'staff', since).first();
    return json({ ok: true, messages: msgs, typing: typing ? (typing.sender_name || STAFF_NAME) : false }, 200, corsHeaders);
  }

  // A staff message (staff view or admin): saved as Chris, and the customer is emailed if they're away.
  async function postStaffMessage(env, row, content) {
    const now = new Date().toISOString();
    const ins = await env.DB.prepare(`INSERT INTO film_messages (project_id, role, sender_name, content, created_at) VALUES (?1, 'staff', ?2, ?3, ?4)`)
      .bind(row.id, STAFF_NAME, content, now).run();
    await env.DB.prepare(`DELETE FROM film_typing WHERE project_id = ?1 AND role = 'staff'`).bind(row.id).run();
    let emailed = false;
    try { emailed = await emailCustomerReply(env, row, content, STAFF_NAME); } catch (e) { console.error('film staff reply email', e); }
    return { message: { id: Number(ins.meta?.last_row_id || 0), role: 'staff', content, sender_name: STAFF_NAME, created_at: now }, emailed };
  }

  // POST /api/film/chat {t, content}
  async function handleChatSend(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t, 'chat');
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    const content = clip(d.content, 4000);
    if (!content) return json({ ok: false, error: 'Type a message first.' }, 400, corsHeaders);
    if (a.person.isStaff) {
      const r = await postStaffMessage(env, row, content);
      return json({ ok: true, message: r.message }, 200, corsHeaders);
    }
    const who = a.person.name || a.person.email;
    const now = new Date().toISOString();
    const ins = await env.DB.prepare(`INSERT INTO film_messages (project_id, role, sender_name, content, created_at) VALUES (?1, 'user', ?2, ?3, ?4)`)
      .bind(row.id, who, content, now).run();
    await env.DB.prepare(`DELETE FROM film_typing WHERE project_id = ?1 AND role = 'user'`).bind(row.id).run();

    // Email staff about every message, except while staff has the chat open, or for a quick
    // burst right after an alert that hasn't been answered yet (one email covers those).
    const lastStaff = await env.DB.prepare(`SELECT MAX(created_at) AS t FROM film_messages WHERE project_id = ?1 AND role = 'staff'`).bind(row.id).first();
    const watching = ago(row.staff_seen_at) < STAFF_SEEN_SEC * 1000;
    const burst = ago(row.last_staff_alert_at) < STAFF_BURST_MIN * 60000 && !(lastStaff?.t && ms(lastStaff.t) >= ms(row.last_staff_alert_at));
    if (!watching && !burst) {
      await env.DB.prepare(`UPDATE film_projects SET last_staff_alert_at = ?1 WHERE id = ?2`).bind(now, row.id).run();
      const project = row.project_name || `Film #${row.id}`;
      try {
        await sendStaffOperationalAlert(env, {
          from: env.ALERTS_FROM_EMAIL,
          subject: `Film chat: ${who} (${project})`,
          text: [
            `${who}${a.person.isOwner ? '' : ` (added by ${row.customer_name || row.customer_email})`} wrote in the Folder to Film project chat for "${project}":`, '',
            content, '',
            'Reply in admin: Customers > Folder to Film > Details & Files (reply box), or Open as Staff.',
            `${SITE}/admin.html`, '',
            `More messages in the next ${STAFF_BURST_MIN} minutes, before you reply, won't email again; they'll be in the chat.`,
          ].join('\n'),
        });
      } catch (e) { console.error('film chat staff alert', e); }
    }
    return json({ ok: true, message: { id: Number(ins.meta?.last_row_id || 0), role: 'user', content, sender_name: who, created_at: now } }, 200, corsHeaders);
  }

  // POST /api/film/chat/reply {id, content} (admin)
  async function handleChatReply(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const d = await readJson(request);
    const row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(Number(d?.id || 0)).first();
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    const content = clip(d?.content, 4000);
    if (!content) return json({ ok: false, error: 'Type a reply first.' }, 400, corsHeaders);
    const r = await postStaffMessage(env, row, content);
    return json({ ok: true, ...r }, 200, corsHeaders);
  }

  // POST /api/film/chat/typing {t, typing}
  async function handleChatTyping(request, env, corsHeaders) {
    const d = await readJson(request);
    const a = await access(env, request, corsHeaders, d?.t, 'chat');
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    const role = a.person.isStaff ? 'staff' : 'user';
    if (d.typing === false) {
      await env.DB.prepare(`DELETE FROM film_typing WHERE project_id = ?1 AND role = ?2`).bind(row.id, role).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO film_typing (project_id, role, sender_name, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(project_id, role) DO UPDATE SET sender_name = excluded.sender_name, updated_at = excluded.updated_at`
      ).bind(row.id, role, a.person.isStaff ? STAFF_NAME : (a.person.name || a.person.email), new Date().toISOString()).run();
    }
    return json({ ok: true }, 200, corsHeaders);
  }

  function chatReplyEmail(row, content, senderName) {
    const link = `${dashboardUrl(row.token)}#chat`;
    const who = clip(senderName, 60) || STAFF_NAME;
    const hi = firstName(row);
    const text = [hi, '', `${who} replied in your project chat${row.project_name ? ` for "${row.project_name}"` : ''}:`, '', clip(content, 4000), '',
      `Reply on your dashboard: ${link}`, '', 'Folder to Film by Eastern Shore AI'].join('\n');
    const html = shell(
      `<p style="margin:0 0 12px;">${escapeHtml(hi)}</p><p style="margin:0 0 12px;">${escapeHtml(who)} replied in your project chat${row.project_name ? ` for "${escapeHtml(row.project_name)}"` : ''}:</p>`
      + filmQuote(clip(content, 4000))
      + filmButton(link, 'Reply on my dashboard'),
      { heading: 'New message about your film', preheader: clip(content, 120) });
    return { subject: `${who} replied about your film`, text, html };
  }

  // After a staff message: if the customer isn't on their dashboard, email them the reply.
  async function emailCustomerReply(env, row, content, senderName) {
    if (!row || !row.customer_email) return false;
    const fresh = await env.DB.prepare(`SELECT customer_seen_at, last_reply_email_at FROM film_projects WHERE id = ?1`).bind(row.id).first();
    if (ago(fresh?.customer_seen_at) < SEEN_WINDOW_SEC * 1000) return false;
    if (ago(fresh?.last_reply_email_at) < REPLY_EMAIL_GAP_MIN * 60000) return false;
    await env.DB.prepare(`UPDATE film_projects SET last_reply_email_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
    const { subject, text, html } = chatReplyEmail(row, content, senderName);
    try {
      await sendCustomerEmail(env, row, { kind: 'chat_reply', subject, text, html });
      return true;
    } catch (e) { console.error('film chat reply email', e); return false; }
  }

  // POST /api/film/notes {t, notes}
  async function handleNotes(request, env, corsHeaders) {
    const d = await readJson(request);
    if (!d) return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders);
    const a = await access(env, request, corsHeaders, d.t, 'edit');
    if (a.res) return a.res;
    const row = a.row;
    const bad = chatGuard(row, corsHeaders);
    if (bad) return bad;
    // Notes lock with the details and uploads when production starts; after that, the chat is for anything new.
    if (!editable(row)) return json({ ok: false, error: 'Production has started, so notes are locked. Send anything new in the project chat.' }, 409, corsHeaders);
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
  const DELIVER_KINDS = ['demo', 'final', 'audiobook'];
  const deliverColumn = (kind) => ({ demo: 'demo_key', final: 'final_key', audiobook: 'audiobook_key' }[kind]);

  async function signedWatch(env, origin, id, kind, download = false) {
    const exp = Math.floor(Date.now() / 1000) + WATCH_LINK_SECONDS;
    const sig = await hmacHex(linkSecret(env), `film-watch:${id}:${kind}:${exp}`);
    return `${origin}/api/film/watch?f=${id}&k=${kind}&e=${exp}&sig=${sig}${download ? '&dl=1' : ''}`;
  }

  async function mediaFor(env, row, origin, { audiobook = false } = {}) {
    const out = {};
    if (audiobook && row.audiobook_key && linkSecret(env)) {
      out.audiobookSrc = await signedWatch(env, origin, row.id, 'audiobook');
      out.audiobookDownload = await signedWatch(env, origin, row.id, 'audiobook', true);
    }
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
    if (!kind) return json({ ok: false, error: 'kind must be demo, final or audiobook' }, 400, corsHeaders);
    const size = Math.round(Number(d.size || 0));
    if (!(size > 0) || size > MAX_FILE_BYTES) return json({ ok: false, error: 'Bad file size' }, 400, corsHeaders);
    const audio = kind === 'audiobook';
    const ext = (safeFilename(d.name).match(/\.([a-z0-9]{2,5})$/i) || [, audio ? 'mp3' : 'mp4'])[1].toLowerCase();
    if (audio && !['mp3', 'm4a', 'm4b'].includes(ext)) return json({ ok: false, error: 'The audiobook should be an MP3 (or M4A) file.' }, 400, corsHeaders);
    const key = `deliverables/${row.id}/${kind}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const type = audio ? (ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4') : (clip(d.type, 80) || 'video/mp4');
    const mpu = await env.FILMS.createMultipartUpload(key, { httpMetadata: { contentType: type } });
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
    const previous = row[deliverColumn(kind)];
    if (previous && previous !== d.key) { try { await env.FILMS.delete(previous); } catch {} }
    const share = row.share_token || generateToken() + generateToken().slice(0, 8);
    if (kind === 'demo') await env.DB.prepare(`UPDATE film_projects SET demo_key = ?1, updated_at = datetime('now') WHERE id = ?2`).bind(d.key, row.id).run();
    else if (kind === 'audiobook') await env.DB.prepare(`UPDATE film_projects SET audiobook_key = ?1, audiobook_uploaded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?2`).bind(d.key, row.id).run();
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
      kind = ['demo', 'audiobook'].includes(url.searchParams.get('k')) ? url.searchParams.get('k') : 'final';
      const exp = Math.round(Number(url.searchParams.get('e') || 0));
      const sig = clip(url.searchParams.get('sig'), 128);
      const secret = linkSecret(env);
      if (!id || !exp || !sig || !secret || exp < Math.floor(Date.now() / 1000)) return new Response('This link has expired. Reload the page you opened it from.', { status: 403 });
      if (!timingSafeEqual(await hmacHex(secret, `film-watch:${id}:${kind}:${exp}`), sig)) return new Response('Bad link.', { status: 403 });
      row = await env.DB.prepare(`SELECT * FROM film_projects WHERE id = ?1`).bind(id).first();
    }
    const key = row ? row[deliverColumn(kind)] : null;
    if (!key) return new Response('Not found.', { status: 404 });
    return streamDeliverable(env, request, row, kind, key, url.searchParams.get('dl') === '1');
  }

  // Streams a delivered file from R2 (byte ranges, so phones can seek and resume).
  async function streamDeliverable(env, request, row, kind, key, download) {
    const head = await env.FILMS.head(key);
    if (!head) return new Response('Not found.', { status: 404 });
    const size = Number(head.size || 0);
    const type = head.httpMetadata?.contentType || (kind === 'audiobook' ? 'audio/mpeg' : 'video/mp4');
    const base = (row.project_name || 'film').replace(/[^\w\s-]+/g, '').trim().slice(0, 60) || 'film';
    const name = `${base}${kind === 'demo' ? ' (demo)' : kind === 'audiobook' ? ' - Audiobook' : ''}.${(key.split('.').pop() || 'mp4')}`;
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`,
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
    handleStaffLink, handleStaffAccess, handleKeepsakePhotos, askKDashboardContext, handleEmailSamples, handleKeepsakeCheckout, handleKeepsakePaid,
    handleKeepsakeExpired: async (env, session) => { if (session?.id) await env.DB.prepare(`DELETE FROM film_keepsake_orders WHERE stripe_session_id = ?1 AND status = 'pending'`).bind(clip(session.id, 120)).run(); },
    handleDeliverStart, handleDeliverPart, handleDeliverComplete, handleShareInfo, handleWatch, handleKeepsakeUpdate, handleListenInfo, handleListenAudio, handleListenFeed,
    handleAccessCode, handleAccessVerify, handlePeopleAdd, handlePeopleRemove, handlePeopleRole,
    handleChatGet, handleChatSend, handleChatTyping, handleChatReply, handleNotes,
    sendStatusEmail, purgeOldFilms,
    handleCheckout, handleFilmPaid, handleFilmExpired,
    handleDashboardGet, handleDashboardSave,
    handleUploadStart, handleUploadPart, handleUploadComplete, handleUploadDelete,
    handleStart, handleFeedback,
    handleAdminList, handleAdminDetail, handleAdminUpdate, handleAdminEmail, handleAdminFileLink, handleAdminDelete,
    handleFileDownload,
  };
}
