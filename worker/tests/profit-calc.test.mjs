// Survival Node Profit tab (admin-profit.js): kit costs, shipping labels, Stripe and eBay fees are
// worked out from Tax Ledger rows, and one kit's profit follows from them. The profit math is
// copied out of admin-profit.js (between "Profit math" and "end profit math") together with the
// parts pricing helpers it builds on from admin.js, and run on made-up ledger rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function loadProfitMath() {
  const admin = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const helpers = admin.slice(admin.indexOf('    // ===== Parts count pricing ====='), admin.indexOf('    // ===== DOM Refs ====='));
  const profit = readFileSync(new URL('../../admin-profit.js', import.meta.url), 'utf8');
  const start = profit.indexOf('  // ----- Profit math');
  const end = profit.indexOf('  // ----- end profit math -----');
  assert.ok(helpers.length > 100 && start > 0 && end > start, 'markers found in admin.js and admin-profit.js');
  return new Function(`${helpers}\n${profit.slice(start, end)}\nreturn { profitBooks, profitFor };`)();
}

const { profitBooks, profitFor } = loadProfitMath();

let nextId = 1;
const exp = (date, category, cents, notes, vendor = '') => ({ id: nextId++, date, category, amount_cents: cents, notes, vendor });
const inc = (date, cents, session, notes = '') => ({ id: nextId++, date, category: 'Survival Node Sales', source: session.startsWith('ebay:') ? 'eBay' : 'Stripe - Survival Node', amount_cents: cents, stripe_session_id: session, notes });
const INV = 'Inventory - Survival Node Components';

function ledger() {
  nextId = 1;
  const phoneA = exp('2026-03-09', INV, 31175, '(7) Moto G Power Phones');
  const expenses = [
    phoneA,
    exp('2026-02-28', INV, 12239, 'OnePlus 8 5G UW 128GB 8GB Phone [owner-funded]'),
    exp('2026-11-02', INV, 23596, 'Purchased 4 Moto G Power 2024 Phones'),
    exp('2026-11-03', INV, 6409, '(1) Moto G Power 2024 Phone'),
    exp('2026-03-01', INV, 4027, 'Jack Boss Hard Case'),
    exp('2026-03-06', INV, -4027, 'Refund for case to offset other record entry'),
    exp('2026-03-26', INV, 22170, '(10) Hard Cases'),
    exp('2026-04-08', INV, 9800, '(4) Mission Darkness Faraday Bags'),
    exp('2026-03-06', INV, 3526, '(2) Standard Faraday Bag Sets'),
    exp('2026-09-11', INV, 7398, 'Two Solar Batteries (Gen 2)'),
    exp('2026-03-09', INV, 19790, '10 Solar Batteries'),
    exp('2026-10-14', INV, 3598, 'Solar Battery and 4 Charging Blocks'),
    exp('2026-11-01', INV, 7029, '25 pack of charging blocks'),
    exp('2026-10-29', INV, 4179, '12 locks for Survival Node hard cases'),
    exp('2026-11-02', INV, 3594, '(6) Phone Cases'),
    exp('2026-03-16', INV, 4799, '24 pack of rechargable dessicant'),
    exp('2026-03-10', 'Taxes - Sales & Use', 1769, `MD sales tax on resale purchase, claim on Form 202 line 35 (expense #${phoneA.id}: (7) Moto G Power Phones)`),
    exp('2026-07-01', 'Taxes - Sales & Use', 63, 'Q2 2026 MD Sales & Use Tax remittance'),
    // Shipping: three labels, a reship and a phone-only label (both left out of the average)
    exp('2026-11-01', 'Shipping - Survival Node Fulfillment', 1404, 'SN Order 26011 Shipping Label'),
    exp('2026-11-02', 'Shipping - Survival Node Fulfillment', 1264, 'SN0012 Shipping Label'),
    exp('2026-11-03', 'Shipping - Survival Node Fulfillment', 1659, 'SN0013 Shipping Label'),
    exp('2026-04-20', 'Shipping - Survival Node Fulfillment', 4850, 'Reshipment of order # SN26011'),
    exp('2026-10-14', 'Shipping - Survival Node Fulfillment', 709, 'Shipping label | eBay order 23-15269-87248 | Survival Node Gen 2 (Phone Only)'),
    // Stripe fees: two kit sales (card) and one Folder to Film sale that isn't a kit
    exp('2026-11-01', 'Payment Processing Fees', 1045, 'Auto Stripe fee for session cs_live_kitA', 'Stripe'),
    exp('2026-11-02', 'Payment Processing Fees', 1045, 'Auto Stripe fee for session cs_live_kitB', 'Stripe'),
    exp('2026-11-15', 'Payment Processing Fees', 61, 'Auto Stripe fee for Folder to Film session cs_live_film', 'Stripe'),
    // eBay order: fee, ad and label rows carry the order number
    exp('2026-11-16', 'Payment Processing Fees', 5424, 'Transaction fees | eBay order 19-15419-56694', 'eBay'),
    exp('2026-11-16', 'Shipping - Survival Node Fulfillment', 1688, 'Shipping label | eBay order 19-15419-56694', 'eBay'),
    exp('2026-11-16', 'Advertising/Marketing', 4751, 'Promoted listing / ad fee | eBay order 19-15419-56694', 'eBay'),
    exp('2026-10-14', 'Payment Processing Fees', 1543, 'Transaction fees | eBay order 23-15269-87248 | Survival Node Gen 2 (Phone Only)', 'eBay')
  ];
  const income = [
    inc('2026-11-01', 34999, 'cs_live_kitA'),
    inc('2026-11-02', 34999, 'cs_live_kitB'),
    { ...inc('2026-11-15', 1059, 'cs_live_film'), category: 'Folder to Film Sales' },
    inc('2026-11-16', 36998, 'ebay:19-15419-56694', 'eBay order 19-15419-56694 | Item subtotal $349.99 | Buyer shipping $19.99 | eBay-collected sales tax $25.90 (excluded from income)'),
    inc('2026-10-14', 9999, 'ebay:23-15269-87248', 'eBay order 23-15269-87248 | Item subtotal $99.99 | Buyer shipping $0.00 | eBay-collected sales tax $10.50 (excluded from income) | Survival Node Gen 2 (Phone Only)')
  ];
  return { expenses, income };
}

