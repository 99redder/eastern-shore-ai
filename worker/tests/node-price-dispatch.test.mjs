// Midnight-Eastern start of the Survival Node price workflow
// (src/node-price-dispatch.js): which nights it starts the GitHub Action, the
// nightly token check, the 12:31 AM feed check, and the alerts for each failure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import {
  priceChangeToday, easternMidnightHour, runNodePriceDispatch, runNodePriceFeedCheck,
  feedSalePrice, parseGithubTime, DISPATCH_CRONS, FEED_CHECK_CRONS, META_FEED_URL
} from '../src/node-price-dispatch.js';
import { buildFeed } from '../../tools/meta-catalog.mjs';

const root = new URL('../../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const nodeHtml = read('node.html');
const DISPATCH_URL = 'https://api.github.com/repos/99redder/eastern-shore-ai/actions/workflows/node-price.yml/dispatches';
const WORKFLOW_URL = 'https://api.github.com/repos/99redder/eastern-shore-ai/actions/workflows/node-price.yml';

// Records calls; answers the dispatch, the workflow read and the feed.
function fakeFetch({ dispatchStatus = 204, workflowStatus = 200, expires = '', state = 'active', feed = '' } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (String(url) === DISPATCH_URL) return new Response(dispatchStatus === 204 ? null : 'Bad credentials', { status: dispatchStatus });
    if (String(url) === WORKFLOW_URL) {
      return new Response(JSON.stringify({ state }), {
        status: workflowStatus,
        headers: expires ? { 'github-authentication-token-expiration': expires } : {}
      });
    }
    if (String(url) === META_FEED_URL) return new Response(feed, { status: feed ? 200 : 503 });
    throw new Error(`unexpected fetch ${url}`);
  };
  return { impl, calls };
}
const alerts = () => { const sent = []; return { sent, notify: async (a) => { sent.push(a); } }; };
const env = { GITHUB_DISPATCH_TOKEN: 'github_pat_test' };

test('price changes on each sale start and on the day after each sale end', () => {
  const cases = [
    ['2026-11-26T12:00:00-05:00', null],
    ['2026-11-27T00:01:00-05:00', 'start:blackfriday'],
    ['2026-11-28T00:01:00-05:00', null],
    ['2026-11-30T00:01:00-05:00', null],
    ['2026-12-01T00:01:00-05:00', 'end:blackfriday'],
    ['2026-12-02T00:01:00-05:00', null],
    ['2026-12-12T00:01:00-05:00', 'start:christmas'],
    ['2026-12-18T00:01:00-05:00', null],
    ['2026-12-19T00:01:00-05:00', 'end:christmas'],
    ['2026-11-01T00:01:00-04:00', 'end:halloween'],
    // 04:01 UTC on Nov 27 is still 11:01 PM on Nov 26 in New York
    ['2026-11-27T04:01:00Z', null]
  ];
  for (const [when, want] of cases) {
    const change = priceChangeToday(new Date(when));
    assert.equal(change ? `${change.kind}:${change.sale.key}` : null, want, when);
  }
});

test('only the cron that lands at midnight Eastern acts', () => {
  assert.equal(easternMidnightHour(new Date('2026-11-27T05:01:00Z')), true);   // EST
  assert.equal(easternMidnightHour(new Date('2026-11-27T04:01:00Z')), false);
  assert.equal(easternMidnightHour(new Date('2026-07-04T04:01:00Z')), true);   // EDT
  assert.equal(easternMidnightHour(new Date('2026-07-04T05:01:00Z')), false);
});

test('starts the workflow at 12:01 AM on a sale-change night, and only then', async () => {
  for (const when of ['2026-11-27T05:01:00Z', '2026-12-01T05:01:00Z', '2026-12-12T05:01:00Z', '2026-12-19T05:01:00Z']) {
    const { impl, calls } = fakeFetch();
    const { sent, notify } = alerts();
    const out = await runNodePriceDispatch(env, { now: new Date(when), notify, fetchImpl: impl });
    assert.equal(out.dispatched, true, when);
    assert.equal(calls.length, 1, when);
    assert.equal(calls[0].url, DISPATCH_URL);
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].body), { ref: 'main' });
    assert.equal(calls[0].headers.Authorization, 'Bearer github_pat_test');
    assert.ok(calls[0].headers['User-Agent']);
    assert.equal(sent.length, 0, when);
  }
  // the 11:01 PM Eastern cron the evening before does nothing
  const early = fakeFetch();
  const out = await runNodePriceDispatch(env, { now: new Date('2026-11-27T04:01:00Z'), fetchImpl: early.impl });
  assert.ok(out.skipped);
  assert.equal(early.calls.length, 0);
});

test('an ordinary night checks the token and stays quiet when it is fine', async () => {
  const { impl, calls } = fakeFetch({ expires: '2027-11-01 05:00:00 UTC' });
  const { sent, notify } = alerts();
  const out = await runNodePriceDispatch(env, { now: new Date('2026-11-20T05:01:00Z'), notify, fetchImpl: impl });
  assert.equal(out.dispatched, false);
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`GET ${WORKFLOW_URL}`]);
  assert.equal(sent.length, 0);
});

