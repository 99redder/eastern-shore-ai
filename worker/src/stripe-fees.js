// Stripe processing fees for the books.
//
// When a payment comes in, Stripe often hasn't posted its fee yet (Klarna
// especially), so the fee row starts as an estimate at the rate for the way
// the customer paid. reconcileEstimatedStripeFees() runs with the daily cron
// and replaces each estimate with Stripe's real fee once it exists.

// Stripe's standard US rates (stripe.com/pricing and
// stripe.com/pricing/local-payment-methods, checked 2026-10-29). Anything not
// listed is estimated at the card rate.
const FEE_RATES = {
  card: { pct: 0.029, fixed: 30 },
  link: { pct: 0.029, fixed: 30 },
  cashapp: { pct: 0.029, fixed: 30 },
  klarna: { pct: 0.0599, fixed: 30 },
  affirm: { pct: 0.06, fixed: 30 },
  afterpay_clearpay: { pct: 0.06, fixed: 30 },
  us_bank_account: { pct: 0.008, fixed: 0, max: 500 }
};

export function estimateStripeFeeCents(amountCents, method = 'card') {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const rate = FEE_RATES[method] || FEE_RATES.card;
  const fee = Math.round(amountCents * rate.pct) + rate.fixed;
  return rate.max ? Math.min(fee, rate.max) : fee;
}

export async function stripeGet(secretKey, path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const data = await res.json().catch(() => ({}));
  return res.ok ? data : null;
}

// Fee for a payment: Stripe's real fee once its balance transaction exists,
// otherwise an estimate at the rate for the payment method used.
export async function stripeFee(secretKey, paymentIntentId, amountCents) {
  let method = '';
  if (secretKey && paymentIntentId) {
    try {
      const pi = await stripeGet(secretKey, `payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge.balance_transaction&expand[]=payment_method`);
      const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      method = charge?.payment_method_details?.type || pi?.payment_method?.type || '';
      let bt = charge?.balance_transaction;
      if (typeof bt === 'string') bt = await stripeGet(secretKey, `balance_transactions/${encodeURIComponent(bt)}`);
      const fee = Number(bt?.fee || 0);
      if (Number.isFinite(fee) && fee > 0) return { cents: fee, estimated: false, method };
    } catch (e) {
      console.error('Stripe fee lookup failed', e);
    }
  }
  return { cents: estimateStripeFeeCents(amountCents, method || 'card'), estimated: true, method };
}

// Payment intent behind a Checkout Session (cs_) or an invoice (in_). Older
// Stripe API versions put an invoice's on the invoice; newer ones list it
// under invoice_payments.
async function paymentIntentForRef(secretKey, ref) {
  const id = (v) => (v && typeof v === 'object' ? v.id : v) || '';
  let invoiceId = ref.startsWith('in_') ? ref : '';
  if (ref.startsWith('cs_')) {
    const session = await stripeGet(secretKey, `checkout/sessions/${encodeURIComponent(ref)}`);
    if (session?.payment_intent) return id(session.payment_intent);
    invoiceId = id(session?.invoice);
  }
  if (!invoiceId) return '';
  const invoice = await stripeGet(secretKey, `invoices/${encodeURIComponent(invoiceId)}`);
  if (invoice?.payment_intent) return id(invoice.payment_intent);
  const list = await stripeGet(secretKey, `invoice_payments?invoice=${encodeURIComponent(invoiceId)}&limit=3`);
  return id((list?.data || []).find((p) => p?.payment?.payment_intent)?.payment?.payment_intent);
}

// The three estimated note forms the webhooks write, and the note each takes
// once it holds the real fee (both forms are in the webhooks' dedupe checks).
const ESTIMATED_FEES_SQL = `SELECT * FROM tax_expenses
  WHERE vendor = 'Stripe' AND category = 'Payment Processing Fees'
    AND (notes LIKE 'Estimated Stripe fee for session %' OR notes LIKE 'Auto Stripe fee for % (estimated)')
  ORDER BY id DESC LIMIT ?1`;

function actualFeeNote(note) {
  return note.replace(/^Estimated Stripe fee for session /, 'Auto Stripe fee for session ').replace(/ \(estimated\)$/, '');
}

const usd = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;

// Daily: swap estimated fee rows (and their journal entries) for Stripe's real
// fee, and email the owner when an amount changed. Rows Stripe still has no
// fee for stay estimated and are tried again the next day.
export async function reconcileEstimatedStripeFees(env, { upsertTaxExpenseJournal, notify, limit = 25 }) {
  if (!env.DB || !env.STRIPE_SECRET_KEY) return [];
  const { results = [] } = await env.DB.prepare(ESTIMATED_FEES_SQL).bind(limit).all();
  const updated = [];
  for (const row of results) {
    const ref = (String(row.notes || '').match(/\b(?:cs|in)_[A-Za-z0-9_]+/) || [])[0];
    if (!ref) continue;
    try {
      const paymentIntentId = await paymentIntentForRef(env.STRIPE_SECRET_KEY, ref);
      const fee = paymentIntentId ? await stripeFee(env.STRIPE_SECRET_KEY, paymentIntentId, 0) : null;
      if (!fee || fee.estimated) continue;
      const notes = actualFeeNote(String(row.notes));
      await env.DB.prepare(`UPDATE tax_expenses SET amount_cents = ?1, notes = ?2 WHERE id = ?3`).bind(fee.cents, notes, row.id).run();
      await upsertTaxExpenseJournal(env.DB, { ...row, amount_cents: fee.cents, notes });
      updated.push({ id: row.id, date: row.expense_date, ref, method: fee.method || 'unknown', from: Number(row.amount_cents || 0), to: fee.cents });
    } catch (e) {
      console.error('Stripe fee check failed', { id: row.id, ref, error: e?.message || e });
    }
  }

  const changed = updated.filter((u) => u.from !== u.to);
  if (changed.length && notify) {
    const confirmed = updated.length - changed.length;
    const text = [
      `Stripe has posted its real fee for ${changed.length === 1 ? 'a payment' : `${changed.length} payments`} that the books had estimated. The Tax Ledger now shows:`,
      '',
      ...changed.map((u) => `${u.date}  ${u.method}  ${usd(u.from)} -> ${usd(u.to)}  (${u.ref})`),
      ...(confirmed ? ['', `${confirmed} other estimate${confirmed === 1 ? ' was' : 's were'} already right.`] : [])
    ].join('\n');
    try {
      await notify({ subject: 'Stripe fees corrected in the books', text });
    } catch (e) {
      console.error('Stripe fee email failed', e);
    }
  }
  return updated;
}
