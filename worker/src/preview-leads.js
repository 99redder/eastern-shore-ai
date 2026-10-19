// Preview-site leads for the "I built you a website" campaign.
// Public, origin-checked endpoints used by /preview-kit.js on each preview site:
//   GET  /api/preview/site?slug=      -> { name, phone, email } to prefill the form
//   POST /api/preview/visit           -> one staff email per visitor per 12 hours
//   POST /api/preview/lead            -> "call me" (with a date/time) or "not for me"
// Rows live in D1 table preview_events (migration 0036).

export const PREVIEW_SITES = {
  garcias: { name: "Garcia's Tire Shop", phone: '(302) 212-6898', email: '' },
  michelles: { name: "Michelle's Pretty Paws", phone: '(410) 742-0299', email: '' },
  upholsterydoctor: { name: 'The Upholstery Doctor', phone: '(410) 860-1575', email: '' },
  frankantion: { name: 'Frank Antion Lawn & Garden', phone: '(410) 896-4207', email: '' },
  grants: { name: "Grant's Service Center", phone: '(410) 742-3243', email: 'grantsexxon@comcast.net' },
  rrhandyman: { name: "R&R's Handyman Services", phone: '(443) 859-3373', email: 'rrhandyman2019@gmail.com' },
  cathys: { name: "Cathy's Pet Salon", phone: '(410) 670-8348', email: 'cathyspetsalon@yahoo.com' },
  oakleys: { name: "Oakley's Farm Market", phone: '(410) 860-8553', email: 'melonsforyou@msn.com' },
  yourstyle: { name: 'Your Style', phone: '(410) 835-2722', email: 'daydelotte2506@aol.com' },
  sunnyside: { name: 'Sunnyside Greenhouses', phone: '(410) 677-3364', email: 'sunnysidellc@aol.com' },
};

const SITE = 'https://www.easternshore.ai';
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|scan/i;

function clip(v, n) { return String(v ?? '').trim().slice(0, n); }

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function etNow() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
}

function device(ua) {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'Unknown device';
}

// "2026-10-20" + "10:00" (ET wall clock) -> readable label and an ICS-friendly UTC stamp.
export function callTimeInfo(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const anytime = !time || time === 'any';
  if (!anytime && !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = anytime ? [12, 0] : time.split(':').map(Number);
  // Find the UTC instant whose New York wall clock equals y-m-d hh:mm.
  let guess = Date.UTC(y, m - 1, d, hh + 4, mm);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += Date.UTC(y, m - 1, d, hh, mm) - wall;
  }
  const at = new Date(guess);
  const day = at.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' });
  const clock = at.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return { at, anytime, label: anytime ? `${day}, any time that day` : `${day} at ${clock}` };
}