const part = (books, line) => books.parts.find((p) => p.line === line);

test('profit tab: kit parts are averaged per unit, with refunds, test phones and Gen 1 parts left out', () => {
  const { expenses, income } = ledger();
  const books = profitBooks(expenses, income);

  const phone = part(books, 'phone');
  assert.equal(phone.units, 12, '7 + 4 + 1 Moto phones; the OnePlus test phone is left out');
  assert.equal(Math.round(phone.avg.plain), Math.round((31175 + 23596 + 6409) / 12));
  assert.equal(Math.round(phone.avg.tax), Math.round((31175 + 23596 + 6409 + 1769) / 12), 'the tax row "(expense #N" belongs to its purchase');
  // Latest restock: Nov 3's phone plus Nov 2's four (within a week of the newest); March isn't included.
  assert.equal(phone.recentUnits, 5);
  assert.equal(Math.round(phone.latest.plain), Math.round((23596 + 6409) / 5));

  const hardCase = part(books, 'hardCase');
  assert.equal(hardCase.units, 10, 'the refunded Jack Boss case cancels out');
  assert.equal(Math.round(hardCase.avg.plain), 2217);

  assert.equal(Math.round(part(books, 'faradayMD').avg.plain), 2 * 2450, 'two Mission Darkness bags per kit');
  assert.equal(Math.round(part(books, 'solarGen2').avg.plain), 3699, 'only Gen 2 batteries ($30+ or marked Gen 2)');
  assert.equal(part(books, 'charger').units, 25, 'the mixed battery-and-blocks order prices neither');
  assert.equal(Math.round(part(books, 'lock').avg.plain), Math.round(4179 / 12));
  assert.equal(part(books, 'phoneCase').units, 6);

  const reasons = Object.fromEntries(books.leftOut.map((l) => [l.text.slice(0, 18), l.reason]));
  assert.equal(reasons['OnePlus 8 5G UW 12'], 'test phone, not in kits');
  assert.equal(reasons['(2) Standard Farad'], 'standard Faraday bag (Gen 1)');
  assert.equal(reasons['10 Solar Batteries'], 'Gen 1 solar battery or power bank');
  assert.equal(reasons['24 pack of recharg'], 'desiccant (part of shipping supplies)');
  assert.equal(reasons['Solar Battery and '], 'more than one kind of part in one price');
});

