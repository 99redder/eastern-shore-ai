// Ask K order updates for Survival Node orders.
//
// POST /api/ask-k/order-status (handleAskKOrderStatus in index.js) emails the
// status of every Survival Node order placed with an address to that address:
// Stripe checkouts (bookings + order_fulfillment) and manual orders. The chat
// only ever says "if that address has orders, we've emailed them", so it shows
// no order details and doesn't reveal who is a customer. eBay sales are only in
// the tax ledger, so eBay buyers are sent back to eBay.
//
// Status comes from the order emails sent in admin (acknowledged → shipped →
// delivered), the estimated ship date set with the acknowledgment email or the
// Ship Date button, and a refund recorded against the order in the tax ledger.

import { sendEmail } from './email.js';
import { emailLayout, emailButton, detailsBox, emailParagraphs, TAGLINES } from './email-layout.js';

const SETTLED_AFTER_DAYS = 90;
const STATUS_EMAIL_LIMIT = 10;
// Processing is up to 7 business days (see the Ask K knowledge file); past
// about that many calendar days with no ship date, the email says it's late.
const LATE_WITHOUT_DATE_DAYS = 10;
const SHIPPED_OPEN_DAYS = 30;
const TRACK_URL = 'https://services.easternshore.ai/track';

// ── Dates ──────────────────────────────────────────────────────

export function easternDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
}

// 'YYYY-MM-DD' as is; SQLite datetime('now') values ('YYYY-MM-DD HH:MM:SS',
// UTC) and ISO timestamps as the Eastern date they fall on.
function easternDateOf(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(' ', 'T') : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : easternDate(d);
}

/** "Thursday, October 29, 2026" for a 'YYYY-MM-DD' date. */
export function longDate(iso) {
  const s = String(iso || '').slice(0, 10);
  const d = new Date(`${s}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

/** A real calendar date as 'YYYY-MM-DD', or '' for anything else. */
export function normalizeShipDate(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : '';
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${String(toIso).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(fromIso).slice(0, 10)}T12:00:00Z`)) / 86400000);
}

// ── Order lookup ───────────────────────────────────────────────

/**
 * What a buyer typed as an order number, in the stored form: "Order #26001",
 * "no. 26001" and " 26001 " all become "26001".
 * @returns {string|null} '' when empty, null when it can't be one of our order numbers
 */
export function normalizeOrderNumber(input) {
  const typed = String(input || '');
  if (typed.length > 40) return null;
  const raw = typed.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(ORDER|NUMBER|NO)+/, '');
  if (!raw) return '';
  return /^\d{4,8}$/.test(raw) ? raw : null;
}

