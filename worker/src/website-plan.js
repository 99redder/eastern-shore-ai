// Website Care Plan: agreement e-signing, yearly Stripe checkout (price set per client;
// WEBSITE_PLAN_PRICE_CENTS is only the default), renewals, admin.
//
// Flow: admin adds a client -> sends agreement link -> client signs on
// /website-agreement.html?t=TOKEN -> Stripe Checkout (client's annual_price_cents; no tax line today) ->
// webhook marks the year paid and posts income + Stripe fee to the books.
// Renewal: automatic by default (Stripe subscription, yearly), or a one-time
// payment per year via the same link if the client prefers to pay by hand.
// Subscription payments are recorded from invoice.paid (keyed by invoice id),
// one-time payments from checkout.session.completed (keyed by session id).
import { sendEmail as deliverEmail, emailConfigured } from './email.js';

export const WEBSITE_AGREEMENT_VERSION = '2026-10-22.1';
export const WEBSITE_PLAN_PRICE_CENTS = 10000;

// Canonical agreement text. Placeholders: {{business}}, {{price}}, {{domain}}.
// Changing any wording requires bumping WEBSITE_AGREEMENT_VERSION so signed
// copies stay tied to the exact text the client saw.
export const WEBSITE_AGREEMENT_SECTIONS = [
  ['Parties', 'This Website Care Agreement ("Agreement") is between Eastern Shore AI, LLC, a Maryland limited liability company ("Provider"), and {{business}} ("Client"). It takes effect when Client signs it electronically below. The person signing confirms that they are authorized to sign for Client.'],
  ['What Provider does', 'For the annual fee, Provider will: (a) design, build, and publish Client\'s website; (b) register Client\'s domain name ({{domain}}) and renew it each year while this Agreement is active; (c) host the website and keep it online, secure, and working on phones and computers; (d) make content updates and changes Client asks for, such as text, photos, hours, prices, services, and new pages; (e) add new website features Client asks for as the business grows; (f) keep backup copies of the website and restore it if something goes wrong; and (g) optimize the website for search engines (SEO): page titles and descriptions, a search-friendly page structure, a sitemap and search engine crawler settings, business details in a format search engines read, fast loading on phones, and submitting the site to Google and Bing. SEO here means work on the website itself; it does not include paid advertising, and no particular ranking is guaranteed.'],
  ['Your plan page', 'Client has a private plan page where Client can view and print this Agreement, see the renewal date, update the payment card, and turn automatic renewal off or back on. Client can reach it any time by clicking "Manage My Website Plan" at the bottom of www.easternshore.ai, or by going to www.easternshore.ai/my-plan.html, and entering Client\'s email address; a private link is then emailed to Client. The link is also included in every email about the plan.'],
  ['Choosing a domain name', 'Client\'s first choice of domain name may already be registered by someone else, or held by a domain reseller asking far more than a normal registration price. Provider will work with Client to find a name Client likes, which may use a different spelling or wording, or an ending other than .com, such as .net, .org, or .biz. The plan covers registering one available domain name at a normal price; it does not include buying a name from a current owner or reseller.'],
  ['Unlimited updates, fair use', 'There is no limit on the number of update or feature requests, and none of them cost extra. Requests must relate to Client\'s website and must be lawful.'],
  ['Update and feature turnaround', 'Provider guarantees that updates, such as changes to text, photos, hours, prices, or services, will be completed within 24 hours of Client\'s request, and usually much sooner. New features, such as a new page, a form, or a photo gallery, will be completed within 2 to 3 days, and usually sooner. These times count every day of the week, including weekends and holidays, and start when Provider has the request and what is needed to make the change (for example the new text or photos). Larger projects, such as several new pages at once or a redesign, may take longer; Provider will give Client an expected timeline before starting and may complete them in stages. These times are paused while a renewal payment is late (see "Late renewal payments" below).'],
  ['What is not included', 'The annual fee does not cover: third-party paid services Client chooses to use (for example paid booking or scheduling software, email hosting such as Google Workspace, or paid plugins); payment processing or e-commerce transaction fees; paid advertising; printed materials; photography sessions; more than one domain name, a domain name the registrar sells at a premium price (over $25 a year), or buying a domain name from its current owner or a reseller; or work unrelated to Client\'s website. Provider will tell Client in advance if a request falls outside the plan, and nothing outside the plan will be charged without Client\'s written approval.'],
  ['Fee, taxes, and price lock', 'The fee is {{price}} per year, paid in advance. The fee includes any Maryland sales and use tax that applies to this service, so Client pays nothing more. As long as Client renews each year without a lapse of more than 30 days, Provider will not raise this annual fee.'],
  ['Term and renewal', 'The first term starts on the date of the first payment and lasts one year. Each renewal adds one year. Client chooses how to renew when paying and can switch at any time. With automatic renewal, Client\'s card is charged the annual fee on each renewal date until Client cancels. Provider will email Client a reminder between 15 and 45 days before each automatic charge. Client can turn off automatic renewal at any time before the renewal date with one click, using the "Turn off automatic renewal" button on Client\'s plan page (see "Your plan page" above), or by contacting Provider in any way. No further charges are made after that, and the website stays online through the end of the paid year. With manual renewal, nothing is charged unless Client pays, and Provider will send a renewal link about 30 days before each renewal date.'],
  ['Late renewal payments', 'A renewal payment is late if it has not been received by the renewal date, including when an automatic charge fails. While a payment is late: (a) the website stays online for 30 days after the renewal date; (b) new update and feature requests wait until the payment is made, and the turnaround times above start once it is; (c) if the payment still has not been made 30 days after the renewal date, Provider may take the website offline until it is, after emailing Client at least 7 days beforehand; and (d) Provider may keep the domain name renewed so Client does not lose it, and Client must repay that cost before the domain is transferred to Client (see "Domain, ownership, and handoff" below). If Client pays while the website is offline, Provider will put it back online within 24 hours of payment. If the payment still has not been made 90 days after the renewal date, this Agreement ends, and Client may request the domain and website files as described in "Domain, ownership, and handoff" below. The domain stays registered in Client\'s name throughout.'],
  ['Domain, ownership, and handoff', 'The domain name is registered with Client listed as the registrant, and it belongs to Client. Client owns its business name, logo, photos, and all content it provides, and owns the finished website. Provider keeps ownership of its general tools, code, templates, and know-how that are not specific to Client, and gives Client a permanent, royalty-free license to keep using any of them that are part of the finished website. Third-party items such as fonts, open-source code, and licensed images stay subject to their own licenses. If this Agreement ends for any reason, Provider will, within 10 business days of Client\'s request, transfer the domain to an account Client controls and give Client a copy of the website files. If Provider paid to renew the domain for any time after the end of Client\'s last paid year (for example because Client canceled or did not pay a renewal), Client must repay that domain renewal cost before the domain is transferred. Provider may delete its copies 60 days after this Agreement ends.'],
  ['Client content and approval', 'Client will provide accurate business information and will only provide content (text, photos, logos) that Client owns or has permission to use. Client will review the website, including anything Provider writes or adds at Client\'s request, and is responsible for the accuracy of business claims such as prices, hours, licenses, warranties, and offers. Provider will not keep photos taken by others (for example customer photos from online reviews) on the website without Client\'s approval, and will replace them with Client\'s own photos when Client provides them.'],
  ['Laws, accessibility, and privacy', 'Provider builds the website with reasonable care to be readable, mobile-friendly, and accessible, but does not guarantee that it meets every legal or accessibility standard (such as the ADA or WCAG). Client is responsible for making sure its business, products, services, and claims on the website comply with the law. If the website collects visitor information (for example through a contact form), Provider will use that information only to run the website and deliver messages to Client, will not sell it, and will protect it with reasonable security measures.'],
  ['Confidentiality and account access', 'Each party will keep the other\'s non-public business information confidential. If Client shares login information (for example for a Google Business Profile or social media page), Provider will use it only to perform the services and will stop using it when Client asks or when this Agreement ends.'],
  ['Indemnity', 'Client will defend and hold Provider harmless from third-party claims arising from content Client provides or approves, or from Client\'s products, services, or business practices. Provider will defend and hold Client harmless from third-party claims that original material Provider created for the website (not material provided by Client or by third parties) infringes someone else\'s copyright.'],
  ['Cancellation, refunds, and termination', 'Client may cancel at any time by contacting Provider or by turning off automatic renewal. Canceling stops all future charges. Client may cancel within 14 days of the first payment for a full refund, and keeps the domain name. After that, payments are not refunded, and the website stays online through the end of the paid year. Provider may end this Agreement with 30 days\' notice, in which case Provider will refund the unused portion of the current year and complete the domain and file handoff described above. Either party may end this Agreement if the other materially breaches it and does not fix the breach within 10 days after notice. Provider may suspend the website immediately if it is being used for unlawful activity or poses a security risk, and will tell Client right away.'],
  ['Availability and warranties', 'Provider will use reasonable care to keep the website online and secure, but cannot guarantee uninterrupted service, and does not guarantee any particular search ranking, traffic, or sales. Provider is not responsible for outages or changes caused by third-party providers such as hosting networks, domain registrars, or payment processors, but will work to restore service promptly. Except as stated in this Agreement, the services are provided "as is," and Provider makes no other warranties, express or implied, including warranties of merchantability or fitness for a particular purpose.'],
  ['Limit of liability', 'Each party\'s total liability under this Agreement is limited to the fees Client paid in the 12 months before the claim. Neither party is liable for indirect or consequential damages, such as lost profits or lost business. These limits do not apply to fees Client owes or to either party\'s obligations under the Indemnity section.'],
  ['Events outside anyone\'s control', 'Neither party is responsible for delays or failures caused by events outside its reasonable control, such as severe weather, natural disasters, power or internet outages, or failures of third-party providers.'],
  ['Relationship and notices', 'Provider is an independent contractor, not an employee or partner of Client. Notices under this Agreement may be sent by email: to Client at the email address on file, and to Provider at contact@easternshore.ai.'],
  ['Portfolio', 'Client agrees that Provider may feature the website in the Website Design portfolio on easternshore.ai and in Provider\'s own marketing, including social media. A feature may show the business name, logo, screenshots of the website, a link to it, and a short description of the work. Provider will never share Client\'s private information or customer data in a feature. Client can ask Provider to remove a feature at any time, and Provider will take it down within 10 business days.'],
  ['General', 'This Agreement is governed by the laws of the State of Maryland, with venue in the courts of Wicomico County. It is the entire agreement between the parties about the website and can only be changed in writing (email is fine) agreed to by both parties. If any part of this Agreement is found unenforceable, the rest stays in effect. Not enforcing a term is not a waiver of it. Neither party may transfer this Agreement without the other\'s consent, except to a successor that takes over its business, with notice. Sections that by their nature should continue after this Agreement ends (including ownership and handoff, confidentiality, indemnity, and limit of liability) will continue. Both parties agree to sign and receive this Agreement, notices, and receipts electronically, and that signing electronically has the same effect as signing on paper. Client may ask for a paper copy at any time.'],
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

  const MANAGE_URL = `${SITE}/my-plan.html`;
  const MANAGE_TEXT = `Manage your plan any time, even if you lose this email: click "Manage My Website Plan" at the bottom of www.easternshore.ai, or go to ${MANAGE_URL}. You can view your agreement, see your renewal date, update your card, and turn automatic renewal on or off.`;

  async function sendEmail(env, { to, subject, html, text, manage = true }) {
    if (!emailConfigured(env) || !env.FROM_EMAIL) throw new Error('Email provider is not configured');
    if (manage && text && !text.includes(MANAGE_URL)) text = `${text}\n\n---\n${MANAGE_TEXT}`;
    const payload = { from: env.FROM_EMAIL, to: [to], subject, html, text, reply_to: 'contact@easternshore.ai' };
    if (env.BCC_EMAIL) payload.bcc = [env.BCC_EMAIL];
    const res = await deliverEmail(env, payload);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to send email');
    return data?.id || null;
  }

  // Branded, spam-safe email layout: tables + inline styles, one small logo on our
  // own domain, no tracking pixels, text-heavy. Always send a plain-text part too.
  function emailShell(innerHtml, { preheader = '', heading = '', manage = true } = {}) {
    const font = "font-family:Arial,Helvetica,sans-serif;";
    const link = 'color:#0E6E86;text-decoration:none;';
    return `<div style="margin:0;padding:24px 12px;background:#EEF0F3;${font}">`
      + (preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EEF0F3;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>` : '')
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #DDE1E6;border-radius:10px;border-collapse:separate;">`
      + `<tr><td style="background:#0A0B10;padding:18px 26px;border-radius:10px 10px 0 0;">`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td style="vertical-align:middle;"><img src="${SITE}/images/esai-badge.jpg" width="46" height="42" alt="Eastern Shore AI" style="display:block;border:0;border-radius:6px;"></td>`
      + `<td style="vertical-align:middle;padding-left:12px;${font}"><div style="color:#FFFFFF;font-size:17px;font-weight:bold;line-height:1.2;">Eastern Shore AI</div><div style="color:#7FE8FF;font-size:12px;line-height:1.4;">Websites for local businesses</div></td>`
      + `</tr></table></td></tr>`
      + `<tr><td style="height:3px;line-height:3px;font-size:0;background:#00B8D4;">&nbsp;</td></tr>`
      + `<tr><td style="padding:28px 28px 10px;color:#15181D;font-size:15px;line-height:1.6;${font}">`
      + (heading ? `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#15181D;${font}">${escapeHtml(heading)}</h1>` : '')
      + innerHtml
      + `</td></tr>`
      + (manage ? `<tr><td style="padding:6px 28px 24px;${font}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF7F9;border:1px solid #CFE6EC;border-radius:8px;"><tr><td style="padding:14px 16px;${font}font-size:13px;line-height:1.6;color:#2A3B42;">`
        + `<strong style="color:#0A5568;font-size:14px;">Manage your plan any time</strong><br>`
        + `Click <strong>"Manage My Website Plan"</strong> at the bottom of <a href="${SITE}" style="${link}">www.easternshore.ai</a>, or go to <a href="${SITE}/my-plan.html" style="${link}">easternshore.ai/my-plan.html</a>. You can view your agreement, see your renewal date, update your card, and turn automatic renewal on or off. Bookmark it so you always have it.`
        + `</td></tr></table></td></tr>` : '')
      + `<tr><td style="padding:18px 28px 22px;border-top:1px solid #E5E7EB;background:#F7F8FA;border-radius:0 0 10px 10px;color:#5B6370;font-size:12px;line-height:1.7;${font}">`
      + `<strong style="color:#15181D;">Eastern Shore AI, LLC</strong> &middot; Fruitland, Maryland<br>`
      + `<a href="${SITE}" style="${link}">www.easternshore.ai</a> &middot; <a href="mailto:contact@easternshore.ai" style="${link}">contact@easternshore.ai</a> &middot; <a href="tel:+13029079162" style="${link}">(302) 907-9162</a> &middot; <a href="https://www.facebook.com/easternshoreai" style="${link}">Facebook</a><br>`
      + `<span style="color:#7A818C;">You're receiving this about your website plan with Eastern Shore AI. Just reply if you have a question.</span>`
      + `</td></tr></table></div>`;
  }

  function emailButton(href, label) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="border-radius:8px;background:#0E6E86;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;
  }

  function etDateTime(utc) {
    if (!utc) return '';
    const d = new Date(`${String(utc).replace(' ', 'T')}Z`);
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  }

  // Paragraph list -> email HTML. Lines equal to `link` become a button.
  function linesToEmailHtml(lines, link, buttonLabel) {
    return lines.map((l) => {
      if (!l) return '';
      if (link && l === link) return emailButton(link, buttonLabel);
      let html = escapeHtml(l);
      if (link) html = html.replace(escapeHtml(link), `<a href="${link}" style="color:#0E6E86;">${escapeHtml(link)}</a>`);
      return `<p style="margin:0 0 12px;">${html}</p>`;
    }).join('');
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
          ? `Already paid through ${client.current_period_end}. Renews automatically each year starting then. Cancel any time. Price includes Maryland sales tax.`
          : 'Domain, hosting, unlimited updates and new features. Renews automatically each year. Cancel any time. Price includes Maryland sales tax.').slice(0, 500),
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
        'line_items[0][price_data][product_data][description]': `Domain, hosting, unlimited updates and new features. ${periodStart} to ${periodEnd}. Does not renew automatically. Price includes Maryland sales tax.`,
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

  function signedCopyHtml({ client, signerName, signerTitle, signerEmail, signedAt, hash, text }) {
    const first = (signerName || '').split(' ')[0];
    const row = (k, v) => `<tr><td style="padding:7px 12px 7px 0;color:#5B6370;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:7px 0;font-size:14px;color:#15181D;vertical-align:top;">${v}</td></tr>`;
    const price = formatUsd(Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS));
    const details = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;margin:6px 0 4px;">`
      + row('Business', escapeHtml(client.business_name))
      + row('Signed by', `${escapeHtml(signerName)}${signerTitle ? `, ${escapeHtml(signerTitle)}` : ''}<br><span style="color:#5B6370;font-size:13px;">${escapeHtml(signerEmail)}</span>`)
      + row('Signed on', escapeHtml(etDateTime(signedAt)))
      + row('Plan', `${escapeHtml(price)} per year`)
      + (client.domain_name ? row('Domain', escapeHtml(client.domain_name)) : '')
      + row('Version', escapeHtml(WEBSITE_AGREEMENT_VERSION))
      + `</table>`
      + `<p style="margin:6px 0 0;color:#7A818C;font-size:11px;line-height:1.5;word-break:break-all;">Document fingerprint (SHA-256): ${escapeHtml(hash)}</p>`;
    const terms = text.split(/\n\n/).map((block) => {
      const [head, ...rest] = block.split('\n');
      return `<p style="margin:16px 0 4px;font-size:14px;font-weight:bold;color:#15181D;">${escapeHtml(head)}</p><p style="margin:0;font-size:13px;line-height:1.6;color:#3A404A;">${escapeHtml(rest.join(' '))}</p>`;
    }).join('');
    return `<p style="margin:0 0 12px;">Thanks${first ? `, ${escapeHtml(first)}` : ''}. Here's your copy of the Website Care Agreement for <strong>${escapeHtml(client.business_name)}</strong>. Please keep it for your records.</p>`
      + details
      + emailButton(agreementUrl(client.agreement_token), 'View or print online')
      + `<div style="margin:8px 0 0;padding:4px 18px 18px;background:#F7F8FA;border:1px solid #E5E7EB;border-radius:8px;">${terms}</div>`
      + `<p style="margin:20px 0 0;">Any questions, just reply to this email.</p><p style="margin:4px 0 0;">Chris<br><span style="color:#5B6370;">Eastern Shore AI, LLC</span></p>`;
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
      const copyText = `Signed by ${signerName}${signerTitle ? `, ${signerTitle}` : ''} (${signerEmail}) on ${etDateTime(signedRow.signed_at)}.\nAgreement version ${WEBSITE_AGREEMENT_VERSION}. Fingerprint (SHA-256): ${hash}\n\n${text}`;
      try {
        await sendEmail(env, {
          to: signerEmail,
          subject: `Your signed website agreement - ${client.business_name}`,
          text: `Thanks for signing. Here is your copy of the Website Care Agreement for ${client.business_name}. Please keep it for your records.\n\nView or print it any time: ${agreementUrl(client.agreement_token)}\n\n${copyText}\n\nChris\nEastern Shore AI, LLC\nwww.easternshore.ai | contact@easternshore.ai | (302) 907-9162`,
          html: emailShell(signedCopyHtml({ client, signerName, signerTitle, signerEmail, signedAt: signedRow.signed_at, hash, text }), {
            heading: 'Your signed agreement',
            preheader: `Your copy of the Website Care Agreement for ${client.business_name}.`,
          }),
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

  // POST /api/website-agreement/autopay {token, on: bool}
  // One-click turn off (or back on) of automatic renewal from the client's own page. No login needed:
  // the private agreement link is the credential. Off = cancel at period end (no refund, no more charges).
  async function handleAgreementAutopay(request, env, corsHeaders) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    let data = {};
    try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid request' }, 400, corsHeaders); }
    const client = await getClientByToken(env.DB, clip(data.token, 64));
    if (!client) return json({ ok: false, error: 'This link is not valid.' }, 404, corsHeaders);
    if (!subscriptionLive(client)) return json({ ok: false, error: 'Automatic renewal is not set up for this plan.' }, 400, corsHeaders);
    const on = data.on === true;
    try {
      const sub = await stripeApi(env, 'POST', `subscriptions/${encodeURIComponent(client.stripe_subscription_id)}`, { cancel_at_period_end: on ? 'false' : 'true' });
      await env.DB.prepare(`UPDATE website_clients SET cancel_at_period_end = ?1, subscription_status = ?2, updated_at = datetime('now') WHERE id = ?3`)
        .bind(on ? 0 : 1, (sub.status || client.subscription_status || '').toString(), client.id).run();
    } catch (e) {
      console.error('autopay toggle failed', e);
      return json({ ok: false, error: 'That did not go through. Please try again, or contact Chris and he will take care of it right away.' }, 502, corsHeaders);
    }
    try {
      await sendStaffOperationalAlert(env, {
        subject: on ? `Auto-renew turned back on: ${client.business_name}` : `Auto-renew turned off: ${client.business_name}`,
        text: on ? `They turned automatic renewal back on from their plan page. Next charge ${client.current_period_end || 'at renewal'}.`
          : `They turned off automatic renewal from their plan page. Paid through ${client.current_period_end || 'n/a'}; nothing more will be charged.`,
      });
    } catch (e) { console.error('staff alert failed', e); }
    const to = clip(client.signer_email || client.email, 200);
    if (to && !on) {
      const when = client.current_period_end ? new Date(`${client.current_period_end}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : 'the end of your paid year';
      const link = agreementUrl(client.agreement_token);
      const lines = ['Hi,', '', `Automatic renewal is now off for your ${client.business_name} website plan. You won't be charged again. Your website stays online through ${when}.`, '', 'Changed your mind? You can turn it back on any time from your plan page:', '', link, '', 'Chris'];
      try {
        await sendEmail(env, { to, subject: `Automatic renewal is off: ${client.business_name}`, text: lines.join('\n'), html: emailShell(linesToEmailHtml(lines, link, 'View my plan'), { heading: 'Automatic renewal turned off', preheader: `You won't be charged again. Your site stays online through ${when}.` }) });
      } catch (e) { console.error('autopay-off confirmation email failed', e); }
    }
    return json({ ok: true, autopay: on }, 200, corsHeaders);
  }

  // POST /api/website-plan/find {email, website?}
  // "Manage my website plan": emails the plan link(s) for a matching client. Always answers the same
  // way so nobody can learn whether an email is a client. One email per client per 10 minutes.
  async function handleFindPlan(request, env, corsHeaders) {
    if (!env.DB) return json({ ok: false, error: 'DB binding missing' }, 500, corsHeaders);
    let data = {};
    try { data = await request.json(); } catch { return json({ ok: false, error: 'Invalid request' }, 400, corsHeaders); }
    const generic = { ok: true, message: "If that email matches a website plan, we've sent it a link to your plan page. Check your inbox (and spam folder) in a minute." };
    if (clip(data.website, 200)) return json(generic, 200, corsHeaders); // honeypot
    const email = clip(data.email, 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'Please enter a valid email address.' }, 400, corsHeaders);
    const rows = (await env.DB.prepare(
      `SELECT * FROM website_clients
       WHERE status != 'canceled' AND (lower(email) = ?1 OR lower(signer_email) = ?1)
         AND (plan_link_requested_at IS NULL OR plan_link_requested_at < datetime('now', '-10 minutes'))
       ORDER BY id LIMIT 10`
    ).bind(email).all()).results || [];
    if (!rows.length) return json(generic, 200, corsHeaders);
    for (const r of rows) {
      await env.DB.prepare(`UPDATE website_clients SET plan_link_requested_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
    }
    const items = rows.map((r) => ({ name: r.business_name, link: agreementUrl(r.agreement_token) }));
    const lines = ['Hi,', '', items.length === 1
      ? `Here's the link to your website plan page for ${items[0].name}. You can view and print your agreement, check your renewal date, update your card, or turn automatic renewal on or off.`
      : 'Here are the links to your website plan pages. On each one you can view and print your agreement, check your renewal date, update your card, or turn automatic renewal on or off.', ''];
    for (const it of items) { if (items.length > 1) lines.push(it.name); lines.push(it.link, ''); }
    lines.push("Didn't ask for this? You can ignore this email. The link only works for you, so keep it private.", '', 'Chris');
    const htmlBody = lines.map((l) => {
      if (!l) return '';
      const hit = items.find((it) => it.link === l);
      if (hit) return emailButton(hit.link, items.length > 1 ? `Open plan: ${hit.name}` : 'Open my plan page');
      return `<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`;
    }).join('');
    try {
      await sendEmail(env, { to: email, subject: 'Your website plan link', text: lines.join('\n'), html: emailShell(htmlBody, { heading: 'Your website plan', preheader: 'Here is the link to your website plan page.', manage: false }), manage: false });
    } catch (e) { console.error('plan link email failed', e); }
    return json(generic, 200, corsHeaders);
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
    // Owner test clients: the owner paid with personal money, so it's an owner
    // contribution (equity, account 3100), not revenue. The Stripe fee is still a real expense.
    const ownerTest = Number(client.is_owner_test || 0) === 1;
    const category = ownerTest ? 'Owner Funded (Non-Revenue)' : 'Website Services';
    const source = ownerTest ? 'Stripe (owner test payment)' : 'Stripe';
    const existingIncome = await env.DB.prepare(`SELECT id FROM tax_income WHERE stripe_session_id = ?1 LIMIT 1`).bind(key).first();
    if (!existingIncome?.id) {
      const notes = `Website Care Plan${ownerTest ? ' owner test' : ''}${autopay ? ' (auto-renew)' : ''} | ${client.business_name} | ${periodStart} to ${periodEnd} | stripe_ref=${key}`;
      const ins = await env.DB.prepare(
        `INSERT INTO tax_income (income_date, source, category, amount_cents, stripe_session_id, notes, is_owner_funded) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      ).bind(incomeDate, source, category, amount, key, notes, ownerTest ? 1 : 0).run();
      const incomeId = Number(ins.meta?.last_row_id || 0) || null;
      if (incomeId) {
        await upsertTaxIncomeJournal(env.DB, { id: incomeId, income_date: incomeDate, source, category, amount_cents: amount, notes, is_owner_funded: ownerTest ? 1 : 0 });
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
      await sendStaffOperationalAlert(env, { subject: `Website plan paid: ${client.business_name}`, text: `${formatUsd(amount)} received${autopay ? ' (automatic renewal)' : ''}. Paid through ${periodEnd}.${ownerTest ? ' Owner test: booked as an owner contribution, not income.' : ''}` });
    } catch (e) { console.error('staff alert failed', e); }
    // Client confirmation: "You're all set" (first payment) or "Renewal received".
    const to = clip(client.signer_email || client.email, 200);
    if (to) {
      const first = !client.first_paid_at;
      const nice = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      const fresh = await env.DB.prepare(`SELECT * FROM website_clients WHERE id = ?1`).bind(client.id).first();
      const autoOn = fresh ? autopayOn(fresh) || (autopay && !Number(fresh.cancel_at_period_end || 0)) : autopay;
      const hi = client.contact_name ? `Hi ${client.contact_name.split(' ')[0]},` : 'Hi,';
      const link = agreementUrl(client.agreement_token);
      const lines = first
        ? [hi, '', `Thank you! Your payment of ${formatUsd(amount)} went through, and your website plan for ${client.business_name} is active through ${nice(periodEnd)}.`, '',
            autoOn ? `Automatic renewal is on, so it renews on ${nice(periodEnd)}. You'll get a reminder email before then, and you can turn it off with one click any time.` : `Your plan does not renew automatically. I'll send you a renewal link before ${nice(periodEnd)}.`, '',
            "I'll be in touch shortly about your domain name and anything you'd like changed on the site. Send me updates any time by replying to this email.", '',
            'Your plan page has your signed agreement and all your plan settings:', '', link, '', 'Chris']
        : [hi, '', `Thanks! Your ${formatUsd(amount)} renewal for ${client.business_name} went through. Your website plan is now active through ${nice(periodEnd)}.`, '',
            autoOn ? `Automatic renewal stays on. You can turn it off with one click any time on your plan page:` : 'Your plan page has your agreement and renewal settings:', '', link, '', 'Thanks for being a customer.', 'Chris'];
      try {
        await sendEmail(env, {
          to,
          subject: first ? `You're all set: ${client.business_name} website plan` : `Renewal received: ${client.business_name} website plan`,
          text: lines.join('\n'),
          html: emailShell(linesToEmailHtml(lines, link, 'Open my plan page'), { heading: first ? "You're all set" : 'Renewal received', preheader: `Your website plan is active through ${nice(periodEnd)}.` }),
        });
      } catch (e) { console.error('payment confirmation email failed', e); }
    }
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
          const lines = [hi, '', `The automatic ${formatUsd(Number(obj.amount_due || client.annual_price_cents))} renewal for your ${client.business_name} website didn't go through. Your site is still online. The card will be tried again over the next few days, or you can update it any time with the "Manage billing" button on your plan page:`, '', link, '', 'Any questions, just reply or call or text (302) 907-9162.', 'Chris'];
          try {
            await sendEmail(env, { to, subject: `Card update needed for your ${client.business_name} website`, text: lines.join('\n'), html: emailShell(linesToEmailHtml(lines, link, 'Update my card'), { heading: 'Card update needed', preheader: 'Your website renewal payment did not go through.' }) });
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
        const lines = [hi, '', `Just a heads-up: your website plan for ${client.business_name} renews automatically on ${when} for ${price}. That covers another year of your domain, hosting, and any updates or new features you want.`, '', `Nothing to do on your end. Don't want to renew? You can turn off automatic renewal with one click on your plan page, and you can update your card there too:`, '', link, '', 'Thanks for being a customer.', 'Chris'];
        try {
          await sendEmail(env, { to, subject: `Your ${client.business_name} website renews on ${when}`, text: lines.join('\n'), html: emailShell(linesToEmailHtml(lines, link, 'View my plan'), { heading: 'Renewal reminder', preheader: `Your ${client.business_name} website renews on ${when}.` }) });
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
        annualRevenueCents: active.filter((c) => !Number(c.is_owner_test || 0)).reduce((s, c) => s + Number(c.annual_price_cents || 0), 0),
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
    const price = Math.round(Number(d.annualPriceCents ?? WEBSITE_PLAN_PRICE_CENTS));
    if (!Number.isFinite(price) || price < 100) return json({ ok: false, error: 'Price must be at least $1.00 per year.' }, 400, corsHeaders);
    const vals = [businessName, clip(d.contactName, 120), clip(d.email, 200), clip(d.phone, 40), clip(d.previewUrl, 300), clip(d.domainName, 120), price, clip(d.notes, 4000)];
    const id = Number(d.id || 0);
    const ownerTest = d.isOwnerTest ? 1 : 0;
    if (id) {
      const existing = await env.DB.prepare(`SELECT signed_at, is_owner_test FROM website_clients WHERE id = ?1`).bind(id).first();
      if (!existing) return json({ ok: false, error: 'Client not found' }, 404, corsHeaders);
      const ownerTestChanged = Number(existing.is_owner_test || 0) !== ownerTest;
      // Business name, domain and price are part of the signed text; lock them once signed.
      if (existing.signed_at) {
        await env.DB.prepare(`UPDATE website_clients SET contact_name=?1, email=?2, phone=?3, preview_url=?4, notes=?5, is_owner_test=?6, updated_at=datetime('now') WHERE id=?7`)
          .bind(vals[1], vals[2], vals[3], vals[4], vals[7], ownerTest, id).run();
      } else {
        await env.DB.prepare(`UPDATE website_clients SET business_name=?1, contact_name=?2, email=?3, phone=?4, preview_url=?5, domain_name=?6, annual_price_cents=?7, notes=?8, is_owner_test=?9, updated_at=datetime('now') WHERE id=?10`)
          .bind(...vals, ownerTest, id).run();
      }
      const rebooked = ownerTestChanged ? await rebookClientIncome(env, id, ownerTest) : 0;
      return json({ ok: true, id, rebooked }, 200, corsHeaders);
    }
    const ins = await env.DB.prepare(
      `INSERT INTO website_clients (business_name, contact_name, email, phone, preview_url, domain_name, annual_price_cents, notes, status, agreement_token, is_owner_test)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'prospect', ?9, ?10)`
    ).bind(...vals, generateToken() + generateToken().slice(0, 8), ownerTest).run();
    return json({ ok: true, id: Number(ins.meta?.last_row_id || 0) }, 200, corsHeaders);
  }

  // Re-book a client's already-posted payments when the Owner test flag changes:
  // owner test -> Owner Funded (Non-Revenue) / 3100 Owner Contributions; otherwise Website Services revenue.
  async function rebookClientIncome(env, clientId, ownerTest) {
    const pays = (await env.DB.prepare(`SELECT stripe_session_id FROM website_client_payments WHERE client_id = ?1`).bind(clientId).all()).results || [];
    let n = 0;
    for (const p of pays) {
      const row = await env.DB.prepare(`SELECT * FROM tax_income WHERE stripe_session_id = ?1 LIMIT 1`).bind(p.stripe_session_id).first();
      if (!row) continue;
      const category = ownerTest ? 'Owner Funded (Non-Revenue)' : 'Website Services';
      const source = ownerTest ? 'Stripe (owner test payment)' : 'Stripe';
      await env.DB.prepare(`UPDATE tax_income SET category = ?1, source = ?2, is_owner_funded = ?3 WHERE id = ?4`).bind(category, source, ownerTest, row.id).run();
      await upsertTaxIncomeJournal(env.DB, { ...row, category, source, is_owner_funded: ownerTest });
      n++;
    }
    return n;
  }

  // POST /api/website-clients/link {id, send?, preview?, subject?, body?}
  //   preview: returns the default (or edited) subject/body plus the rendered HTML, changes nothing.
  //   send:    emails it (using the edited subject/body when given) and records the send.
  //   neither: just returns the link (Copy Link).
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
    const auto = isRenewal && autopayOn(client);
    const to = clip(client.email || client.signer_email, 200);

    const hi = client.contact_name ? `Hi ${client.contact_name.split(' ')[0]},` : 'Hi,';
    const price = formatUsd(Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS));
    const renewOn = client.current_period_end
      ? new Date(`${client.current_period_end}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
      : '';
    const defaultLines = auto
      ? [hi, '', `Your website plan for ${client.business_name} renews automatically on ${renewOn} for ${price}. Nothing to do on your end.`, '', 'To update your card, or to turn off automatic renewal with one click, open your plan page:', '', link, '', 'Thanks for being a customer.', 'Chris']
      : isRenewal
      ? [hi, '', `Your website plan for ${client.business_name} renews on ${renewOn}. It's ${price} for another year: domain, hosting, and any updates or new features you need. You can also turn on automatic renewal so you never have to think about it.`, '', link, '', 'Thanks for being a customer.', 'Chris']
      : [hi, '', `Thanks for taking me up on the website for ${client.business_name}. Here's the short agreement to look over and sign, then you'll pay ${price} for the year on the next screen.`, '', link, '', 'Any questions, just reply, message me on Facebook, or call or text (302) 907-9162.', 'Chris'];
    const defaultSubject = isRenewal
      ? (auto ? `Your ${client.business_name} website renews soon` : `Website renewal for ${client.business_name}`)
      : `Your website agreement for ${client.business_name}`;

    const subject = clip(d.subject, 200) || defaultSubject;
    const body = typeof d.body === 'string' && d.body.trim() ? d.body.replace(/\r\n/g, '\n').slice(0, 8000) : defaultLines.join('\n');
    const lines = body.split('\n').map((l) => l.trimEnd());
    const buttonLabel = isRenewal ? (auto ? 'View my plan' : 'Renew my website') : 'Review and sign';
    const html = emailShell(linesToEmailHtml(lines, link, buttonLabel), {
      heading: isRenewal ? 'Your website plan' : 'Your website agreement',
      preheader: isRenewal ? `Your ${client.business_name} website plan renews on ${renewOn}.` : `Review and sign the agreement for ${client.business_name}.`,
    });

    if (d.preview) {
      return json({ ok: true, preview: true, to, subject, body, html, link, isRenewal, linkInBody: lines.some((l) => l.includes(link)) }, 200, corsHeaders);
    }

    let emailed = false;
    if (d.send) {
      if (!to) return json({ ok: false, error: 'Add an email address first, or copy the link and send it yourself.' }, 400, corsHeaders);
      try {
        await sendEmail(env, { to, subject, text: lines.join('\n'), html });
        emailed = true;
      } catch (e) {
        return json({ ok: false, error: e.message || 'Email failed' }, 502, corsHeaders);
      }
    }
    if (isRenewal) {
      if (d.send) await env.DB.prepare(`UPDATE website_clients SET renewal_link_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`).bind(id).run();
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
      businessName: client.business_name, domainName: client.domain_name || '', priceCents: Number(client.annual_price_cents || WEBSITE_PLAN_PRICE_CENTS),
      signedAtEt: etDateTime(client.signed_at), link: client.agreement_token ? agreementUrl(client.agreement_token) : '',
      text: client.agreement_text || renderAgreementText(client),
      signedAt: client.signed_at, signerName: client.signer_name, signerTitle: client.signer_title, signerEmail: client.signer_email,
      signerIp: client.signer_ip, signerUserAgent: client.signer_user_agent, version: client.agreement_version, hash: client.agreement_hash,
    }, 200, corsHeaders);
  }

  return {
    handleAgreementGet, handleAgreementSign, handleAgreementCheckout, handleAgreementPortal, handleAgreementAutopay, handleFindPlan,
    handleWebsitePlanPaid, handleWebsitePlanStripeEvent,
    handleClientsList, handleClientSave, handleClientLink, handleClientStatus, handleClientStopAutopay, handleClientDelete, handleClientAgreement,
  };
}
