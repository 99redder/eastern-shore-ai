// Visit counts for public pages (node.html), reported once a day in the 8 AM summary email.
// No per-visit emails: the page gets ad and shopping traffic. Buy clicks already alert separately.

const PAGES = { node: 'Survival Node page (node.html)' };
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|scan|google-inspectiontool|adsbot|mediapartners/i;

function clip(v, n) { return String(v ?? '').trim().slice(0, n); }
function easternDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
}
function device(ua) {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'phone';
  return 'computer';
}
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The page sends what it knows; the worker only trusts it for labels.
export function classifySource(src, refHost) {
  const s = clip(src, 40).toLowerCase();
  if (s) return s;
  const h = clip(refHost, 120).toLowerCase();
  if (!h) return 'direct';
  if (/(^|\.)google\./.test(h)) return 'google';
  if (/(^|\.)bing\.com$/.test(h)) return 'bing';
  if (/duckduckgo\.com$/.test(h)) return 'duckduckgo';
  if (/reddit\.com$/.test(h)) return 'reddit';
  if (/(facebook|fb)\.com$|instagram\.com$/.test(h)) return 'facebook/instagram';
  if (/youtube\.com$/.test(h)) return 'youtube';
  if (/ebay\.com$/.test(h)) return 'ebay';
  if (/easternshore\.ai$/.test(h)) return 'our own site';
  return 'other site';
}

export async function handlePageVisit(request, env, cors, { json, getClientIp }) {
  const body = await request.json().catch(() => ({}));
  const page = clip(body.page, 20);
  const ua = request.headers.get('User-Agent') || '';
  if (!PAGES[page] || body.me || BOT_UA.test(ua)) return json({ ok: true, skipped: true }, 200, cors);
  const refHost = clip(body.ref, 120).toLowerCase();
  const day = easternDay();
  const cf = request.cf || {};
  const hash = await sha256(`${getClientIp(request)}|${ua}|${page}|${day}`);
  await env.DB.prepare(`INSERT INTO page_visits (page, day, source, ref_host, device, city, region, country, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(page, day, classifySource(body.src, refHost), refHost.endsWith('easternshore.ai') ? '' : refHost, device(ua), clip(cf.city, 80), clip(cf.region, 80), clip(cf.country, 4), hash).run();
  return json({ ok: true }, 200, cors);
}

// Lines for the daily email. `day` is the Eastern date being reported.
export async function pageVisitSummary(env, day) {
  const out = { visitors: 0, lines: [] };
  for (const [page, label] of Object.entries(PAGES)) {
    const tot = await env.DB.prepare(`SELECT COUNT(*) AS loads, COUNT(DISTINCT ip_hash) AS people FROM page_visits WHERE page = ?1 AND day = ?2`).bind(page, day).first();
    const people = Number(tot?.people) || 0;
    out.visitors += people;
    out.lines.push(`── ${label} ──`);
    if (!people) { out.lines.push('No visits.', ''); continue; }
    out.lines.push(`Visitors: ${people} (${Number(tot.loads) || 0} page views)`);
    const by = async (col, limit) => (await env.DB.prepare(`SELECT ${col} AS k, COUNT(DISTINCT ip_hash) AS n FROM page_visits WHERE page = ?1 AND day = ?2 GROUP BY ${col} ORDER BY n DESC LIMIT ${limit}`).bind(page, day).all()).results || [];
    const fmt = (rows) => rows.filter((r) => r.k).map((r) => `${r.k} ${r.n}`).join(', ') || 'none';
    out.lines.push(`Came from: ${fmt(await by('source', 8))}`);
    out.lines.push(`Devices: ${fmt(await by('device', 3))}`);
    const towns = (await env.DB.prepare(`SELECT city, region, country, COUNT(DISTINCT ip_hash) AS n FROM page_visits WHERE page = ?1 AND day = ?2 AND city != '' GROUP BY city, region, country ORDER BY n DESC LIMIT 8`).bind(page, day).all()).results || [];
    if (towns.length) out.lines.push(`Towns: ${towns.map((t) => `${[t.city, t.country === 'US' ? t.region : t.country].filter(Boolean).join(', ')}${t.n > 1 ? ` (${t.n})` : ''}`).join('; ')}`);
    const refs = await by("NULLIF(ref_host, '')", 5);
    if (refs.some((r) => r.k)) out.lines.push(`Referring sites: ${fmt(refs)}`);
    out.lines.push('Towns come from the internet connection and can be off by a town or two.', '');
  }
  return out;
}
