// Survival Node Gen 2 price by date: $249.99 during a seasonal sale, $349.99
// the rest of the time (the breaks between sales, and after the last one).
// Dates are Eastern and inclusive, so a sale ends at midnight after its end date.
// KEEP IN SYNC with SALES in /seasonal-sale.js (tests/node-price.test.mjs checks).
// tools/node-price-pages.mjs uses these to keep node.html, buynode.html and
// merchant-feed.xml on the right price (run daily by .github/workflows/node-price.yml).

export const NODE_REGULAR_CENTS = 34999;
export const NODE_SALE_CENTS = 24999;

export const NODE_SALES = [
  { key: 'halloween', name: 'Halloween Sale', start: '2026-10-01', end: '2026-10-31', endsLong: 'October 31' },
  { key: 'thanksgiving', name: 'Thanksgiving Sale', start: '2026-11-09', end: '2026-11-26', endsLong: 'November 26' },
  { key: 'christmas', name: 'Christmas Sale', start: '2026-12-01', end: '2026-12-25', endsLong: 'December 25' }
];

// en-CA formats as YYYY-MM-DD, which compares correctly as a string
export function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

export function nodePrice(now = new Date()) {
  const today = easternDate(now);
  const sale = NODE_SALES.find((s) => today >= s.start && today <= s.end) || null;
  return { cents: sale ? NODE_SALE_CENTS : NODE_REGULAR_CENTS, sale };
}

// The running sale, or the next one to start; null once the last has ended.
export function currentOrNextSale(now = new Date()) {
  const today = easternDate(now);
  return NODE_SALES.find((s) => today <= s.end) || null;
}

// One line for Ask K and its canned replies.
export function nodePriceSentence(now = new Date()) {
  const { sale } = nodePrice(now);
  return sale
    ? `Survival Node Gen 2 is regularly $349.99, now $249.99 in the ${sale.name} through ${sale.endsLong} (save $100), while supplies last`
    : 'Survival Node Gen 2 is $349.99';
}
