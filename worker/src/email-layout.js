// One look for every Eastern Shore AI customer email: website plan, preview-site
// calls, Survival Node orders and refunds, lesson bookings, invoices and quotes.
// Spam-safe on purpose: tables and inline styles, one small logo served from
// www.easternshore.ai, mostly text, no tracking pixels, no third-party images
// and no full-width banner pictures. Every email built on it also sends a
// plain-text part. Staff alerts stay plain text and don't use it.

export const SITE = 'https://www.easternshore.ai';
export const BUSINESS_LOCATION = 'Fruitland, Maryland';

// The line under "Eastern Shore AI" in the header, per kind of email.
export const TAGLINES = {
  websites: 'Websites for local businesses',
  survivalNode: 'Survival Node',
  services: 'AI lessons and setup',
  general: 'Websites, AI setup and Survival Nodes'
};

const FONT = 'font-family:Arial,Helvetica,sans-serif;';
const LINK = 'color:#0E6E86;text-decoration:none;';
const BUTTON_COLORS = { primary: '#0E6E86', secondary: '#5B6370' };

export function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// The whole email. `body` and `panels` are HTML the caller built (escape your
// own values); `panels` are boxed notes shown under the body, `footerNote` is
// the grey "why you got this" line (HTML).
export function emailLayout({ heading = '', preheader = '', tagline = TAGLINES.general, body = '', panels = [], footerNote = '' } = {}) {
  return `<div style="margin:0;padding:24px 12px;background:#EEF0F3;${FONT}">`
    + (preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#EEF0F3;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>` : '')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #DDE1E6;border-radius:10px;border-collapse:separate;">`
    + `<tr><td style="background:#0A0B10;padding:18px 26px;border-radius:10px 10px 0 0;">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="vertical-align:middle;"><img src="${SITE}/images/esai-badge.jpg" width="46" height="42" alt="Eastern Shore AI" style="display:block;border:0;border-radius:6px;"></td>`
    + `<td style="vertical-align:middle;padding-left:12px;${FONT}"><div style="color:#FFFFFF;font-size:17px;font-weight:bold;line-height:1.2;">Eastern Shore AI</div><div style="color:#7FE8FF;font-size:12px;line-height:1.4;">${escapeHtml(tagline)}</div></td>`
    + `</tr></table></td></tr>`
    + `<tr><td style="height:3px;line-height:3px;font-size:0;background:#00B8D4;">&nbsp;</td></tr>`
    + `<tr><td style="padding:28px 28px 10px;color:#15181D;font-size:15px;line-height:1.6;${FONT}">`
    + (heading ? `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#15181D;${FONT}">${escapeHtml(heading)}</h1>` : '')
    + body
    + `</td></tr>`
    + panels.filter(Boolean).map((html) => `<tr><td style="padding:6px 28px 24px;${FONT}">${html}</td></tr>`).join('')
    + `<tr><td style="padding:18px 28px 22px;border-top:1px solid #E5E7EB;background:#F7F8FA;border-radius:0 0 10px 10px;color:#5B6370;font-size:12px;line-height:1.7;${FONT}">`
    + `<strong style="color:#15181D;">Eastern Shore AI, LLC</strong> &middot; ${escapeHtml(BUSINESS_LOCATION)}<br>`
    + `<a href="${SITE}" style="${LINK}">www.easternshore.ai</a> &middot; <a href="mailto:contact@easternshore.ai" style="${LINK}">contact@easternshore.ai</a> &middot; <a href="tel:+13029079162" style="${LINK}">(302) 907-9162</a> &middot; <a href="https://www.facebook.com/easternshoreai" style="${LINK}">Facebook</a>`
    + (footerNote ? `<br><span style="color:#7A818C;">${footerNote}</span>` : '')
    + `</td></tr></table></div>`;
}

export function emailButton(href, label, { tone = 'primary' } = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="border-radius:8px;background:${BUTTON_COLORS[tone] || BUTTON_COLORS.primary};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;${FONT}font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a></td></tr></table>`;
}

// Buttons side by side, e.g. Accept / Decline: [{ href, label, tone }].
export function emailButtonRow(buttons) {
  const cells = buttons.map((b, i) => `<td style="${i ? 'padding-left:10px;' : ''}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:${BUTTON_COLORS[b.tone] || BUTTON_COLORS.primary};"><a href="${escapeHtml(b.href)}" style="display:inline-block;padding:12px 24px;${FONT}font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(b.label)}</a></td></tr></table></td>`);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr>${cells.join('')}</tr></table>`;
}

// Labeled facts in a light box: [[label, value], ...]. Values are text unless
// passed as { html }. Empty values are skipped.
export function detailsBox(rows) {
  const lines = rows
    .filter(([, value]) => value !== undefined && value !== null && value !== '' && !(typeof value === 'object' && !value.html))
    .map(([label, value]) => `<tr><td style="padding:3px 14px 3px 0;color:#5B6370;font-size:14px;vertical-align:top;white-space:nowrap;${FONT}">${escapeHtml(label)}</td><td style="padding:3px 0;color:#15181D;font-size:14px;vertical-align:top;${FONT}">${typeof value === 'object' ? value.html : escapeHtml(value)}</td></tr>`)
    .join('');
  return lines
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;background:#F7F8FA;border:1px solid #E5E7EB;border-left:4px solid #00B8D4;border-radius:6px;"><tr><td style="padding:12px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${lines}</table></td></tr></table>`
    : '';
}

// A titled note box (the website plan's "Manage your plan any time" style).
export function callout(title, html, { marginTop = 0 } = {}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${marginTop ? `margin-top:${marginTop}px;` : ''}background:#EEF7F9;border:1px solid #CFE6EC;border-radius:8px;"><tr><td style="padding:14px 16px;${FONT}font-size:13px;line-height:1.6;color:#2A3B42;">`
    + (title ? `<strong style="color:#0A5568;font-size:14px;">${escapeHtml(title)}</strong><br>` : '')
    + html
    + `</td></tr></table>`;
}

// Plain text -> one paragraph per line (as the website-plan emails do); email
// addresses and web links become links.
export function emailParagraphs(text) {
  const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const html = escapeHtml(line)
      .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}" style="${LINK}">${url}</a>`)
      .replace(/(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (m, pre, addr) => `${pre}<a href="mailto:${addr}" style="${LINK}">${addr}</a>`);
    return `<p style="margin:0 0 12px;">${html}</p>`;
  }).join('');
}

