// Approved one-tap Survival Node reviews (worker/src/reviews.js) → node.html.
//
// Reads GET /api/reviews/public and, once at least `minToShow` (3) reviews are
// approved, writes:
//   - a "Customer reviews" section between the reviews:start / reviews:end markers
//     (right after the eBay owner quote), every approved review, newest first
//   - "aggregateRating" and "review" lines in node.html's Product JSON-LD
//     (reviews with an anonymous name count in the rating but aren't listed as
//     JSON-LD reviews, which need an author name)
// Below the threshold it clears both, so the page shows nothing. tools/chatgpt-feed.mjs
// reads the aggregateRating back for the ChatGPT feed's review_count / star_rating.
// If the API can't be reached the page is left as it is (never wiped on a hiccup).
// .github/workflows/node-price.yml runs this nightly before the feeds.
//
//   node tools/node-reviews.mjs                 fetch and apply
//   node tools/node-reviews.mjs --file x.json   apply a saved /api/reviews/public reply
//   node tools/node-reviews.mjs --check         exit 1 if node.html is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REVIEWS_API = 'https://eastern-shore-ai-contact.99redder.workers.dev/api/reviews/public';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- reviews:start (tools/node-reviews.mjs writes this from approved reviews; don\'t edit by hand) -->';
const END = '<!-- reviews:end -->';
const JSONLD_ANCHOR = '      "url": "https://www.easternshore.ai/node.html",\n      "offers": {';
const MAX_JSONLD_REVIEWS = 10;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const monthYear = (d) => {
  const t = Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
};

function cleanData(data) {
  const reviews = (Array.isArray(data?.reviews) ? data.reviews : [])
    .map((r) => ({ rating: Math.round(Number(r.rating)), comment: String(r.comment || '').trim(), name: String(r.name || '').trim() || 'Verified buyer', date: String(r.date || '').slice(0, 10) }))
    .filter((r) => r.rating >= 1 && r.rating <= 5);
  const count = reviews.length;
  const average = count ? Math.round(reviews.reduce((s, r) => s + r.rating, 0) / count * 10) / 10 : 0;
  return { reviews, count, average, minToShow: Number(data?.minToShow) || 3 };
}

export function reviewsSectionHtml(data) {
  const { reviews, count, average, minToShow } = cleanData(data);
  if (count < minToShow) return '';
  const items = reviews.map((r) => `        <li>
          <div class="review-head"><span class="review-stars" aria-label="${r.rating} out of 5 stars">${starText(r.rating)}</span> <strong>${esc(r.name)}</strong> <span class="review-verified"><span aria-hidden="true">✓</span> Verified buyer</span>${r.date ? ` <span class="review-date">${esc(monthYear(r.date))}</span>` : ''}</div>${r.comment ? `\n          <p>${esc(r.comment).replace(/\n+/g, '<br>')}</p>` : ''}
        </li>`).join('\n');
  return `
    <section class="card site-reviews" id="reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title">Customer reviews</h2>
      <p class="reviews-summary"><span class="review-stars" aria-hidden="true">${starText(Math.round(average))}</span> <strong>${average.toFixed(1)} out of 5</strong> from ${count} verified buyer${count === 1 ? '' : 's'}</p>
      <ul class="review-list">
${items}
      </ul>
    </section>
    `;
}

export function reviewsJsonLdLines(data) {
  const { reviews, count, average, minToShow } = cleanData(data);
  if (count < minToShow) return '';
  const agg = { '@type': 'AggregateRating', ratingValue: average.toFixed(1), reviewCount: count, bestRating: 5, worstRating: 1 };
  const list = reviews.filter((r) => r.name !== 'Verified buyer').slice(0, MAX_JSONLD_REVIEWS).map((r) => ({
    '@type': 'Review',
    reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
    author: { '@type': 'Person', name: r.name },
    ...(r.date ? { datePublished: r.date } : {}),
    ...(r.comment ? { reviewBody: r.comment } : {}),
  }));
  // Escape < > & so a comment containing "</script>" can't end the JSON-LD <script> block.
  const safe = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `      "aggregateRating": ${safe(agg)},\n` + (list.length ? `      "review": ${safe(list)},\n` : '');
}

export function applyReviews(html, data) {
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s < 0 || e < s) throw new Error('node-reviews: reviews markers not found in node.html');
  html = html.slice(0, s + START.length) + reviewsSectionHtml(data) + html.slice(e);
  // Product JSON-LD: drop old lines, then add the current ones before "url" + "offers".
  html = html.replace(/^ {6}"aggregateRating": .*\n/m, '').replace(/^ {6}"review": \[.*\n/m, '');
  if (!html.includes(JSONLD_ANCHOR)) throw new Error('node-reviews: Product JSON-LD anchor not found');
  return html.replace(JSONLD_ANCHOR, reviewsJsonLdLines(data) + JSONLD_ANCHOR);
}

// The aggregateRating node.html carries, for the ChatGPT feed ({count, average} or null).
export function aggregateFromPage(html) {
  const m = String(html || '').match(/^ {6}"aggregateRating": (\{.*\}),$/m);
  if (!m) return null;
  try {
    const a = JSON.parse(m[1]);
    return { count: Number(a.reviewCount) || 0, average: Number(a.ratingValue) || 0 };
  } catch { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : '';
  let data;
  try {
    if (fileArg) data = JSON.parse(readFileSync(fileArg, 'utf8'));
    else {
      const res = await fetch(REVIEWS_API, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'easternshore-node-reviews/1' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      if (!data.ok) throw new Error(data.error || 'not ok');
    }
  } catch (e) {
    console.warn(`Survival Node reviews: couldn't read approved reviews (${e.message}); node.html left as it is.`);
    return;
  }
  const path = join(ROOT, 'node.html');
  const before = readFileSync(path, 'utf8');
  const after = applyReviews(before, data);
  const { count, average, minToShow } = cleanData(data);
  const state = count >= minToShow ? `${count} approved, average ${average.toFixed(1)}, shown` : `${count} approved, hidden until ${minToShow}`;
  if (after === before) { console.log(`Survival Node reviews: ${state}. node.html already up to date.`); return; }
  if (check) { console.log(`Survival Node reviews: ${state}. Out of date: node.html`); process.exit(1); }
  writeFileSync(path, after);
  console.log(`Survival Node reviews: ${state}. Updated: node.html`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
