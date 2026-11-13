// Starts the "Survival Node price" GitHub Action (.github/workflows/node-price.yml)
// on time on the nights the price changes.
//
// Meta fetches /meta-catalog.csv at 1:00 AM Eastern, and GitHub starts that
// workflow's own schedule 6 to 8.5 hours late, so on each sale's first day and
// on the day after its last this worker starts it through workflow_dispatch:
//   12:01 AM Eastern  start the workflow (runNodePriceDispatch)
//   12:31 AM Eastern  read the live feed; if it still has yesterday's sale
//                     columns, start the workflow again and email staff
//                     (runNodePriceFeedCheck)
// The 12:01 run also checks the GitHub token every night, so a missing,
// revoked or soon-to-expire token is emailed before a sale night needs it.
//
// Cron triggers are UTC, so wrangler.toml lists each minute at 04:00 and 05:00
// UTC and easternMidnightHour() keeps the one that is midnight in New York.
//
// Secret: GITHUB_DISPATCH_TOKEN, a fine-grained token for 99redder/eastern-shore-ai
// with Actions: read and write.
import { NODE_SALES, nodePrice, easternDate } from './node-price.js';

export const NODE_PRICE_REPO = '99redder/eastern-shore-ai';
export const NODE_PRICE_WORKFLOW = 'node-price.yml';
export const META_FEED_URL = 'https://www.easternshore.ai/meta-catalog.csv';
export const DISPATCH_CRONS = ['1 4 * * *', '1 5 * * *'];
export const FEED_CHECK_CRONS = ['31 4 * * *', '31 5 * * *'];
export const TOKEN_EXPIRY_WARN_DAYS = 7;

const WORKFLOW_API = `https://api.github.com/repos/${NODE_PRICE_REPO}/actions/workflows/${NODE_PRICE_WORKFLOW}`;
const MANUAL_FIX = `To do it by hand: gh workflow run ${NODE_PRICE_WORKFLOW} --repo ${NODE_PRICE_REPO}`;
const TOKEN_FIX = 'Create a fine-grained GitHub token (repository 99redder/eastern-shore-ai, Actions: read and write) and save it with:\n'
  + 'cd ~/Websites/eastern-shore-ai/worker && npx wrangler secret put GITHUB_DISPATCH_TOKEN --config wrangler.toml';

export function easternMidnightHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(hour) === 0;
}

function dayAfter(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// What changes on this Eastern date: a sale starts, or yesterday was a sale's
// last day. null on every other day.
export function priceChangeToday(now = new Date()) {
  const today = easternDate(now);
  for (const sale of NODE_SALES) {
    if (today === sale.start) return { kind: 'start', sale };
    if (today === dayAfter(sale.end)) return { kind: 'end', sale };
  }
  return null;
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'eastern-shore-ai-contact-worker'
  };
}

async function startWorkflow(token, fetchImpl) {
  try {
    const res = await fetchImpl(`${WORKFLOW_API}/dispatches`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' })
    });
    if (res.status === 204) return { ok: true };
    const body = (await res.text().catch(() => '')).slice(0, 300);
    return { ok: false, error: `GitHub answered ${res.status}${body ? `: ${body}` : ''}` };
  } catch (err) {
    return { ok: false, error: `GitHub could not be reached: ${err?.message || err}` };
  }
}

// GitHub's expiry header: "2026-12-01 05:00:00 UTC" or "2026-12-01 00:00:00 -0500".
export function parseGithubTime(value) {
  const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) (UTC|[+-]\d{4})$/.exec((value || '').trim());
  if (!m) return NaN;
  const zone = m[3] === 'UTC' ? 'Z' : `${m[3].slice(0, 3)}:${m[3].slice(3)}`;
  return Date.parse(`${m[1]}T${m[2]}${zone}`);
}

// Reads the workflow with the token: proves the token still works and returns
// the days until it expires (null when it has no expiry).
async function checkToken(token, now, fetchImpl) {
  try {
    const res = await fetchImpl(WORKFLOW_API, { headers: githubHeaders(token) });
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
    const data = await res.json().catch(() => ({}));
    const expires = res.headers.get('github-authentication-token-expiration');
    const expiresAt = parseGithubTime(expires);
    const daysLeft = Number.isFinite(expiresAt) ? Math.floor((expiresAt - now.getTime()) / 86400000) : null;
    return { ok: true, daysLeft, workflowState: data.state || '' };
  } catch (err) {
    return { ok: false, error: `GitHub could not be reached: ${err?.message || err}` };
  }
}

function describe(change) {
  return change.kind === 'start'
    ? `the ${change.sale.name} starts today, so the price should drop to $299.99`
    : `the ${change.sale.name} ended yesterday, so the price should be back to $349.99`;
}

