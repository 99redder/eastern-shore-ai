// Website Care Plan: agreement e-signing, $100/yr Stripe checkout, renewals, admin.
//
// Flow: admin adds a client -> sends agreement link -> client signs on
// /website-agreement.html?t=TOKEN -> Stripe Checkout ($100, no tax) ->
// webhook marks the year paid and posts income + Stripe fee to the books.
// Renewal: automatic by default (Stripe subscription, yearly), or a one-time
// payment per year via the same link if the client prefers to pay by hand.
// Subscription payments are recorded from invoice.paid (keyed by invoice id),
// one-time payments from checkout.session.completed (keyed by session id).

export const WEBSITE_AGREEMENT_VERSION = '2026-10-19.2';
export const WEBSITE_PLAN_PRICE_CENTS = 10000;

// Canonical agreement text. Placeholders: {{business}}, {{price}}, {{domain}}.
// Changing any wording requires bumping WEBSITE_AGREEMENT_VERSION so signed
// copies stay tied to the exact text the client saw.
export const WEBSITE_AGREEMENT_SECTIONS = [
  ['Parties', 'This Website Care Agreement ("Agreement") is between Eastern Shore AI, LLC, a Maryland limited liability company ("Provider"), and {{business}} ("Client"). It takes effect when Client signs it electronically below.'],
  ['What Provider does', 'For the annual fee, Provider will: (a) design, build, and publish Client\'s website; (b) register Client\'s domain name ({{domain}}) and renew it each year while this Agreement is active; (c) host the website and keep it online, secure, and working on phones and computers; (d) make content updates and changes Client asks for, such as text, photos, hours, prices, services, and new pages; and (e) add new website features Client asks for as the business grows. Provider will usually complete routine requests within 3 business days.'],
  ['What is not included', 'The annual fee does not cover: third-party paid services Client chooses to use (for example paid booking or scheduling software, email hosting such as Google Workspace, or paid plugins); payment processing or e-commerce transaction fees; paid advertising; printed materials; photography sessions; or work unrelated to Client\'s website. Provider will tell Client in advance if a request falls outside the plan, and nothing outside the plan will be charged without Client\'s written approval.'],
  ['Fee and price lock', 'The fee is {{price}} per year, paid in advance. Sales tax is not charged on this service. As long as Client renews each year without a lapse of more than 30 days, Provider will not raise this annual fee.'],
  ['Term and renewal', 'The first term starts on the date of the first payment and lasts one year. Each renewal adds one year. Client chooses how to renew when paying and can switch at any time. With automatic renewal, Client\'s card is charged {{price}} on each renewal date until Client cancels. Provider will email Client a reminder before each automatic charge, and Client can turn off automatic renewal at any time before the renewal date, using the "Manage billing" button on this agreement page or by contacting Provider; no further charges are made after that. With manual renewal, nothing is charged unless Client pays, and Provider will send a renewal link about 30 days before each renewal date. If a renewal payment is more than 30 days late, or an automatic charge fails and is not fixed within 30 days, Provider may take the website offline until payment is made. The domain stays registered to Client.'],
  ['Domain and ownership', 'The domain name is registered with Client listed as the registrant, and it belongs to Client. Client owns its business name, logo, photos, and all content it provides. Client owns the finished website. If this Agreement ends for any reason, Provider will, on request, transfer the domain to an account Client controls and give Client a copy of the website files.'],
  ['Client responsibilities', 'Client will provide accurate business information and will only provide content (text, photos, logos) that Client owns or has permission to use. Client will respond to reasonable questions needed to complete requested work.'],
  ['Cancellation and refunds', 'Client may cancel at any time by contacting Provider or by turning off automatic renewal. Canceling stops all future charges. Client may cancel within 14 days of the first payment for a full refund. After that, payments are not refunded, and the website stays online through the end of the paid year. Provider may end this Agreement with 30 days\' notice, in which case Provider will refund the unused portion of the current year and complete the domain and file handoff described above.'],
  ['Availability and results', 'Provider will use reasonable care to keep the website online and secure, but cannot guarantee uninterrupted service, and does not guarantee any particular search ranking, traffic, or sales.'],
  ['Limit of liability', 'Each party\'s total liability under this Agreement is limited to the fees Client paid in the 12 months before the claim. Neither party is liable for indirect or consequential damages, such as lost profits.'],
  ['Portfolio', 'Provider may list the website as an example of its work. Client can opt out at any time by asking.'],
  ['General', 'This Agreement is governed by the laws of the State of Maryland, with venue in Wicomico County. It is the entire agreement between the parties about the website and can only be changed in writing (email is fine) agreed to by both parties. Both parties agree that signing electronically has the same effect as signing on paper.'],
];

const STATUSES = ['prospect', 'link_sent', 'signed', 'active', 'past_due', 'canceled'];

export function renderAgreementText(client) {
  const vars = {
    business: client.business_name || 'Client',
    price: formatUsdLocal(Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS)),
    domain: client.domain_name || 'a domain name chosen with Client',
  };
  return WEBSITE_AGREEMENT_SECTIONS.map(([h, body], i) =>
    `${i + 1}. ${h}\n${body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')}`
  ).join('\n\n');
}