// Line items with totals, for invoices and quotes.
// items: [{ description, quantity, unitCents, lineCents }]; totals: [[label, cents, { strong }]]
export function itemsTable(items, totals, formatUsd) {
  const cell = `padding:8px 6px;border-bottom:1px solid #E5E7EB;font-size:14px;${FONT}`;
  const head = `padding:8px 6px;border-bottom:2px solid #DDE1E6;font-size:12px;color:#5B6370;text-transform:uppercase;letter-spacing:0.5px;${FONT}`;
  const rows = items.map((it) => `<tr><td style="${cell}">${escapeHtml(it.description)}</td><td style="${cell}text-align:center;">${escapeHtml(it.quantity)}</td><td style="${cell}text-align:right;white-space:nowrap;">${escapeHtml(formatUsd(it.unitCents))}</td><td style="${cell}text-align:right;white-space:nowrap;">${escapeHtml(formatUsd(it.lineCents))}</td></tr>`).join('');
  const totalRows = totals.map(([label, cents, opts = {}]) => `<tr><td colspan="3" style="padding:5px 6px;text-align:right;font-size:${opts.strong ? 16 : 14}px;${opts.strong ? 'font-weight:bold;color:#15181D;' : 'color:#5B6370;'}${FONT}">${escapeHtml(label)}</td><td style="padding:5px 6px;text-align:right;white-space:nowrap;font-size:${opts.strong ? 16 : 14}px;font-weight:bold;color:#15181D;${FONT}">${escapeHtml(formatUsd(cents))}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 16px;border-collapse:collapse;">`
    + `<tr><th align="left" style="${head}">Item</th><th style="${head}text-align:center;">Qty</th><th style="${head}text-align:right;">Unit</th><th style="${head}text-align:right;">Total</th></tr>`
    + rows + totalRows + `</table>`;
}

// Small grey print under a button or at the end of the body.
export function smallPrint(html) {
  return `<p style="margin:-8px 0 14px;font-size:12px;color:#7A818C;">${html}</p>`;
}