test('alerts when the dispatch fails, the token is missing, rejected, expiring, or the workflow is off', async () => {
  // dispatch refused on a sale night
  let f = fakeFetch({ dispatchStatus: 401 });
  let a = alerts();
  let out = await runNodePriceDispatch(env, { now: new Date('2026-11-27T05:01:00Z'), notify: a.notify, fetchImpl: f.impl });
  assert.equal(out.ok, false);
  assert.equal(a.sent.length, 1);
  assert.match(a.sent[0].subject, /did not switch tonight/);
  assert.match(a.sent[0].text, /Black Friday Sale starts today/);
  assert.match(a.sent[0].text, /401/);
  assert.match(a.sent[0].text, /gh workflow run node-price\.yml/);

  // no token: alert on a sale night and on an ordinary night, no GitHub call
  for (const when of ['2026-12-01T05:01:00Z', '2026-11-20T05:01:00Z']) {
    f = fakeFetch(); a = alerts();
    out = await runNodePriceDispatch({}, { now: new Date(when), notify: a.notify, fetchImpl: f.impl });
    assert.equal(out.ok, false);
    assert.equal(f.calls.length, 0);
    assert.equal(a.sent.length, 1);
    assert.match(a.sent[0].text, /wrangler secret put GITHUB_DISPATCH_TOKEN --config wrangler\.toml/);
  }

  // token rejected on an ordinary night
  f = fakeFetch({ workflowStatus: 401 }); a = alerts();
  await runNodePriceDispatch(env, { now: new Date('2026-11-20T05:01:00Z'), notify: a.notify, fetchImpl: f.impl });
  assert.match(a.sent[0].subject, /token is not working/);

  // token expires in 3 days
  f = fakeFetch({ expires: '2026-11-23 12:00:00 UTC' }); a = alerts();
  await runNodePriceDispatch(env, { now: new Date('2026-11-20T05:01:00Z'), notify: a.notify, fetchImpl: f.impl });
  assert.match(a.sent[0].subject, /expires in 3 days/);

  // workflow disabled (GitHub turns schedules off after 60 quiet days)
  f = fakeFetch({ state: 'disabled_inactivity' }); a = alerts();
  await runNodePriceDispatch(env, { now: new Date('2026-11-20T05:01:00Z'), notify: a.notify, fetchImpl: f.impl });
  assert.match(a.sent[0].subject, /turned off/);
});

test('reads GitHub expiry times in both formats', () => {
  assert.equal(parseGithubTime('2026-12-01 05:00:00 UTC'), Date.parse('2026-12-01T05:00:00Z'));
  assert.equal(parseGithubTime('2026-12-01 00:00:00 -0500'), Date.parse('2026-12-01T05:00:00Z'));
  assert.ok(Number.isNaN(parseGithubTime('')));
});

test('12:31 AM feed check: quiet when the live feed matches, retries and alerts when it does not', async () => {
  const saleFeed = buildFeed(nodeHtml, new Date('2026-11-27T16:00:00Z'));
  const plainFeed = buildFeed(nodeHtml, new Date('2026-12-01T16:00:00Z'));
  assert.equal(feedSalePrice(saleFeed), '299.99 USD');
  assert.equal(feedSalePrice(plainFeed), '');
  assert.equal(feedSalePrice('id,title\nx,y\n'), null);

  // right feed on both kinds of night: nothing happens
  for (const [when, feed] of [['2026-11-27T05:31:00Z', saleFeed], ['2026-12-01T05:31:00Z', plainFeed]]) {
    const f = fakeFetch({ feed }); const a = alerts();
    const out = await runNodePriceFeedCheck(env, { now: new Date(when), notify: a.notify, fetchImpl: f.impl });
    assert.equal(out.ok, true, when);
    assert.deepEqual(f.calls.map((c) => c.url), [META_FEED_URL]);
    assert.equal(a.sent.length, 0);
  }

  // sale started but the feed has no sale price; sale ended but the feed still has it
  for (const [when, feed, why] of [
    ['2026-11-27T05:31:00Z', plainFeed, /no sale price yet/],
    ['2026-12-01T05:31:00Z', saleFeed, /still shows the sale price/]
  ]) {
    const f = fakeFetch({ feed }); const a = alerts();
    const out = await runNodePriceFeedCheck(env, { now: new Date(when), notify: a.notify, fetchImpl: f.impl });
    assert.equal(out.ok, false, when);
    assert.equal(out.retried, true);
    assert.deepEqual(f.calls.map((c) => c.url), [META_FEED_URL, DISPATCH_URL]);
    assert.equal(a.sent.length, 1);
    assert.match(a.sent[0].text, why);
    assert.match(a.sent[0].text, /started the GitHub workflow again/);
  }

  // feed unreachable
  let f = fakeFetch({ feed: '' }); let a = alerts();
  let out = await runNodePriceFeedCheck(env, { now: new Date('2026-12-12T05:31:00Z'), notify: a.notify, fetchImpl: f.impl });
  assert.equal(out.ok, false);
  assert.match(a.sent[0].text, /answered 503/);

  // ordinary night, and the 11:31 PM cron: no fetch at all
  for (const when of ['2026-11-28T05:31:00Z', '2026-11-27T04:31:00Z']) {
    f = fakeFetch({ feed: plainFeed }); a = alerts();
    out = await runNodePriceFeedCheck(env, { now: new Date(when), notify: a.notify, fetchImpl: f.impl });
    assert.ok(out.skipped, when);
    assert.equal(f.calls.length, 0);
  }
});

test('wrangler.toml lists the crons the worker handles, and they do not run the daily email', async (t) => {
  const toml = read('worker/wrangler.toml');
  const crons = JSON.parse(/^crons = (\[.*\])$/m.exec(toml)[1]);
  assert.deepEqual(crons.sort(), ['0 12 * * *', ...DISPATCH_CRONS, ...FEED_CHECK_CRONS].sort());

  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => { seen.push(String(url)); return new Response(null, { status: 204 }); };
  t.after(() => { globalThis.fetch = original; });
  const waits = [];
  await worker.scheduled({ cron: '1 5 * * *', scheduledTime: Date.parse('2026-11-27T05:01:00Z') }, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.deepEqual(seen, [DISPATCH_URL]);
});