// 12:01 AM Eastern, every night.
export async function runNodePriceDispatch(env, { now = new Date(), notify, fetchImpl = fetch } = {}) {
  if (!easternMidnightHour(now)) return { skipped: 'not midnight Eastern' };
  const token = (env.GITHUB_DISPATCH_TOKEN || '').toString().trim();
  const change = priceChangeToday(now);
  const alert = (subject, text) => notify?.({ subject, text });

  if (!token) {
    await alert(
      change ? '[ACTION NEEDED] Survival Node price did not switch tonight' : '[ACTION NEEDED] Survival Node price switch has no GitHub token',
      `The worker has no GITHUB_DISPATCH_TOKEN, so it can't start the Survival Node price workflow at midnight.\n`
      + (change ? `Tonight ${describe(change)}. ${MANUAL_FIX}\n\n` : '\n') + TOKEN_FIX
    );
    return { ok: false, change, error: 'no token' };
  }

  if (change) {
    const started = await startWorkflow(token, fetchImpl);
    if (!started.ok) {
      await alert(
        '[ACTION NEEDED] Survival Node price did not switch tonight',
        `Tonight ${describe(change)}, but the worker could not start the GitHub workflow.\n${started.error}\n\n`
        + `${MANUAL_FIX}\nMeta reads the feed at 1:00 AM Eastern. If that has passed, also ask for an update of the data feed in Commerce Manager.\n\n`
        + `If the token is the problem:\n${TOKEN_FIX}`
      );
    }
    return { ...started, change, dispatched: started.ok };
  }

  const check = await checkToken(token, now, fetchImpl);
  if (!check.ok) {
    await alert(
      '[ACTION NEEDED] Survival Node price switch: GitHub token is not working',
      `The nightly check of GITHUB_DISPATCH_TOKEN failed: ${check.error}\n`
      + `Until it is fixed, the Survival Node price and the Meta feed won't switch at midnight on sale nights.\n\n${TOKEN_FIX}`
    );
  } else if (check.daysLeft !== null && check.daysLeft <= TOKEN_EXPIRY_WARN_DAYS) {
    await alert(
      `[ACTION NEEDED] Survival Node price switch: GitHub token expires in ${Math.max(check.daysLeft, 0)} day${check.daysLeft === 1 ? '' : 's'}`,
      `GITHUB_DISPATCH_TOKEN expires soon. After that, the Survival Node price and the Meta feed won't switch at midnight on sale nights.\n\n${TOKEN_FIX}`
    );
  } else if (check.workflowState && check.workflowState !== 'active') {
    await alert(
      '[ACTION NEEDED] Survival Node price workflow is turned off on GitHub',
      `GitHub reports the "${NODE_PRICE_WORKFLOW}" workflow as "${check.workflowState}". Turn it back on in the repo's Actions tab, or sale nights won't switch the price.`
    );
  }
  return { ...check, change: null, dispatched: false };
}

// The feed's sale_price cell (second row), from the CSV text.
export function feedSalePrice(csv) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const column = (rows[0] || []).indexOf('sale_price');
  if (column < 0 || !rows[1]) return null;
  return (rows[1][column] || '').trim();
}

// 12:31 AM Eastern, on price-change nights only.
export async function runNodePriceFeedCheck(env, { now = new Date(), notify, fetchImpl = fetch } = {}) {
  if (!easternMidnightHour(now)) return { skipped: 'not midnight Eastern' };
  const change = priceChangeToday(now);
  if (!change) return { skipped: 'no price change today' };

  const wantSale = Boolean(nodePrice(now).sale);
  let problem = '';
  try {
    const res = await fetchImpl(META_FEED_URL);
    const salePrice = res.ok ? feedSalePrice(await res.text()) : null;
    if (!res.ok) problem = `the feed answered ${res.status}`;
    else if (salePrice === null) problem = 'the feed has no sale_price column or no item row';
    else if (wantSale && !salePrice) problem = 'the feed has no sale price yet';
    else if (!wantSale && salePrice) problem = `the feed still shows the sale price (${salePrice})`;
  } catch (err) {
    problem = `the feed could not be read: ${err?.message || err}`;
  }
  if (!problem) return { ok: true, change };

  const token = (env.GITHUB_DISPATCH_TOKEN || '').toString().trim();
  const retry = token ? await startWorkflow(token, fetchImpl) : { ok: false, error: 'no GITHUB_DISPATCH_TOKEN' };
  await notify?.({
    subject: '[ACTION NEEDED] Survival Node Meta feed has the wrong price tonight',
    text: `Tonight ${describe(change)}, but at 12:31 AM Eastern ${problem}.\n`
      + (retry.ok
        ? 'The worker started the GitHub workflow again. It may still land before Meta reads the feed at 1:00 AM Eastern.\n'
        : `The worker could not start the GitHub workflow again (${retry.error}).\n`)
      + `\nCheck ${META_FEED_URL} and the repo's Actions tab. ${MANUAL_FIX}\n`
      + 'If the feed is fixed after 1:00 AM Eastern, ask for an update of the data feed in Commerce Manager so Facebook and Instagram pick it up today.'
  });
  return { ok: false, change, problem, retried: retry.ok };
}
