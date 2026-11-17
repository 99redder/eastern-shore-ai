// "AI assistants yesterday" in the 8 AM email (sendAskKDailySummary):
// - visits AI assistants sent to node.html (page_visits, aiVisitSummary)
// - how often AI fetchers read node.html, from Cloudflare's HTTP analytics
//   (GraphQL httpRequestsAdaptiveGroups, needs CF_ANALYTICS_TOKEN: a token
//   with Zone > Analytics > Read on easternshore.ai, zone tag CF_ZONE_TAG)
// - whether the ChatGPT product feed file was downloaded
// - links to the two dashboards that have no API yet (ChatGPT Business Hub
//   mentions/clicks, Bing Webmaster Tools AI Performance)
import { aiVisitSummary } from './page-visits.js';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const TIMEOUT_MS = 10000;
const NODE_PATH = '/node.html';
const FEED_PATH = '/chatgpt-feed.csv';

export const BUSINESS_HUB_URL = 'https://chatgpt.com/business-hub/bizprof_b264eb7262ac819ba9653f4c2cdb8a6e/insights';
export const BING_AI_URL = 'https://www.bing.com/webmasters/aiperformance?siteUrl=https%3A%2F%2Fwww.easternshore.ai%2F';

// User-agent tokens, checked in order (case-insensitive). `kind`:
// user  = fetched live while answering someone (a shopper asking about it)
// index = crawling for an AI or search index (ChatGPT search, Copilot, Gemini/AI Mode)
// train = collecting pages to train models
export const AI_FETCHERS = [
  { label: 'ChatGPT', token: 'ChatGPT-User', kind: 'user' },
  { label: 'Claude', token: 'Claude-User', kind: 'user' },
  { label: 'Perplexity', token: 'Perplexity-User', kind: 'user' },
  { label: 'Mistral', token: 'MistralAI-User', kind: 'user' },
  { label: 'ChatGPT search', token: 'OAI-SearchBot', kind: 'index' },
  { label: 'Claude search', token: 'Claude-SearchBot', kind: 'index' },
  { label: 'Perplexity', token: 'PerplexityBot', kind: 'index' },
  { label: 'Bing/Copilot', token: 'bingbot', kind: 'index' },
  { label: 'Google/Gemini', token: 'Googlebot', kind: 'index' },
  { label: 'Exa', token: 'ExaSearchBot', kind: 'index' },
  { label: 'OpenAI', token: 'GPTBot', kind: 'train' },
  { label: 'Anthropic', token: 'ClaudeBot', kind: 'train' },
  { label: 'Meta', token: 'meta-externalagent', kind: 'train' },
  { label: 'Common Crawl', token: 'CCBot', kind: 'train' },
];

export function aiFetcher(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  return AI_FETCHERS.find(f => ua.includes(f.token.toLowerCase())) || null;
}

// Midnight Eastern at the start of `day` (YYYY-MM-DD), as a Date.
export function easternStart(day) {
  for (const offset of ['-05:00', '-04:00']) {
    const d = new Date(`${day}T00:00:00${offset}`);
    const shown = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    if (shown.startsWith(day) && /\b00:00$/.test(shown.replace(',', ''))) return d;
  }
  throw new Error(`can't find midnight Eastern for ${day}`);
}

function nextDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// The Eastern day in pieces of at most 12 hours (23, 24 or 25 hours long).
export function dayWindows(day) {
  const start = easternStart(day).getTime();
  const end = easternStart(nextDay(day)).getTime();
  const windows = [];
  for (let t = start; t < end; t += 12 * 3600 * 1000) {
    windows.push([new Date(t).toISOString(), new Date(Math.min(t + 12 * 3600 * 1000, end)).toISOString()]);
  }
  return windows;
}

const QUERY = `query($zone: String!, $start: Time!, $end: Time!, $paths: [String!]) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $start, datetime_lt: $end, clientRequestPath_in: $paths, requestSource: "eyeball" }) {
      count
      dimensions { userAgent clientRequestPath edgeResponseStatus }
    }
  } }
}`;

// Requests to node.html and the feed for the Eastern day, as [{count, userAgent, path, status}].
export async function fetchPageRequests(env, day, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const rows = [];
  for (const [start, end] of dayWindows(day)) {
    const res = await fetchImpl(GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { zone: env.CF_ZONE_TAG, start, end, paths: [NODE_PATH, FEED_PATH] } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(String(data.errors[0].message || 'GraphQL error').slice(0, 80));
    const groups = data.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
    if (!Array.isArray(groups)) throw new Error('no zone data');
    for (const g of groups) {
      rows.push({ count: Number(g.count) || 0, userAgent: g.dimensions?.userAgent || '', path: g.dimensions?.clientRequestPath || '', status: Number(g.dimensions?.edgeResponseStatus) || 0 });
    }
  }
  return rows;
}

const ok = (status) => (status >= 200 && status < 300) || status === 304;
const list = (pairs) => pairs.length ? pairs.map(([k, n]) => `${k} ${n}`).join(', ') : 'none';

// Turns the request rows into the email's fetch lines.
export function fetchLines(rows) {
  const tally = { user: new Map(), index: new Map(), train: new Map() };
  let feed = 0;
  for (const r of rows) {
    if (!ok(r.status)) continue;
    if (r.path === FEED_PATH) { feed += r.count; continue; }
    if (r.path !== NODE_PATH) continue;
    const f = aiFetcher(r.userAgent);
    if (!f) continue;
    tally[f.kind].set(f.label, (tally[f.kind].get(f.label) || 0) + r.count);
  }
  const sorted = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [
    `Read node.html while answering someone: ${list(sorted(tally.user))}`,
    `Crawled node.html for AI and search: ${list(sorted(tally.index))}`,
    `Crawled node.html for AI training: ${list(sorted(tally.train))}`,
    feed
      ? `ChatGPT product feed (chatgpt-feed.csv): downloaded ${feed} time${feed === 1 ? '' : 's'}`
      : 'ChatGPT product feed (chatgpt-feed.csv): not downloaded. OpenAI usually collects it daily; check Business Hub → Products → Upload history.',
  ];
}

export async function aiTrafficSummary(env, day, opts = {}) {
  const lines = [];
  try {
    const v = await aiVisitSummary(env, day);
    lines.push(`Visits AI assistants sent: ${v.total}${v.total ? ` (${list(v.counts)})` : ''}`);
  } catch (e) {
    lines.push(`Visits AI assistants sent: couldn't count (${String(e?.message || e).slice(0, 80)})`);
  }
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ZONE_TAG) {
    lines.push(`AI page reads: not set up (${!env.CF_ANALYTICS_TOKEN ? 'CF_ANALYTICS_TOKEN' : 'CF_ZONE_TAG'} not set)`);
  } else {
    try {
      lines.push(...fetchLines(await fetchPageRequests(env, day, opts)));
    } catch (e) {
      const reason = e?.name === 'TimeoutError' ? 'no reply in 10 s' : String(e?.message || e).slice(0, 80);
      console.error('AI traffic: Cloudflare analytics failed:', reason);
      lines.push(`AI page reads: couldn't fetch (${reason})`);
    }
  }
  lines.push(
    'Mentions and citations have no API yet; see them here:',
    `  ChatGPT mentions and clicks: ${BUSINESS_HUB_URL}`,
    `  Bing/Copilot citations: ${BING_AI_URL}`,
    'Page reads count requests in Cloudflare\'s logs by user agent, so a bot pretending to be one is counted too.',
  );
  return { lines };
}