function formatUsdLocal(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function addOneYear(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function unixToIso(sec) {
  return new Date(Number(sec) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function daysUntil(isoDate) {
  return Math.round((Date.parse(`${isoDate}T12:00:00Z`) - Date.parse(`${todayIso()}T12:00:00Z`)) / 86400000);
}

// A Stripe subscription that still exists (it may be set to end at the period end).
const LIVE_SUB_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete'];
function subscriptionLive(row) {
  return !!row.stripe_subscription_id && LIVE_SUB_STATUSES.includes(row.subscription_status || '');
}
// Card will be charged automatically at the next renewal.
function autopayOn(row) {
  return subscriptionLive(row) && !Number(row.cancel_at_period_end || 0);
}

function clip(v, n) {
  return (v == null ? '' : String(v)).trim().slice(0, n);
}

export function createWebsitePlanHandlers(deps) {
  const {
    json, requireAdmin, escapeHtml, formatUsd, getClientIp, generateToken,
    upsertTaxIncomeJournal, upsertTaxExpenseJournal, fetchStripeFeeCents, estimateStripeFeeCents,
    sendStaffOperationalAlert,
  } = deps;

  const SITE = 'https://www.easternshore.ai';

  function agreementUrl(token) {
    return `${SITE}/website-agreement.html?t=${encodeURIComponent(token)}`;
  }

  function computeView(row) {
    const today = todayIso();
    let status = row.status;
    let daysToRenewal = null;
    if (row.current_period_end) {
      daysToRenewal = Math.round((Date.parse(`${row.current_period_end}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
      if (status === 'active' && daysToRenewal < 0) status = 'past_due';
    }
    // A failed automatic charge Stripe is still retrying.
    if (status === 'active' && ['past_due', 'unpaid'].includes(row.subscription_status || '')) status = 'past_due';
    return {
      ...row,
      status,
      autopay: autopayOn(row),
      autopay_ending: subscriptionLive(row) && !!Number(row.cancel_at_period_end || 0),
      days_to_renewal: daysToRenewal,
      agreement_url: row.agreement_token ? agreementUrl(row.agreement_token) : '',
    };
  }

  async function getClientByToken(db, token) {
    if (!token || token.length < 16) return null;
    return db.prepare(`SELECT * FROM website_clients WHERE agreement_token = ?1`).bind(token).first();
  }

  async function sendEmail(env, { to, subject, html, text }) {
    if (!env.RESEND_API_KEY || !env.FROM_EMAIL) throw new Error('Email provider is not configured');
    const payload = { from: env.FROM_EMAIL, to: [to], subject, html, text, reply_to: 'contact@easternshore.ai' };
    if (env.BCC_EMAIL) payload.bcc = [env.BCC_EMAIL];
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to send email');
    return data?.id || null;
  }

  function emailShell(innerHtml) {
    return `<div style="font-family:Arial,sans-serif;background:#f5f6f8;padding:24px;color:#111827;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;"><div style="padding:22px 24px;">${innerHtml}</div><div style="padding:14px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;color:#4b5563;font-size:13px;">Chris, Eastern Shore AI, LLC &middot; <a href="${SITE}" style="color:#2563eb;">www.easternshore.ai</a><br>facebook.com/easternshoreai &middot; contact@easternshore.ai &middot; (302) 907-9162</div></div></div>`;
  }

  async function stripeApi(env, method, path, params) {
    if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured');
    const init = { method, headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } };
    if (params) {
      init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = (params instanceof URLSearchParams ? params : new URLSearchParams(params)).toString();
    }
    const res = await fetch(`https://api.stripe.com/v1/${path}`, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Stripe ${path} failed`);
    return data;
  }

  // Payment intent behind an invoice. Older Stripe API versions put it on the
  // invoice; newer ones list it under invoice_payments.
  async function paymentIntentForInvoice(env, invoice) {
    try {
      let inv = invoice;
      if (typeof inv === 'string') inv = await stripeApi(env, 'GET', `invoices/${encodeURIComponent(inv)}`);
      const direct = inv?.payment_intent;
      if (direct) return typeof direct === 'string' ? direct : direct.id || '';
      const list = await stripeApi(env, 'GET', `invoice_payments?invoice=${encodeURIComponent(inv.id)}&limit=3`);
      const hit = (list?.data || []).find((p) => p?.payment?.payment_intent);
      const pi = hit?.payment?.payment_intent;
      return pi ? (typeof pi === 'string' ? pi : pi.id || '') : '';
    } catch (e) {
      console.error('invoice payment intent lookup failed', e);
      return '';
    }
  }

  // autopay=true -> yearly Stripe subscription; false -> one-time payment for one year.
  async function createCheckout(env, client, autopay) {
    if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured');
    const today = todayIso();
    const amount = String(Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS));
    const back = agreementUrl(client.agreement_token);
    const email = clip(client.signer_email || client.email, 200);
    let body;

    if (autopay) {
      if (subscriptionLive(client)) throw new Error('Automatic renewal is already set up. Use "Manage billing" to change your card or turn it off.');
      // Already paid ahead: collect the card now, first automatic charge on the paid-through date.
      const paidAhead = client.current_period_end && daysUntil(client.current_period_end) >= 3;
      const firstCharge = paidAhead ? client.current_period_end : today;
      body = new URLSearchParams({
        mode: 'subscription',
        success_url: `${back}&paid=1`,
        cancel_url: `${back}&canceled=1`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': amount,
        'line_items[0][price_data][recurring][interval]': 'year',
        'line_items[0][price_data][product_data][name]': `Website Care Plan: ${client.business_name}`.slice(0, 250),
        'line_items[0][price_data][product_data][description]': (paidAhead
          ? `Already paid through ${client.current_period_end}. Renews automatically each year starting then. Cancel any time.`
          : 'Domain, hosting, unlimited updates and new features. Renews automatically each year. Cancel any time.').slice(0, 500),
        'metadata[checkout_type]': 'website_plan',
        'metadata[website_client_id]': String(client.id),
        'metadata[autopay]': '1',
        'metadata[period_start]': firstCharge,
        'metadata[period_end]': addOneYear(firstCharge),
        'metadata[agreement_version]': client.agreement_version || '',
        'subscription_data[description]': `Website Care Plan - ${client.business_name}`.slice(0, 250),
        'subscription_data[metadata][checkout_type]': 'website_plan',
        'subscription_data[metadata][website_client_id]': String(client.id),
      });
      if (paidAhead) body.set('subscription_data[trial_end]', String(Math.floor(Date.parse(`${client.current_period_end}T16:00:00Z`) / 1000)));
      if (client.stripe_customer_id) body.set('customer', client.stripe_customer_id);
      else if (email) body.set('customer_email', email);
    } else {
      const periodStart = client.current_period_end && client.current_period_end > today ? client.current_period_end : today;
      const periodEnd = addOneYear(periodStart);
      body = new URLSearchParams({
        mode: 'payment',
        success_url: `${back}&paid=1`,
        cancel_url: `${back}&canceled=1`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': amount,
        'line_items[0][price_data][product_data][name]': `Website Care Plan, 1 year: ${client.business_name}`.slice(0, 250),
        'line_items[0][price_data][product_data][description]': `Domain, hosting, unlimited updates and new features. ${periodStart} to ${periodEnd}. Does not renew automatically.`,
        'metadata[checkout_type]': 'website_plan',
        'metadata[website_client_id]': String(client.id),
        'metadata[autopay]': '0',
        'metadata[period_start]': periodStart,
        'metadata[period_end]': periodEnd,
        'metadata[agreement_version]': client.agreement_version || '',
        'payment_intent_data[description]': `Website Care Plan - ${client.business_name}`.slice(0, 250),
        'payment_intent_data[metadata][checkout_type]': 'website_plan',
        'payment_intent_data[metadata][website_client_id]': String(client.id),
      });
      if (client.stripe_customer_id) body.set('customer', client.stripe_customer_id);
      else if (email) body.set('customer_email', email);
    }

    const data = await stripeApi(env, 'POST', 'checkout/sessions', body);
    if (!data?.url) throw new Error('Stripe session failed');
    await env.DB.prepare(`UPDATE website_clients SET stripe_session_id = ?1, updated_at = datetime('now') WHERE id = ?2`).bind(data.id, client.id).run();
    return data.url;
  }

  // ---------- Public ----------

  // GET /api/website-agreement?token=
  async function handleAgreementGet(request, env, corsHeaders, url) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    const client = await getClientByToken(env.DB, url.searchParams.get('token') || '');
    if (!client || client.status === 'canceled') return json({ ok: false, error: 'This link is not valid. Please contact Chris at (302) 907-9162.' }, 404, corsHeaders);
    const view = computeView(client);
    const today = todayIso();
    const paidThrough = client.current_period_end || '';
    const renewalOpen = !paidThrough || view.days_to_renewal <= 45;
    const signed = !!client.signed_at;
    return json({
      ok: true,
      businessName: client.business_name,
      contactName: client.contact_name || '',
      email: client.email || '',
      domainName: client.domain_name || '',
      previewUrl: client.preview_url || '',
      priceCents: Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS),
      agreementVersion: client.signed_at ? client.agreement_version : WEBSITE_AGREEMENT_VERSION,
      agreementText: client.signed_at && client.agreement_text ? client.agreement_text : renderAgreementText(client),
      signed: !!client.signed_at,
      signedAt: client.signed_at || '',
      signerName: client.signer_name || '',
      paidThrough,
      canPay: signed && !subscriptionLive(client),
      canPayOnce: signed && renewalOpen && !subscriptionLive(client),
      canAutopay: signed && !subscriptionLive(client),
      autopay: view.autopay,
      autopayEnding: view.autopay_ending,
      paymentFailed: ['past_due', 'unpaid'].includes(client.subscription_status || ''),
      canManageBilling: !!client.stripe_customer_id,
      status: view.status,
      today,
    }, 200, corsHeaders);
  }

  // POST /api/website-agreement/sign {token, signerName, signerTitle, signerEmail, agree}
  async function handleAgreementSign(request, env, corsHeaders) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    let data = {};
    try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid request' }, 400, corsHeaders); }
    const client = await getClientByToken(env.DB, clip(data.token, 64));
    if (!client || client.status === 'canceled') return json({ ok: false, error: 'This link is not valid.' }, 404, corsHeaders);

    if (!client.signed_at) {
      const signerName = clip(data.signerName, 120);
      const signerTitle = clip(data.signerTitle, 80);
      const signerEmail = clip(data.signerEmail, 200);
      if (data.agree !== true) return json({ ok: false, error: 'Please check the box to agree.' }, 400, corsHeaders);
      if (signerName.length < 3) return json({ ok: false, error: 'Please type your full name to sign.' }, 400, corsHeaders);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400, corsHeaders);
      if (clip(data.agreementVersion, 32) !== WEBSITE_AGREEMENT_VERSION) {
        return json({ ok: false, error: 'The agreement was updated. Please reload the page and review it again.' }, 409, corsHeaders);
      }
      const text = renderAgreementText(client);
      const hash = await sha256Hex(`${WEBSITE_AGREEMENT_VERSION}\n${text}`);
      await env.DB.prepare(
        `UPDATE website_clients
         SET signed_at = datetime('now'), signer_name = ?1, signer_title = ?2, signer_email = ?3,
             signer_ip = ?4, signer_user_agent = ?5, agreement_version = ?6, agreement_hash = ?7,
             agreement_text = ?9,
             email = COALESCE(NULLIF(email, ''), ?3),
             status = CASE WHEN status IN ('prospect', 'link_sent') THEN 'signed' ELSE status END,
             updated_at = datetime('now')
         WHERE id = ?8 AND signed_at IS NULL`
      ).bind(signerName, signerTitle, signerEmail, getClientIp(request), clip(request.headers.get('User-Agent'), 300),
        WEBSITE_AGREEMENT_VERSION, hash, client.id, text).run();

      // Signed copy to the client, and a heads-up to staff. Failures here don't block payment.
      const signedRow = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(client.id).first();
      const copyText = `Signed by ${signerName}${signerTitle ? `, ${signerTitle}` : ''} (${signerEmail}) on ${signedRow.signed_at} UTC.\nAgreement version ${WEBSITE_AGREEMENT_VERSION}. Fingerprint (SHA-256): ${hash}\n\n${text}`;
      try {
        await sendEmail(env, {
          to: signerEmail,
          subject: `Your signed website agreement - ${client.business_name}`,
          text: `Thanks for signing. Here is your copy.\n\n${copyText}\n\nYou can view it any time at ${agreementUrl(client.agreement_token)}`,
          html: emailShell(`<p>Thanks for signing. Here is your copy of the Website Care Agreement for <strong>${escapeHtml(client.business_name)}</strong>.</p><p><a href="${agreementUrl(client.agreement_token)}" style="color:#2563eb;">View it online any time</a></p><pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:14px;">${escapeHtml(copyText)}</pre>`),
        });
      } catch (e) { console.error('agreement copy email failed', e); }
      try {
        await sendStaffOperationalAlert(env, { subject: `Website agreement signed: ${client.business_name}`, text: `${signerName} signed for ${client.business_name}. They're being sent to Stripe Checkout now.` });
      } catch (e) { console.error('staff alert failed', e); }
    }

    const fresh = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(client.id).first();
    try {
      const checkoutUrl = await createCheckout(env, fresh, data.autopay !== false);
      return json({ ok: true, checkoutUrl }, 200, corsHeaders);
    } catch (e) {
      return json({ ok: false, error: 'Signed, but checkout could not start. Please try the Pay button again, or contact Chris.' }, 502, corsHeaders);
    }
  }

  // POST /api/website-agreement/checkout {token}  (renewals, or retry after signing)
  async function handleAgreementCheckout(request, env, corsHeaders) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    let data = {};
    try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid request' }, 400, corsHeaders); }
    const client = await getClientByToken(env.DB, clip(data.token, 64));
    if (!client || client.status === 'canceled') return json({ ok: false, error: 'This link is not valid.' }, 404, corsHeaders);
    if (!client.signed_at) return json({ ok: false, error: 'Please sign the agreement first.' }, 400, corsHeaders);
    try {
      return json({ ok: true, checkoutUrl: await createCheckout(env, client, data.autopay !== false) }, 200, corsHeaders);
    } catch (e) {
      return json({ ok: false, error: e.message || 'Checkout failed' }, 502, corsHeaders);
    }
  }

  // POST /api/website-agreement/portal {token} -> Stripe billing portal (update card, turn off auto-renew)
  async function handleAgreementPortal(request, env, corsHeaders) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    let data = {};
    try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid request' }, 400, corsHeaders); }
    const client = await getClientByToken(env.DB, clip(data.token, 64));
    if (!client || client.status === 'canceled') return json({ ok: false, error: 'This link is not valid.' }, 404, corsHeaders);
    if (!client.stripe_customer_id) return json({ ok: false, error: 'There is no card on file for this plan.' }, 400, corsHeaders);
    try {
      const portal = await stripeApi(env, 'POST', 'billing_portal/sessions', { customer: client.stripe_customer_id, return_url: agreementUrl(client.agreement_token) });
      return json({ ok: true, url: portal.url }, 200, corsHeaders);
    } catch (e) {
      console.error('billing portal failed', e);
      return json({ ok: false, error: 'Billing settings could not open right now. Please contact Chris and he will take care of it.' }, 502, corsHeaders);
    }
  }

  // Record one paid year: payments row, client active + paid-through date, income + Stripe fee.
  // `key` dedupes everything (checkout session id for one-time payments, invoice id for subscriptions).
  async function recordPayment(env, { client, key, amount, periodStart, periodEnd, paymentIntentId, eventCreated, autopay }) {
    const already = await env.DB.prepare(`SELECT id FROM website_client_payments WHERE stripe_session_id = ?1`).bind(key).first();
    if (already) return false;
    const today = todayIso();
    await env.DB.prepare(
      `INSERT INTO website_client_payments (client_id, stripe_session_id, stripe_payment_intent_id, amount_cents, period_start, period_end, paid_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
    ).bind(client.id, key, paymentIntentId || '', amount, periodStart, periodEnd).run();
    await env.DB.prepare(
      `UPDATE website_clients
       SET status = 'active',
           first_paid_at = COALESCE(first_paid_at, datetime('now')),
           current_period_start = CASE WHEN current_period_end IS NULL OR current_period_end < ?2 THEN ?1 ELSE current_period_start END,
           current_period_end = CASE WHEN current_period_end IS NULL OR current_period_end < ?2 THEN ?2 ELSE current_period_end END,
           last_paid_at = datetime('now'),
           stripe_payment_intent_id = ?3,
           renewal_link_sent_at = NULL,
           last_payment_failed_at = NULL,
           updated_at = datetime('now')
       WHERE id = ?4`
    ).bind(periodStart, periodEnd, paymentIntentId || '', client.id).run();

    // Books: income + Stripe fee (same pattern as invoices).
    const incomeDate = eventCreated ? new Date(eventCreated * 1000).toISOString().slice(0, 10) : today;
    const existingIncome = await env.DB.prepare(`SELECT id FROM tax_income WHERE stripe_session_id = ?1 LIMIT 1`).bind(key).first();
    if (!existingIncome?.id) {
      const notes = `Website Care Plan${autopay ? ' (auto-renew)' : ''} | ${client.business_name} | ${periodStart} to ${periodEnd} | stripe_ref=${key}`;
      const ins = await env.DB.prepare(
        `INSERT INTO tax_income (income_date, source, category, amount_cents, stripe_session_id, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(incomeDate, 'Stripe', 'Website Services', amount, key, notes).run();
      const incomeId = Number(ins.meta?.last_row_id || 0) || null;
      if (incomeId) {
        await upsertTaxIncomeJournal(env.DB, { id: incomeId, income_date: incomeDate, source: 'Stripe', category: 'Website Services', amount_cents: amount, notes });
      }
    }
    let feeCents = await fetchStripeFeeCents(env.STRIPE_SECRET_KEY, paymentIntentId);
    let estimated = false;
    if (!feeCents || feeCents <= 0) { feeCents = estimateStripeFeeCents(amount); estimated = true; }
    if (feeCents > 0) {
      const base = `Auto Stripe fee for website plan ${key}`;
      const existingFee = await env.DB.prepare(`SELECT id FROM tax_expenses WHERE notes IN (?1, ?2) LIMIT 1`).bind(base, `${base} (estimated)`).first();
      if (!existingFee?.id) {
        const feeNote = `${base}${estimated ? ' (estimated)' : ''}`;
        const insFee = await env.DB.prepare(
          `INSERT INTO tax_expenses (expense_date, vendor, category, amount_cents, paid_via, notes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        ).bind(incomeDate, 'Stripe', 'Payment Processing Fees', feeCents, 'stripe', feeNote).run();
        const feeId = Number(insFee.meta?.last_row_id || 0) || null;
        if (feeId) {
          await upsertTaxExpenseJournal(env.DB, { id: feeId, expense_date: incomeDate, vendor: 'Stripe', category: 'Payment Processing Fees', amount_cents: feeCents, paid_via: 'stripe', notes: feeNote });
        }
      }
    }
    try {
      await sendStaffOperationalAlert(env, { subject: `Website plan paid: ${client.business_name}`, text: `${formatUsd(amount)} received${autopay ? ' (automatic renewal)' : ''}. Paid through ${periodEnd}.` });
    } catch (e) { console.error('staff alert failed', e); }
    return true;
  }

  // checkout.session.completed with metadata.checkout_type = website_plan
  async function handleWebsitePlanPaid(env, event) {
    const session = event.data?.object || {};
    const sessionId = (session.id || '').toString();
    const clientId = Number(session.metadata?.website_client_id || 0);
    const amount = Math.round(Number(session.amount_total || 0));
    if (!clientId || !sessionId) return { ok: false, error: 'Invalid website plan metadata' };
    const client = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(clientId).first();
    if (!client) return { ok: false, error: 'Website client not found' };
    const today = todayIso();

    if (session.mode === 'subscription') {
      const subId = (session.subscription?.id || session.subscription || '').toString();
      const cusId = (session.customer?.id || session.customer || '').toString();
      await env.DB.prepare(
        `UPDATE website_clients
         SET stripe_customer_id = ?1, stripe_subscription_id = ?2,
             subscription_status = ?3, cancel_at_period_end = 0, updated_at = datetime('now')
         WHERE id = ?4`
      ).bind(cusId, subId, amount > 0 ? 'active' : 'trialing', clientId).run();
      if (amount > 0) {
        // First year charged now. invoice.paid for the same invoice is deduped by its id.
        const invoiceId = (session.invoice?.id || session.invoice || '').toString();
        const periodStart = clip(session.metadata?.period_start, 10) || today;
        await recordPayment(env, {
          client, key: invoiceId || sessionId, amount, periodStart, periodEnd: clip(session.metadata?.period_end, 10) || addOneYear(periodStart),
          paymentIntentId: invoiceId ? await paymentIntentForInvoice(env, invoiceId) : '', eventCreated: event.created, autopay: true,
        });
      } else {
        // Already paid ahead: card saved, first charge on the paid-through date.
        try {
          await sendStaffOperationalAlert(env, { subject: `Auto-renew turned on: ${client.business_name}`, text: `Card saved. First automatic charge on ${client.current_period_end || 'the renewal date'}.` });
        } catch (e) { console.error('staff alert failed', e); }
      }
      return { ok: true };
    }

    if (amount <= 0) return { ok: false, error: 'Invalid website plan amount' };
    const periodStart = clip(session.metadata?.period_start, 10) || today;
    await recordPayment(env, {
      client, key: sessionId, amount, periodStart, periodEnd: clip(session.metadata?.period_end, 10) || addOneYear(periodStart),
      paymentIntentId: (session.payment_intent || '').toString(), eventCreated: event.created, autopay: false,
    });
    const cusId = (session.customer || '').toString();
    if (cusId && !client.stripe_customer_id) {
      await env.DB.prepare(`UPDATE website_clients SET stripe_customer_id = ?1 WHERE id = ?2`).bind(cusId, clientId).run();
    }
    return { ok: true };
  }

  async function findClientForStripe(env, metadata, subscriptionId) {
    const meta = metadata || {};
    if (meta.checkout_type === 'website_plan' && Number(meta.website_client_id || 0)) {
      const row = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(Number(meta.website_client_id)).first();
      if (row) return row;
    }
    if (subscriptionId) {
      return env.DB.prepare(`SELECT * FROM website_clients WHERE stripe_subscription_id = ?1`).bind(subscriptionId).first();
    }
    return null;
  }

  // invoice.paid | invoice.payment_failed | invoice.upcoming | customer.subscription.updated | customer.subscription.deleted
  // Returns { handled: false } for events that don't belong to a website plan.
  async function handleWebsitePlanStripeEvent(env, event) {
    const obj = event.data?.object || {};
    const type = event.type || '';

    if (type.startsWith('invoice.')) {
      const sd = obj.subscription_details || obj.parent?.subscription_details || {};
      const subId = (obj.subscription?.id || obj.subscription || sd.subscription?.id || sd.subscription || '').toString();
      const client = await findClientForStripe(env, sd.metadata, subId);
      if (!client) return { handled: false };
      const line = (obj.lines?.data || [])[0] || {};
      const periodStart = line.period?.start ? unixToIso(line.period.start) : todayIso();
      const periodEnd = line.period?.end ? unixToIso(line.period.end) : addOneYear(periodStart);
      const link = agreementUrl(client.agreement_token);
      const to = clip(client.signer_email || client.email, 200);
      const hi = client.contact_name ? `Hi ${client.contact_name.split(' ')[0]},` : 'Hi,';

      if (type === 'invoice.paid') {
        if (subId && client.stripe_subscription_id !== subId) {
          await env.DB.prepare(`UPDATE website_clients SET stripe_subscription_id = ?1 WHERE id = ?2`).bind(subId, client.id).run();
        }
        await env.DB.prepare(`UPDATE website_clients SET subscription_status = 'active', updated_at = datetime('now') WHERE id = ?1`).bind(client.id).run();
        const amount = Math.round(Number(obj.amount_paid || 0));
        if (amount > 0 && obj.id) {
          await recordPayment(env, {
            client, key: obj.id, amount, periodStart, periodEnd,
            paymentIntentId: await paymentIntentForInvoice(env, obj), eventCreated: event.created, autopay: true,
          });
        }
        return { handled: true, ok: true };
      }

      if (type === 'invoice.payment_failed') {
        await env.DB.prepare(`UPDATE website_clients SET subscription_status = 'past_due', last_payment_failed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`).bind(client.id).run();
        if (Number(obj.attempt_count || 1) <= 1 && to) {
          const lines = [hi, '', `The automatic ${formatUsd(Number(obj.amount_due || client.annual_price_cents))} renewal for your ${client.business_name} website didn't go through. Your site is still online. The card will be tried again over the next few days, or you can update it any time with the "Manage billing" button here:`, '', link, '', 'Any questions, just reply or call or text (302) 907-9162.', 'Chris'];
          try {
            await sendEmail(env, { to, subject: `Card update needed for your ${client.business_name} website`, text: lines.join('\n'), html: emailShell(lines.map((l) => (l ? `<p style="margin:0 0 10px;">${l === link ? `<a href="${link}">${link}</a>` : escapeHtml(l)}</p>` : '')).join('')) });
          } catch (e) { console.error('failed-payment email failed', e); }
        }
        try {
          await sendStaffOperationalAlert(env, { subject: `Website plan card declined: ${client.business_name}`, text: `Automatic renewal failed (attempt ${obj.attempt_count || 1}). Stripe will retry. The client was emailed a link to update their card.` });
        } catch (e) { console.error('staff alert failed', e); }
        return { handled: true, ok: true };
      }

      if (type === 'invoice.upcoming') {
        if (!autopayOn(client) || client.renewal_reminder_sent_for === periodStart || !to) return { handled: true, ok: true };
        const price = formatUsd(Number(obj.amount_due || client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS));
        const when = new Date(`${periodStart}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        const lines = [hi, '', `Just a heads-up: your website plan for ${client.business_name} renews automatically on ${when} for ${price}. That covers another year of your domain, hosting, and any updates or new features you want.`, '', `Nothing to do on your end. If you need to update your card or turn off automatic renewal, use the "Manage billing" button here:`, '', link, '', 'Thanks for being a customer.', 'Chris'];
        try {
          await sendEmail(env, { to, subject: `Your ${client.business_name} website renews on ${when}`, text: lines.join('\n'), html: emailShell(lines.map((l) => (l ? `<p style="margin:0 0 10px;">${l === link ? `<a href="${link}">${link}</a>` : escapeHtml(l)}</p>` : '')).join('')) });
          await env.DB.prepare(`UPDATE website_clients SET renewal_reminder_sent_for = ?1, renewal_link_sent_at = datetime('now') WHERE id = ?2`).bind(periodStart, client.id).run();
        } catch (e) { console.error('renewal reminder email failed', e); }
        return { handled: true, ok: true };
      }
      return { handled: false };
    }

    if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const subId = (obj.id || '').toString();
      const client = await findClientForStripe(env, obj.metadata, subId);
      if (!client) return { handled: false };
      if (client.stripe_subscription_id && client.stripe_subscription_id !== subId) return { handled: true, ok: true }; // an older subscription
      const deleted = type === 'customer.subscription.deleted';
      const status = deleted ? 'canceled' : (obj.status || '').toString();
      const ending = deleted ? 0 : (obj.cancel_at_period_end || obj.cancel_at ? 1 : 0);
      const wasEnding = !!Number(client.cancel_at_period_end || 0);
      await env.DB.prepare(
        `UPDATE website_clients SET stripe_subscription_id = ?1, subscription_status = ?2, cancel_at_period_end = ?3,
           stripe_customer_id = COALESCE(NULLIF(stripe_customer_id, ''), ?4), updated_at = datetime('now') WHERE id = ?5`
      ).bind(subId, status, ending, (obj.customer?.id || obj.customer || '').toString(), client.id).run();
      let subject = '';
      let text = '';
      if (deleted && client.subscription_status !== 'canceled') {
        subject = `Auto-renew ended: ${client.business_name}`;
        text = `The yearly subscription ended (${obj.cancellation_details?.reason || 'canceled'}). Paid through ${client.current_period_end || 'n/a'}. If they're leaving, mark them Canceled in admin and do the domain/file handoff.`;
      } else if (ending && !wasEnding) {
        subject = `Auto-renew turned off: ${client.business_name}`;
        text = `They turned off automatic renewal. The site stays paid through ${client.current_period_end || 'n/a'}; nothing more will be charged.`;
      } else if (!ending && wasEnding && !deleted) {
        subject = `Auto-renew turned back on: ${client.business_name}`;
        text = `Automatic renewal is back on. Next charge ${client.current_period_end || 'at renewal'}.`;
      }
      if (subject) {
        try { await sendStaffOperationalAlert(env, { subject, text }); } catch (e) { console.error('staff alert failed', e); }
      }
      return { handled: true, ok: true };
    }
    return { handled: false };
  }

  // ---------- Admin ----------

  async function adminGuard(request, env, corsHeaders, url) {
    if (!env.DB) return { ok: false, res: json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders) };
    return requireAdmin(request, env, corsHeaders, url);
  }

  // GET /api/website-clients
  async function handleClientsList(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const rows = (await env.DB.prepare(`SELECT * FROM website_clients ORDER BY CASE status WHEN 'canceled' THEN 1 ELSE 0 END, COALESCE(current_period_end, '9999') ASC, created_at DESC`).all()).results || [];
    const pays = (await env.DB.prepare(`SELECT client_id, amount_cents, period_start, period_end, paid_at FROM website_client_payments ORDER BY paid_at DESC`).all()).results || [];
    const byClient = {};
    for (const p of pays) (byClient[p.client_id] ||= []).push(p);
    const clients = rows.map((r) => ({ ...computeView(r), payments: byClient[r.id] || [] }));
    const active = clients.filter((c) => c.status === 'active' || c.status === 'past_due');
    return json({
      ok: true,
      clients,
      summary: {
        active: clients.filter((c) => c.status === 'active').length,
        pastDue: clients.filter((c) => c.status === 'past_due').length,
        awaiting: clients.filter((c) => ['link_sent', 'signed'].includes(c.status)).length,
        renewingSoon: active.filter((c) => c.days_to_renewal != null && c.days_to_renewal <= 30).length,
        autopay: clients.filter((c) => c.autopay).length,
        annualRevenueCents: active.reduce((s, c) => s + Number(c.annual_price_cents || 0), 0),
      },
    }, 200, corsHeaders);
  }

  // POST /api/website-clients  {id?, businessName, contactName, email, phone, previewUrl, domainName, annualPriceCents, notes}
  async function handleClientSave(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    let d = {};
    try { d = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
    const businessName = clip(d.businessName, 160);
    if (!businessName) return json({ ok: false, error: 'Business name is required' }, 400, corsHeaders);
    const price = Math.max(0, Math.round(Number(d.annualPriceCents ?? WEBSITE_PLAN_PRICE_CENTS)));
    const vals = [businessName, clip(d.contactName, 120), clip(d.email, 200), clip(d.phone, 40), clip(d.previewUrl, 300), clip(d.domainName, 120), price, clip(d.notes, 4000)];
    const id = Number(d.id || 0);
    if (id) {
      const existing = await env.DB.prepare(`SELECT signed_at FROM website_clients WHERE id = ?1`).bind(id).first();
      if (!existing) return json({ ok: false, error: 'Client not found' }, 404, corsHeaders);
      // Business name, domain and price are part of the signed text; lock them once signed.
      if (existing.signed_at) {
        await env.DB.prepare(`UPDATE website_clients SET contact_name=?1, email=?2, phone=?3, preview_url=?4, notes=?5, updated_at=datetime('now') WHERE id=?6`)
          .bind(vals[1], vals[2], vals[3], vals[4], vals[7], id).run();
      } else {
        await env.DB.prepare(`UPDATE website_clients SET business_name=?1, contact_name=?2, email=?3, phone=?4, preview_url=?5, domain_name=?6, annual_price_cents=?7, notes=?8, updated_at=datetime('now') WHERE id=?9`)
          .bind(...vals, id).run();
      }
      return json({ ok: true, id }, 200, corsHeaders);
    }
    const ins = await env.DB.prepare(
      `INSERT INTO website_clients (business_name, contact_name, email, phone, preview_url, domain_name, annual_price_cents, notes, status, agreement_token)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'prospect', ?9)`
    ).bind(...vals, generateToken() + generateToken().slice(0, 8)).run();
    return json({ ok: true, id: Number(ins.meta?.last_row_id || 0) }, 200, corsHeaders);
  }

  // POST /api/website-clients/link {id, send: bool}  -> agreement/renewal link; optionally emails it
  async function handleClientLink(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    let d = {};
    try { d = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
    const id = Number(d.id || 0);
    const client = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(id).first();
    if (!client) return json({ ok: false, error: 'Client not found' }, 404, corsHeaders);
    if (client.status === 'canceled') return json({ ok: false, error: 'Client is canceled. Reactivate first.' }, 400, corsHeaders);
    const link = agreementUrl(client.agreement_token);
    const isRenewal = !!client.first_paid_at;
    let emailed = false;
    if (d.send) {
      const to = clip(client.email || client.signer_email, 200);
      if (!to) return json({ ok: false, error: 'Add an email address first, or copy the link and send it yourself.' }, 400, corsHeaders);
      const hi = client.contact_name ? `Hi ${client.contact_name.split(' ')[0]},` : 'Hi,';
      const price = formatUsd(Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS));
      const lines = isRenewal && autopayOn(client)
        ? [hi, '', `Your website plan for ${client.business_name} renews automatically on ${client.current_period_end} for ${price}. Nothing to do on your end.`, '', `To update your card or turn off automatic renewal, use "Manage billing" here: ${link}`, '', 'Thanks for being a customer.', 'Chris']
        : isRenewal
        ? [hi, '', `Your website plan for ${client.business_name} renews on ${client.current_period_end}. It's ${price} for another year: domain, hosting, and any updates or new features you need. You can also turn on automatic renewal so you never have to think about it.`, '', `Renew here: ${link}`, '', 'Thanks for being a customer.', 'Chris']
        : [hi, '', `Thanks for taking me up on the website for ${client.business_name}. Here's the short agreement to look over and sign, then you'll pay ${price} for the year on the next screen.`, '', link, '', 'Any questions, just reply, message me on Facebook, or call or text (302) 907-9162.', 'Chris'];
      try {
        await sendEmail(env, {
          to,
          subject: isRenewal ? (autopayOn(client) ? `Your ${client.business_name} website renews soon` : `Website renewal for ${client.business_name}`) : `Your website agreement for ${client.business_name}`,
          text: lines.join('\n'),
          html: emailShell(lines.map((l) => l === link
            ? `<p style="margin:16px 0;"><a href="${link}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;">${isRenewal ? (autopayOn(client) ? 'View my plan' : 'Renew my website') : 'Review and sign'}</a></p>`
            : (l ? `<p style="margin:0 0 10px;">${escapeHtml(l).replace(escapeHtml(link), `<a href="${link}">${link}</a>`)}</p>` : '')).join('')),
        });
        emailed = true;
      } catch (e) {
        return json({ ok: false, error: e.message || 'Email failed' }, 502, corsHeaders);
      }
    }
    if (isRenewal) {
      await env.DB.prepare(`UPDATE website_clients SET renewal_link_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`).bind(id).run();
    } else {
      await env.DB.prepare(`UPDATE website_clients SET link_sent_at = COALESCE(link_sent_at, datetime('now')), status = CASE WHEN status = 'prospect' THEN 'link_sent' ELSE status END, updated_at = datetime('now') WHERE id = ?1`).bind(id).run();
    }
    return json({ ok: true, link, emailed, isRenewal }, 200, corsHeaders);
  }

  // POST /api/website-clients/status {id, status}
  async function handleClientStatus(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    let d = {};
    try { d = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
    const status = clip(d.status, 20);
    if (!STATUSES.includes(status)) return json({ ok: false, error: 'Invalid status' }, 400, corsHeaders);
    if (status === 'canceled') {
      const row = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(Number(d.id || 0)).first();
      if (row && autopayOn(row)) {
        try { await stopAutopay(env, row); } catch (e) { return json({ ok: false, error: `Could not stop the Stripe auto-renewal: ${e.message}` }, 502, corsHeaders); }
      }
    }
    await env.DB.prepare(`UPDATE website_clients SET status = ?1, canceled_at = CASE WHEN ?1 = 'canceled' THEN datetime('now') ELSE NULL END, updated_at = datetime('now') WHERE id = ?2`).bind(status, Number(d.id || 0)).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // Ends the subscription at the end of the paid year (no refund, no more charges).
  async function stopAutopay(env, row) {
    const sub = await stripeApi(env, 'POST', `subscriptions/${encodeURIComponent(row.stripe_subscription_id)}`, { cancel_at_period_end: 'true' });
    await env.DB.prepare(`UPDATE website_clients SET cancel_at_period_end = 1, subscription_status = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind((sub.status || row.subscription_status || '').toString(), row.id).run();
  }

  // POST /api/website-clients/stop-autopay {id}
  async function handleClientStopAutopay(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    let d = {};
    try { d = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
    const row = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(Number(d.id || 0)).first();
    if (!row) return json({ ok: false, error: 'Client not found' }, 404, corsHeaders);
    if (!autopayOn(row)) return json({ ok: false, error: 'Automatic renewal is not on for this client.' }, 400, corsHeaders);
    try { await stopAutopay(env, row); } catch (e) { return json({ ok: false, error: e.message || 'Stripe update failed' }, 502, corsHeaders); }
    return json({ ok: true }, 200, corsHeaders);
  }

  // POST /api/website-clients/delete {id}  (only before any payment)
  async function handleClientDelete(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    let d = {};
    try { d = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }
    const id = Number(d.id || 0);
    const paid = await env.DB.prepare(`SELECT id FROM website_client_payments WHERE client_id = ?1 LIMIT 1`).bind(id).first();
    if (paid) return json({ ok: false, error: 'This client has payments on record. Mark them canceled instead.' }, 400, corsHeaders);
    await env.DB.prepare(`DELETE FROM website_clients WHERE id = ?1`).bind(id).run();
    return json({ ok: true }, 200, corsHeaders);
  }

  // GET /api/website-clients/agreement?id=  -> signed text for the admin
  async function handleClientAgreement(request, env, corsHeaders, url) {
    const auth = await adminGuard(request, env, corsHeaders, url);
    if (!auth.ok) return auth.res;
    const client = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(Number(url.searchParams.get('id') || 0)).first();
    if (!client) return json({ ok: false, error: 'Client not found' }, 404, corsHeaders);
    return json({
      ok: true,
      text: client.agreement_text || renderAgreementText(client),
      signedAt: client.signed_at, signerName: client.signer_name, signerTitle: client.signer_title, signerEmail: client.signer_email,
      signerIp: client.signer_ip, signerUserAgent: client.signer_user_agent, version: client.agreement_version, hash: client.agreement_hash,
    }, 200, corsHeaders);
  }

  return {
    handleAgreementGet, handleAgreementSign, handleAgreementCheckout, handleAgreementPortal,
    handleWebsitePlanPaid, handleWebsitePlanStripeEvent,
    handleClientsList, handleClientSave, handleClientLink, handleClientStatus, handleClientStopAutopay, handleClientDelete, handleClientAgreement,
  };
}
