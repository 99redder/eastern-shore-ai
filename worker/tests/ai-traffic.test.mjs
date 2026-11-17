// "AI assistants yesterday" in the 8 AM email (src/ai-traffic.js): Eastern day
// windows, user-agent sorting, the Cloudflare analytics call and the email lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { aiFetcher, dayWindows, easternStart, fetchLines, fetchPageRequests, aiTrafficSummary, BUSINESS_HUB_URL, BING_AI_URL } from '../src/ai-traffic.js';
import { createD1 } from './d1.mjs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
function createDb() {
  const DB = createD1();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    try { DB.sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8')); } catch (e) { if (!file.startsWith('0023_')) throw e; }
  }
  return DB;
}

const UA = {
  chatgptUser: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  claudeUser: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  searchBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
  gptBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  claudeBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  bing: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

test('aiFetcher sorts user agents into live reads, index crawls and training', () => {
  assert.deepEqual([aiFetcher(UA.chatgptUser).label, aiFetcher(UA.chatgptUser).kind], ['ChatGPT', 'user']);
  assert.equal(aiFetcher(UA.claudeUser).kind, 'user');
  assert.deepEqual([aiFetcher(UA.searchBot).label, aiFetcher(UA.searchBot).kind], ['ChatGPT search', 'index']);
  assert.equal(aiFetcher(UA.bing).label, 'Bing/Copilot');
  assert.equal(aiFetcher(UA.gptBot).kind, 'train');
  assert.equal(aiFetcher(UA.claudeBot).label, 'Anthropic');
  assert.equal(aiFetcher(UA.chrome), null);
  assert.equal(aiFetcher(''), null);
});

test('dayWindows cover the Eastern day in pieces of 12 hours or less, DST days too', () => {
  assert.equal(easternStart('2026-11-17').toISOString(), '2026-11-17T05:00:00.000Z');
  assert.equal(easternStart('2026-07-04').toISOString(), '2026-07-04T04:00:00.000Z');
  const hours = (day) => dayWindows(day).reduce((h, [a, b]) => h + (Date.parse(b) - Date.parse(a)) / 3600000, 0);
  assert.equal(hours('2026-11-17'), 24);
  assert.equal(hours('2026-03-08'), 23, 'spring forward');
  assert.equal(hours('2026-11-01'), 25, 'fall back');
  for (const day of ['2026-11-17', '2026-03-08', '2026-11-01']) {
    const w = dayWindows(day);
    for (let i = 1; i < w.length; i++) assert.equal(w[i][0], w[i - 1][1], 'no gaps');
    for (const [a, b] of w) assert.ok(Date.parse(b) - Date.parse(a) <= 12 * 3600000);
  }
});

test('fetchLines counts successful AI reads of node.html and feed downloads', () => {
  const lines = fetchLines([
    { count: 3, userAgent: UA.chatgptUser, path: '/node.html', status: 200 },
    { count: 1, userAgent: UA.claudeUser, path: '/node.html', status: 200 },
    { count: 2, userAgent: UA.claudeUser, path: '/node.html', status: 403 },   // blocked: not a read
    { count: 1, userAgent: UA.searchBot, path: '/node.html', status: 304 },
    { count: 2, userAgent: UA.bing, path: '/node.html', status: 200 },
    { count: 1, userAgent: UA.gptBot, path: '/node.html', status: 200 },
    { count: 5, userAgent: UA.chrome, path: '/node.html', status: 200 },      // people, counted elsewhere
    { count: 1, userAgent: UA.chrome, path: '/chatgpt-feed.csv', status: 200 },
    { count: 4, userAgent: 'curl/8.7.1', path: '/chatgpt-feed.csv', status: 404 },
  ]).join('\n');
  assert.match(lines, /Read node\.html while answering someone: ChatGPT 3, Claude 1/);
  assert.match(lines, /Crawled node\.html for AI and search: Bing\/Copilot 2, ChatGPT search 1/);
  assert.match(lines, /Crawled node\.html for AI training: OpenAI 1/);
  assert.match(lines, /ChatGPT product feed \(chatgpt-feed\.csv\): downloaded 1 time$/m);

  const quiet = fetchLines([]).join('\n');
  assert.match(quiet, /answering someone: none/);
  assert.match(quiet, /not downloaded\. OpenAI usually collects it daily/);
});

test('fetchPageRequests asks Cloudflare once per window with the zone, paths and token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [
      { count: 2, dimensions: { userAgent: UA.chatgptUser, clientRequestPath: '/node.html', edgeResponseStatus: 200 } },
    ] }] } } });
  };
  const rows = await fetchPageRequests({ CF_ANALYTICS_TOKEN: 'test-token', CF_ZONE_TAG: 'zone-1' }, '2026-11-17', { fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/graphql');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].body.variables.zone, 'zone-1');
  assert.deepEqual(calls[0].body.variables.paths, ['/node.html', '/chatgpt-feed.csv']);
  assert.equal(calls[0].body.variables.start, '2026-11-17T05:00:00.000Z');
  assert.equal(calls[1].body.variables.end, '2026-11-18T05:00:00.000Z');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { count: 2, userAgent: UA.chatgptUser, path: '/node.html', status: 200 });

  await assert.rejects(fetchPageRequests({ CF_ANALYTICS_TOKEN: 't', CF_ZONE_TAG: 'z' }, '2026-11-17', {
    fetchImpl: async () => Response.json({ errors: [{ message: 'not authorized for that zone' }] }),
  }), /not authorized/);
  await assert.rejects(fetchPageRequests({ CF_ANALYTICS_TOKEN: 't', CF_ZONE_TAG: 'z' }, '2026-11-17', {
    fetchImpl: async () => new Response('no', { status: 403 }),
  }), /HTTP 403/);
});

test('aiTrafficSummary: visits, page reads, dashboard links; says when not set up or failing', async (t) => {
  t.mock.method(console, 'error', () => {});
  const day = '2026-11-17';
  const DB = createDb();
  DB.sqlite.prepare(`INSERT INTO page_visits (page, day, source, ref_host, device, city, region, country, ip_hash) VALUES ('node', ?, 'chatgpt', '', 'phone', '', '', '', 'a'), ('node', ?, 'google', 'www.google.com', 'phone', '', '', '', 'b')`).run(day, day);

  const notSetUp = (await aiTrafficSummary({ DB }, day)).lines.join('\n');
  assert.match(notSetUp, /Visits AI assistants sent: 1 \(chatgpt 1\)/);
  assert.match(notSetUp, /AI page reads: not set up \(CF_ANALYTICS_TOKEN not set\)/);
  assert.ok(notSetUp.includes(BUSINESS_HUB_URL) && notSetUp.includes(BING_AI_URL));

  const env = { DB, CF_ANALYTICS_TOKEN: 'test-token', CF_ZONE_TAG: 'zone-1' };
  const working = (await aiTrafficSummary(env, day, {
    fetchImpl: async () => Response.json({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [
      { count: 1, dimensions: { userAgent: UA.claudeUser, clientRequestPath: '/node.html', edgeResponseStatus: 200 } },
    ] }] } } }),
  })).lines.join('\n');
  assert.match(working, /answering someone: Claude 2/, 'one row per 12-hour window');
  assert.doesNotMatch(working, /test-token/);

  const failing = (await aiTrafficSummary(env, day, { fetchImpl: async () => new Response('', { status: 500 }) })).lines.join('\n');
  assert.match(failing, /AI page reads: couldn't fetch \(HTTP 500\)/);
  assert.match(failing, /Visits AI assistants sent: 1/);
});