function orderSummary(row) {
  const manual = String(row.order_summary || '').trim();
  if (manual) return manual;
  const type = String(row.service_type || '').trim();
  if (!type) return 'Survival Node';
  return type.split(/[_-]+/).join(' ').replace(/\s+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Survival Node orders for one address (the same Stripe orders as the admin
 * Orders tab, minus BYOG setups, plus manual orders). With an order number
 * that matches one of them, just that order (narrowed); with one that doesn't,
 * all of them (missed), so a mistyped number still gets the buyer an answer.
 */
export async function ordersForEmail(db, email, { orderNumber = '' } = {}) {
  const address = String(email || '').trim().toLowerCase();
  const stripe = (await db.prepare(
    `SELECT
       b.id, b.service_type, b.amount_cents,
       substr(COALESCE(ti.income_date, b.paid_at, b.created_at), 1, 10) AS payment_date,
       '' AS order_summary,
       of.order_number, of.tracking_provider, of.tracking_number,
       of.ack_email_sent_at, of.shipping_email_sent_at, of.delivered_email_sent_at, of.review_email_sent_at,
       of.shipped_at, of.estimated_ship_date,
       r.income_date AS refund_date, r.amount_cents AS refund_cents
     FROM bookings b
     LEFT JOIN tax_income ti ON ti.stripe_session_id = b.stripe_session_id
     LEFT JOIN order_fulfillment of ON of.booking_id = b.id
     LEFT JOIN tax_income r ON r.refund_order_key = 'booking:' || b.id
     WHERE b.status IN ('paid','confirmed')
       AND COALESCE(b.stripe_session_id, '') != ''
       AND (LOWER(COALESCE(ti.source, '')) = 'stripe - survival node' OR LOWER(COALESCE(ti.category, '')) LIKE 'survival node%')
       AND LOWER(COALESCE(b.service_type, '')) NOT IN ('byog_setup', 'survival_node_byog_setup')
       AND LOWER(TRIM(b.customer_email)) = ?1
     ORDER BY COALESCE(b.paid_at, b.created_at) DESC, b.id DESC
     LIMIT 50`
  ).bind(address).all()).results || [];
  const manual = (await db.prepare(
    `SELECT
       m.id, 'survival_node_manual' AS service_type, m.amount_cents, m.payment_date, m.order_summary,
       m.order_number, m.tracking_provider, m.tracking_number,
       m.ack_email_sent_at, m.shipping_email_sent_at, m.delivered_email_sent_at, m.review_email_sent_at,
       m.shipped_at, m.estimated_ship_date,
       r.income_date AS refund_date, r.amount_cents AS refund_cents
     FROM manual_survival_node_orders m
     LEFT JOIN tax_income r ON r.refund_order_key = 'manual:' || m.id
     WHERE LOWER(TRIM(m.customer_email)) = ?1
     ORDER BY m.payment_date DESC, m.id DESC
     LIMIT 50`
  ).bind(address).all()).results || [];
  const orders = [...stripe, ...manual];
  const wanted = normalizeOrderNumber(orderNumber);
  if (wanted) {
    const hit = orders.filter((o) => String(o.order_number || '') === wanted);
    if (hit.length) return { orders: hit, narrowed: true };
    return { orders, missed: true };
  }
  return { orders };
}

// ── The email ──────────────────────────────────────────────────

function money(cents) {
  return `$${(Math.abs(Number(cents || 0)) / 100).toFixed(2)}`;
}

// Status line, whether it's still on its way, and the date it last moved.
function orderState(o, today) {
  const paid = easternDateOf(o.payment_date);
  const deliveredOn = easternDateOf(o.delivered_email_sent_at || o.review_email_sent_at);
  const shippedOn = easternDateOf(o.shipped_at || o.shipping_email_sent_at);
  const carrier = String(o.tracking_provider || '').trim().toUpperCase();
  if (o.refund_date || Number(o.refund_cents || 0) < 0) {
    const on = easternDateOf(o.refund_date);
    return { status: `Refunded: a refund of ${money(o.refund_cents)} was issued${on ? ` on ${longDate(on)}` : ''}. Refunds go back to the original payment method.`, open: false, moved: on || paid };
  }
  if (deliveredOn) return { status: `Delivered ${longDate(deliveredOn)}`, open: false, moved: deliveredOn, tracking: true };
  if (shippedOn) {
    // Not every delivery is marked in admin, so a shipment over a month old
    // counts as finished, and the "usually takes" line is for fresh ones.
    const days = daysBetween(shippedOn, today);
    return { status: `Shipped ${longDate(shippedOn)}${carrier ? ` by ${carrier}` : ''}.${days <= 14 ? ' Ground shipping usually takes 5 to 7 business days.' : ''}`, open: days <= SHIPPED_OPEN_DAYS, moved: shippedOn, tracking: true };
  }
  const lead = o.ack_email_sent_at
    ? "We're preparing and quality-checking it now."
    : "Order received. We're getting it ready.";
  const est = normalizeShipDate(o.estimated_ship_date);
  let status;
  if (est && today > est) {
    status = `${lead} It's taking a little longer than our estimate (it was due to ship by ${longDate(est)}). Reply to this email and we'll check on it.`;
  } else if (est) {
    status = `${lead} Estimated ship date: ${longDate(est)}.`;
  } else if (paid && daysBetween(paid, today) > LATE_WITHOUT_DATE_DAYS) {
    status = `${lead} It's taking longer than usual to ship. Reply to this email and we'll check on it.`;
  } else {
    status = `${lead} Orders usually ship within 1 to 2 business days, and always within 7. We'll email you the tracking number when it ships.`;
  }
  return { status, open: true, moved: paid };
}

function orderEntry(o, today) {
  const state = orderState(o, today);
  const rows = [
    ['Order Number', o.order_number || ''],
    ['Order', orderSummary(o)],
    ['Ordered', longDate(easternDateOf(o.payment_date))],
    ['Status', state.status],
  ];
  const trackingNumber = String(o.tracking_number || '').trim();
  const carrier = String(o.tracking_provider || '').trim();
  let trackUrl = '';
  if (state.tracking && trackingNumber) {
    if (carrier) rows.push(['Carrier', carrier.toUpperCase()]);
    rows.push(['Tracking Number', trackingNumber]);
    trackUrl = `${TRACK_URL}?n=${encodeURIComponent(trackingNumber)}${carrier ? `&c=${encodeURIComponent(carrier)}` : ''}`;
  }
  return { ...state, rows, trackUrl, trackLabel: carrier ? `Track on ${carrier.toUpperCase()}` : 'Track Your Shipment', placed: easternDateOf(o.payment_date) };
}

/**
 * Subject, html and text for the order-status email, or null when the address
 * has no orders. Orders still on their way come first; finished ones older than
 * SETTLED_AFTER_DAYS (and any past STATUS_EMAIL_LIMIT) collapse into one
 * "plus N older orders" line.
 */
export function buildOrderStatusEmail({ orders = [], narrowed = false, missed = false }, today = easternDate()) {
  const entries = orders.map((o) => ({ number: o.order_number || '', ...orderEntry(o, today) }))
    .sort((a, b) => (Number(b.open) - Number(a.open)) || String(b.placed).localeCompare(String(a.placed)));
  if (!entries.length) return null;
  let shown = narrowed ? entries : entries.filter((e) => e.open || daysBetween(e.moved, today) <= SETTLED_AFTER_DAYS);
  if (!shown.length) shown = entries.slice(0, 3); // only old orders: show the latest few
  shown = shown.slice(0, STATUS_EMAIL_LIMIT);
  const older = entries.length - shown.length;
  const several = shown.length > 1;

  const intro = [];
  // The number the visitor typed is never repeated, so the box can't put words in this email.
  if (missed) intro.push("We couldn't find the order number you entered under this email address, so here are your orders.");
  intro.push(several
    ? "Here's the latest on your Survival Node orders, as you asked in the Ask K chat on our website. Orders still on their way are first."
    : "Here's the latest on your Survival Node order, as you asked in the Ask K chat on our website.");
  const outro = [];
  if (older > 0) outro.push(`Plus ${older} older order${older > 1 ? 's' : ''} that ${older > 1 ? 'were' : 'was'} delivered or finished more than ${SETTLED_AFTER_DAYS} days ago. Reply to this email if you'd like the details.`);
  outro.push('Questions? Just reply to this email or call (302) 907-9162.');

  const heading = several ? 'Your Survival Node Orders' : 'Your Survival Node Order Status';
  const one = narrowed && shown.length === 1 ? shown[0].number : '';
  const subject = `Your Survival Node order status${one ? ` (#${one})` : ''}`;
  // Plain and neutral: "if that wasn't you, ignore this" reads like a security alert (Gmail flagged it on FMG).
  const note = 'Sent because an order update was requested in the Ask K chat on easternshore.ai.';
  const html = emailLayout({
    heading,
    preheader: several ? 'The latest on your Survival Node orders.' : 'The latest on your Survival Node order.',
    tagline: TAGLINES.survivalNode,
    body: emailParagraphs(intro.join('\n\n'))
      + shown.map((e) => detailsBox(e.rows) + (e.trackUrl ? emailButton(e.trackUrl, e.trackLabel) : '')).join('')
      + emailParagraphs(outro.join('\n\n')),
    footerNote: note,
  });
  const text = [
    heading,
    '',
    ...intro.flatMap((p) => [p, '']),
    ...shown.flatMap((e) => [
      ...e.rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
      ...(e.trackUrl ? [`Track it: ${e.trackUrl}`] : []),
      '',
    ]),
    ...outro.flatMap((p) => [p, '']),
    note,
    'Eastern Shore AI, LLC · Fruitland, Maryland · https://www.easternshore.ai',
  ].join('\n');
  return { subject, html, text };
}

/**
 * Emails the status of `email`'s Survival Node orders (or just `orderNumber`,
 * when it is one of them) to that address. No BCC: the email is the buyer's.
 * @returns {Promise<boolean>} whether one was sent
 */
export async function sendOrderStatusEmail(env, email, { orderNumber = '' } = {}) {
  const address = String(email || '').trim().toLowerCase();
  const built = buildOrderStatusEmail(await ordersForEmail(env.DB, address, { orderNumber }));
  if (!built) return false;
  const fromEmail = String(env.ORDERS_FROM_EMAIL || env.FROM_EMAIL || '').trim();
  if (!fromEmail) return false;
  try {
    const res = await sendEmail(env, {
      from: fromEmail.includes('<') ? fromEmail : `Eastern Shore AI Orders <${fromEmail}>`,
      to: [address],
      reply_to: 'contact@easternshore.ai',
      ...built,
    });
    if (!res.ok) console.error('Order status email failed', await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.error('Order status email failed', e?.message || e);
    return false;
  }
}