test('profit tab: a purchase whose note has no count is flagged when its unit price is far too high', () => {
  const { expenses, income } = ledger();
  expenses.push(
    exp('2026-10-28', INV, 7398, '2 Solar Batteries (Gen 2)'),
    exp('2026-11-03', INV, 7398, 'Solar Batteries (Gen 2)') // a 2-pack noted without its count
  );
  const battery = part(profitBooks(expenses, income), 'solarGen2');
  const flagged = battery.lots.filter((l) => l.check).map((l) => l.text);
  assert.deepEqual(flagged, ['Solar Batteries (Gen 2)'], 'read as one battery at $73.98, double the usual $36.99');
  assert.equal(part(profitBooks(...Object.values(ledger())), 'solarGen2').lots.some((l) => l.check), false, 'nothing flagged when every count is there');
});

test('profit tab: shipping labels, Stripe rate and eBay sales come from their own rows', () => {
  const { expenses, income } = ledger();
  const books = profitBooks(expenses, income);

  assert.equal(books.labels.length, 4, 'three website labels and the eBay label; the reship and the phone-only label are left out');
  assert.deepEqual(books.labelsOut.map((l) => l.cents).sort((a, b) => a - b), [709, 4850]);
  assert.equal(Math.round(books.labelAvg), Math.round((1404 + 1264 + 1659 + 1688) / 4));

  assert.equal(books.siteSales.length, 2, 'only kit sales, paired with their fee by session id');
  assert.ok(Math.abs(books.stripeRate - (2 * 1045 - 60) / (2 * 34999) * 100) < 1e-9);

  assert.equal(books.ebay.length, 2);
  const kit = books.ebay.find((s) => s.order === '19-15419-56694');
  assert.deepEqual(
    { item: kit.item, ship: kit.ship, tax: kit.tax, fee: kit.fee, ad: kit.ad, label: kit.label, gen2: kit.gen2 },
    { item: 34999, ship: 1999, tax: 2590, fee: 5424, ad: 4751, label: 1688, gen2: true }
  );
  const phoneOnly = books.ebay.find((s) => s.order === '23-15269-87248');
  assert.equal(phoneOnly.phoneOnly, true);
  assert.equal(phoneOnly.gen2, false);
  assert.equal(phoneOnly.label, 709);
});

test('profit tab: eBay fees and the ad rate are charged on the whole order; Stripe only on the price', () => {
  const c = { hardware: 16872, label: 1688, supplies: 450, stripePct: 2.9, stripeFixed: 30, ebayShip: 1999, coupon: 0, ebayTax: 7, fvfPct: 13.6, fvfFixed: 40, adPct: 12 };
  const ebay = profitFor('ebay', 34999, c);
  assert.equal(Math.round(ebay.revenue), 36998);
  assert.equal(Math.round(ebay.fee), 5424, '13.6% of $395.88 + 40 cents, the Nov 16 sale exactly');
  assert.equal(Math.round(ebay.ads), 4751, '12% of $395.88');
  assert.ok(Math.abs(ebay.profit - (36998 - 16872 - 1688 - 450 - ebay.fee - ebay.ads)) < 1e-9);
  assert.ok(Math.abs(ebay.profit - 7813) <= 1, 'about $78.13, the Nov 16 sale');

  const withCoupon = profitFor('ebay', 34999, { ...c, coupon: 2000 });
  assert.equal(Math.round(withCoupon.revenue), 34998, 'a coupon comes off the kit price');

  const site = profitFor('site', 34999, c);
  assert.equal(Math.round(site.fee), Math.round(34999 * 0.029 + 30));
  assert.equal(site.ads, 0);
  assert.equal(Math.round(site.profit), Math.round(34999 - 16872 - 1688 - 450 - (34999 * 0.029 + 30)));
});