export function icsFor({ at, anytime, summary, description }) {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eastern Shore AI//Preview Call//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@easternshore.ai`, `DTSTAMP:${stamp(new Date())}`];
  if (anytime) {
    const ymd = at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
    lines.push(`DTSTART;VALUE=DATE:${ymd}`);
  } else {
    lines.push(`DTSTART:${stamp(at)}`, `DTEND:${stamp(new Date(at.getTime() + 15 * 60000))}`);
  }
  lines.push(`SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`, 'END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function createPreviewLeadHandlers({ json, escapeHtml, getClientIp, sendStaffOperationalAlert }) {
  async function staff(env, subject, lines) {
    try { await sendStaffOperationalAlert(env, { subject, text: lines.filter((l) => l !== null).join('\n') }); } catch (e) { console.error('preview staff alert failed', e); }
  }

  async function visitorHash(request, slug) {
    return sha256(`${getClientIp(request)}|${request.headers.get('User-Agent') || ''}|${slug}`);
  }

  async function handlePreviewSite(request, env, cors, url) {
    const slug = clip(url.searchParams.get('slug'), 40);
    const s = PREVIEW_SITES[slug];
    if (!s) return json({ ok: false, error: 'Unknown site' }, 404, cors);
    return json({ ok: true, name: s.name, phone: s.phone, email: s.email }, 200, cors);
  }

  async function handlePreviewVisit(request, env, cors) {
    const body = await request.json().catch(() => ({}));
    const slug = clip(body.slug, 40);
    const site = PREVIEW_SITES[slug];
    const ua = request.headers.get('User-Agent') || '';
    if (!site || body.me || BOT_UA.test(ua)) return json({ ok: true, skipped: true }, 200, cors);
    const hash = await visitorHash(request, slug);
    const recent = await env.DB.prepare(`SELECT id FROM preview_events WHERE slug = ?1 AND kind = 'visit' AND ip_hash = ?2 AND created_at > datetime('now', '-12 hours') LIMIT 1`).bind(slug, hash).first();
    const cf = request.cf || {};
    const ref = clip(body.ref, 20);
    await env.DB.prepare(`INSERT INTO preview_events (slug, kind, ref, ip_hash, ua, city, region) VALUES (?1, 'visit', ?2, ?3, ?4, ?5, ?6)`)
      .bind(slug, ref, hash, clip(ua, 300), clip(cf.city, 80), clip(cf.region, 80)).run();
    if (recent) return json({ ok: true, repeat: true }, 200, cors);
    const total = await env.DB.prepare(`SELECT COUNT(DISTINCT ip_hash) AS n FROM preview_events WHERE slug = ?1 AND kind = 'visit'`).bind(slug).first();
    const where = [cf.city, cf.region].filter(Boolean).join(', ') || 'unknown location';
    await staff(env, `Someone opened the ${site.name} preview site`, [
      `${site.name} preview: ${SITE}/${slug}`,
      '',
      `When: ${etNow()}`,
      `Device: ${device(ua)}`,
      `Approximate location: ${where}`,
      ref ? `Came from: ${ref}` : null,
      `Different visitors so far: ${total?.n || 1}`,
      '',
      'Location comes from the internet connection and can be off by a town or two.',
    ]);
    return json({ ok: true }, 200, cors);
  }

  async function sendOwnerConfirmation(env, { to, site, slug, info, phone, method }) {
    if (!env.RESEND_API_KEY || !env.FROM_EMAIL) return;
    const how = method === 'text' ? `text you first at ${phone}` : `call you at ${phone}`;
    const font = 'font-family:Arial,Helvetica,sans-serif;';
    const html = `<div style="margin:0;padding:24px 12px;background:#EEF0F3;${font}">`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #DDE1E6;border-radius:10px;">`
      + `<tr><td style="padding:26px 28px 8px;${font}color:#15181D;font-size:15px;line-height:1.6;">`
      + `<h1 style="margin:0 0 12px;font-size:21px;${font}">You're all set</h1>`
      + `<p style="margin:0 0 12px;">Thanks for taking a look at the website I built for ${escapeHtml(site.name)}. I'll ${escapeHtml(how)} on <strong>${escapeHtml(info.label)}</strong>.</p>`
      + `<p style="margin:0 0 12px;">A calendar invite is attached. If something comes up, just reply to this email or call or text me at (302) 907-9162.</p>`
      + `<p style="margin:0 0 12px;">Your site: <a href="${SITE}/${slug}" style="color:#0E6E86;">www.easternshore.ai/${slug}</a></p>`
      + `<p style="margin:0 0 18px;">Talk soon,<br>Chris<br><span style="color:#5B6370;">Eastern Shore AI, LLC</span></p>`
      + `</td></tr><tr><td style="padding:14px 28px;border-top:1px solid #E5E7EB;background:#F7F8FA;border-radius:0 0 10px 10px;${font}font-size:12px;color:#5B6370;line-height:1.6;">Eastern Shore AI, LLC &middot; PO Box 317, Parsonsburg, MD 21849 &middot; <a href="${SITE}" style="color:#0E6E86;">easternshore.ai</a></td></tr></table></div>`;
    const text = `You're all set\n\nThanks for taking a look at the website I built for ${site.name}. I'll ${how} on ${info.label}.\n\nA calendar invite is attached. If something comes up, just reply to this email or call or text me at (302) 907-9162.\n\nYour site: ${SITE}/${slug}\n\nTalk soon,\nChris\nEastern Shore AI, LLC\nPO Box 317, Parsonsburg, MD 21849`;
    const ics = icsFor({ at: info.at, anytime: info.anytime, summary: `Call with Chris (Eastern Shore AI) about your website`, description: `Chris will ${how}. Your site: ${SITE}/${slug}. Questions: (302) 907-9162.` });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL, to: [to], reply_to: 'contact@easternshore.ai',
        subject: `Your call with Chris about the ${site.name} website`, html, text,
        attachments: [{ filename: 'call-with-chris.ics', content: btoa(ics), content_type: 'text/calendar' }],
      }),
    });
    if (!res.ok) console.error('preview owner confirmation failed', await res.text().catch(() => res.status));
  }

  async function handlePreviewLead(request, env, cors) {
    const body = await request.json().catch(() => ({}));
    if (clip(body.website, 50)) return json({ ok: true }, 200, cors); // honeypot
    const slug = clip(body.slug, 40);
    const site = PREVIEW_SITES[slug];
    if (!site) return json({ ok: false, error: 'Unknown site' }, 404, cors);
    const choice = body.choice === 'not' ? 'not_interested' : 'interested';
    const hash = await visitorHash(request, slug);
    const burst = await env.DB.prepare(`SELECT COUNT(*) AS n FROM preview_events WHERE ip_hash = ?1 AND kind != 'visit' AND created_at > datetime('now', '-1 hour')`).bind(hash).first();
    if ((burst?.n || 0) >= 5) return json({ ok: false, error: 'Too many requests. Please call or text (302) 907-9162.' }, 429, cors);

    const name = clip(body.name, 80);
    const note = clip(body.note, 800);
    const cf = request.cf || {};

    if (choice === 'not_interested') {
      await env.DB.prepare(`INSERT INTO preview_events (slug, kind, ip_hash, ua, city, region, name, note) VALUES (?1, 'not_interested', ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(slug, hash, clip(request.headers.get('User-Agent'), 300), clip(cf.city, 80), clip(cf.region, 80), name, note).run();
      await staff(env, `${site.name}: "Not for me"`, [
        `${site.name} tapped "Not for me" on ${SITE}/${slug}`, `When: ${etNow()}`, name ? `Name: ${name}` : null, note ? `Note: ${note}` : 'No note left.', '', 'Take the site down and skip the follow-up.',
      ]);
      return json({ ok: true }, 200, cors);
    }

    const phone = clip(body.phone, 40);
    const email = clip(body.email, 200);
    const method = body.method === 'text' ? 'text' : 'call';
    const info = callTimeInfo(clip(body.date, 10), clip(body.time, 5));
    if (!phone || phone.replace(/\D/g, '').length < 10) return json({ ok: false, error: 'Please enter a phone number with area code.' }, 400, cors);
    if (!info) return json({ ok: false, error: 'Please pick a day and time.' }, 400, cors);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'That email address doesn\'t look right.' }, 400, cors);

    await env.DB.prepare(`INSERT INTO preview_events (slug, kind, ip_hash, ua, city, region, name, phone, email, call_at, call_at_label, method, note) VALUES (?1, 'interested', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
      .bind(slug, hash, clip(request.headers.get('User-Agent'), 300), clip(cf.city, 80), clip(cf.region, 80), name, phone, email, info.at.toISOString(), info.label, method, note).run();

    await staff(env, `${site.name} wants a call: ${info.label}`, [
      `${site.name} is interested in the website: ${SITE}/${slug}`,
      '',
      `${method === 'text' ? 'Text first' : 'Call'}: ${phone}`,
      `When: ${info.label} (Eastern time)`,
      name ? `Name: ${name}` : null,
      email ? `Email: ${email}` : null,
      note ? `Note: ${note}` : null,
      '',
      `Submitted ${etNow()}.`,
      email ? 'They were emailed a confirmation with a calendar invite.' : 'No email given, so no confirmation was sent.',
    ]);
    if (email) await sendOwnerConfirmation(env, { to: email, site, slug, info, phone, method }).catch((e) => console.error(e));
    return json({ ok: true, label: info.label }, 200, cors);
  }

  return { handlePreviewSite, handlePreviewVisit, handlePreviewLead };
}
