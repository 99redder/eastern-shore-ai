// One-tap Survival Node reviews.
//
// The review request email (admin Orders → "Request Review", kind 'review') shows
// five stars; each is a link to rate.html?t=TOKEN&r=N. Opening it saves that
// rating at once (that's the whole review), then the page offers an optional
// comment and a name choice ("Mike R." or anonymous). Every rating emails staff.
// Red approves ratings in admin (Orders → Reviews) before they can show on
// node.html; tools/node-reviews.mjs bakes the approved ones into the page, its
// Product JSON-LD and the ChatGPT feed once there are REVIEW_MIN_TO_SHOW of them.
//
// Rules (FTC 2024 review rule, Google's review policies): every genuine rating is
// shown, low ones included; 'hidden' is only for spam or abuse. Nothing is offered
// for a review. The Google review link is offered to everyone, whatever they rated.
//
//   GET  /api/review?t=          public: the review behind a token (prefills rate.html)
//   POST /api/review             public: {t, rating, comment?, nameChoice?}
//   GET  /api/reviews/public     public: approved reviews + count and average
//   GET  /api/reviews            admin: every rated review (and how many invites wait)
//   POST /api/reviews/status     admin: {id, status: approved | pending | hidden}

export const RATE_PAGE = 'https://www.easternshore.ai/rate.html';
export const GOOGLE_REVIEW_LINK = 'https://www.easternshore.ai/review';
export const REVIEW_MIN_TO_SHOW = 3;
const COMMENT_MAX = 2000;
const NAME_CHOICES = ['initial', 'anonymous'];
const ADMIN_STATUSES = ['approved', 'pending', 'hidden'];
const ALERT_EVERY_MS = 10 * 60 * 1000;

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// "Mike Roberts" → "Mike R."; one word stays as is. Anonymous → "Verified buyer".
export function publicName(customerName, nameChoice) {
  if (nameChoice === 'anonymous') return 'Verified buyer';
  const parts = clean(customerName, 80).replace(/[^\p{L}\p{M}' .-]/gu, '').split(' ').filter(Boolean);
  if (!parts.length) return 'Verified buyer';
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

// Called when the review request email is built (preview or send): one invite
// per order, reused every time, so links from an earlier email keep working.
export async function ensureReviewInvite(env, row) {
  const orderKey = clean(row?.order_key, 120);
  if (!env.DB || !orderKey) return '';
  const existing = await env.DB.prepare(`SELECT token FROM product_reviews WHERE order_key = ?1`).bind(orderKey).first();
  if (existing?.token) return existing.token;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO product_reviews (token, order_key, order_number, customer_name, customer_email)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  ).bind(randomToken(), orderKey, clean(row?.order_number, 40) || null, clean(row?.customer_name, 120) || null, clean(row?.customer_email, 200).toLowerCase() || null).run();
  const made = await env.DB.prepare(`SELECT token FROM product_reviews WHERE order_key = ?1`).bind(orderKey).first();
  return made?.token || '';
}

export function rateLink(token, rating) {
  return `${RATE_PAGE}?t=${encodeURIComponent(token)}&r=${rating}`;
}

// The stars block in the review email: five plain links, so it works in every mail app.
export function reviewStarsHtml(token) {
  const cells = [1, 2, 3, 4, 5].map((n) => `<td align="center" style="padding:0 4px;"><a href="${rateLink(token, n)}" title="${n} star${n === 1 ? '' : 's'}" style="display:block;color:#E8A400;font-size:40px;line-height:44px;text-decoration:none;font-family:Arial,sans-serif;">&#9733;</a><div style="font-family:Arial,sans-serif;font-size:12px;color:#5B6472;line-height:16px;">${n}</div></td>`).join('');
  return `<div style="margin:24px 0 8px;text-align:center;">`
    + `<div style="font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#1F2933;margin:0 0 8px;">How's your Survival Node? Tap a star:</div>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr>${cells}</tr></table>`
    + `<div style="font-family:Arial,sans-serif;font-size:13px;color:#5B6472;margin:8px 0 0;">1 = poor, 5 = great. One tap is all it takes; you can add a comment after if you like.</div>`
    + `</div>`;
}

export function reviewStarsText(token) {
  return ['How\'s your Survival Node? Tap a rating (one tap is all it takes):',
    ...[5, 4, 3, 2, 1].map((n) => `${stars(n)} ${n}: ${rateLink(token, n)}`)].join('\n');
}

export function createReviewHandlers({ json, requireAdmin, sendStaffOperationalAlert, rateLimit }) {
  async function findByToken(env, token) {
    const t = clean(token, 80);
    if (!/^[0-9a-f]{48}$/.test(t)) return null;
    return env.DB.prepare(`SELECT * FROM product_reviews WHERE token = ?1`).bind(t).first();
  }

  function view(r) {
    return {
      firstName: clean(r.customer_name, 80).split(' ')[0] || '',
      rating: r.rating || null,
      comment: r.comment || '',
      nameChoice: r.name_choice || 'initial',
      publicName: publicName(r.customer_name, r.name_choice),
      initialName: publicName(r.customer_name, 'initial'),
      status: r.status,
      googleReviewUrl: GOOGLE_REVIEW_LINK,
    };
  }

  async function alertStaff(env, r) {
    if (r.alerted_at && Date.now() - Date.parse(`${r.alerted_at}Z`) < ALERT_EVERY_MS) return;
    await env.DB.prepare(`UPDATE product_reviews SET alerted_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
    const low = r.rating <= 2;
    const who = `${publicName(r.customer_name, 'initial')}${r.order_number ? ` (order #${r.order_number})` : ''}`;
    await sendStaffOperationalAlert(env, {
      subject: `${low ? 'Low rating: ' : ''}Survival Node review ${stars(r.rating)} from ${who}`,
      text: [
        `${who} rated their Survival Node ${r.rating} of 5 (${stars(r.rating)}).`,
        r.comment ? `\nComment:\n${r.comment}` : '\nNo comment (yet).',
        `\nShown as: ${publicName(r.customer_name, r.name_choice)}`,
        low ? '\nA low rating: worth reaching out to see what went wrong.' : '',
        '\nApprove it in admin (Orders → Reviews) to count it on node.html: https://www.easternshore.ai/admin.html',
        'Show every genuine rating, low ones included; hide only spam or abuse.',
      ].filter(Boolean).join('\n'),
      from: env.ALERTS_FROM_EMAIL,
    }).catch((e) => console.error('review alert failed', e));
  }

  async function handleGet(request, env, cors, url) {
    const r = await findByToken(env, url.searchParams.get('t'));
    if (!r) return json({ ok: false, error: 'This review link isn\'t valid. Reply to the email and we\'ll help.' }, 404, cors);
    return json({ ok: true, ...view(r) }, 200, cors);
  }

  async function handleSave(request, env, cors) {
    const limited = await rateLimit(request, env, cors);
    if (limited) return limited;
    const data = await request.json().catch(() => ({}));
    const r = await findByToken(env, data.t);
    if (!r) return json({ ok: false, error: 'This review link isn\'t valid. Reply to the email and we\'ll help.' }, 404, cors);
    const rating = Number(data.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ ok: false, error: 'Pick 1 to 5 stars' }, 400, cors);
    const comment = data.comment === undefined ? (r.comment || '') : String(data.comment ?? '').replace(/\r\n/g, '\n').trim();
    if (comment.length > COMMENT_MAX) return json({ ok: false, error: `Comments can be up to ${COMMENT_MAX} characters` }, 400, cors);
    const nameChoice = data.nameChoice === undefined ? (r.name_choice || 'initial') : String(data.nameChoice);
    if (!NAME_CHOICES.includes(nameChoice)) return json({ ok: false, error: 'Invalid name choice' }, 400, cors);

    const changed = rating !== r.rating || comment !== (r.comment || '') || nameChoice !== (r.name_choice || 'initial');
    if (changed) {
      // Any change goes back to Red before it shows (or shows again).
      await env.DB.prepare(
        `UPDATE product_reviews SET rating = ?1, comment = ?2, name_choice = ?3, status = 'pending', approved_at = NULL,
           rated_at = COALESCE(rated_at, datetime('now')), user_agent = ?4, updated_at = datetime('now') WHERE id = ?5`
      ).bind(rating, comment || null, nameChoice, clean(request.headers.get('User-Agent'), 200), r.id).run();
      const fresh = await env.DB.prepare(`SELECT * FROM product_reviews WHERE id = ?1`).bind(r.id).first();
      const ratingOrCommentChanged = rating !== r.rating || comment !== (r.comment || '');
      if (ratingOrCommentChanged) await alertStaff(env, fresh);
      return json({ ok: true, saved: true, ...view(fresh) }, 200, cors);
    }
    return json({ ok: true, saved: false, ...view(r) }, 200, cors);
  }

  async function approvedReviews(env) {
    const rows = (await env.DB.prepare(
      `SELECT rating, comment, customer_name, name_choice, COALESCE(approved_at, rated_at) AS approved, rated_at
       FROM product_reviews WHERE status = 'approved' AND rating BETWEEN 1 AND 5 ORDER BY rated_at DESC, id DESC`
    ).all()).results || [];
    const reviews = rows.map((r) => ({ rating: r.rating, comment: r.comment || '', name: publicName(r.customer_name, r.name_choice), date: String(r.rated_at || '').slice(0, 10) }));
    const count = reviews.length;
    const average = count ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / count * 10) / 10 : 0;
    return { count, average, minToShow: REVIEW_MIN_TO_SHOW, reviews };
  }

  async function handlePublic(request, env, cors) {
    const out = await approvedReviews(env);
    return json({ ok: true, ...out }, 200, { ...cors, 'Cache-Control': 'public, max-age=300' });
  }

  async function handleAdminList(request, env, cors, url) {
    const auth = await requireAdmin(request, env, cors, url);
    if (!auth.ok) return auth.res;
    const rows = (await env.DB.prepare(
      `SELECT id, order_key, order_number, customer_name, customer_email, rating, comment, name_choice, status, rated_at, approved_at, user_agent
       FROM product_reviews WHERE status != 'invited' ORDER BY rated_at DESC, id DESC`
    ).all()).results || [];
    const invited = await env.DB.prepare(`SELECT COUNT(*) AS n FROM product_reviews WHERE status = 'invited'`).first();
    const pub = await approvedReviews(env);
    return json({
      ok: true,
      invitedWaiting: Number(invited?.n) || 0,
      approvedCount: pub.count,
      average: pub.average,
      minToShow: REVIEW_MIN_TO_SHOW,
      reviews: rows.map((r) => ({ ...r, publicName: publicName(r.customer_name, r.name_choice) })),
    }, 200, cors);
  }

  async function handleAdminStatus(request, env, cors, url) {
    const auth = await requireAdmin(request, env, cors, url);
    if (!auth.ok) return auth.res;
    const data = await request.json().catch(() => ({}));
    const id = Number(data.id);
    const status = String(data.status || '');
    if (!id || !ADMIN_STATUSES.includes(status)) return json({ ok: false, error: 'Invalid review or status' }, 400, cors);
    const r = await env.DB.prepare(`SELECT id, rating FROM product_reviews WHERE id = ?1`).bind(id).first();
    if (!r) return json({ ok: false, error: 'Review not found' }, 404, cors);
    if (!r.rating) return json({ ok: false, error: 'That review has no rating yet' }, 400, cors);
    await env.DB.prepare(
      `UPDATE product_reviews SET status = ?1, approved_at = CASE WHEN ?1 = 'approved' THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?2`
    ).bind(status, id).run();
    return json({ ok: true, id, status }, 200, cors);
  }

  return { handleGet, handleSave, handlePublic, handleAdminList, handleAdminStatus };
}
