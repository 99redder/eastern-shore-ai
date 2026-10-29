import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateStripeFeeCents } from '../src/stripe-fees.js';

test('fee estimates follow the payment method', () => {
  assert.equal(estimateStripeFeeCents(24999), 755); // card 2.9% + 30¢
  assert.equal(estimateStripeFeeCents(24999, 'link'), 755);
  assert.equal(estimateStripeFeeCents(24999, 'klarna'), 1527); // 5.99% + 30¢
  assert.equal(estimateStripeFeeCents(24999, 'affirm'), 1530); // 6% + 30¢
  assert.equal(estimateStripeFeeCents(24999, 'afterpay_clearpay'), 1530);
  assert.equal(estimateStripeFeeCents(24999, 'us_bank_account'), 200); // 0.8%
  assert.equal(estimateStripeFeeCents(100000, 'us_bank_account'), 500); // capped at $5
  assert.equal(estimateStripeFeeCents(24999, 'some_new_method'), 755); // unknown: card rate
  assert.equal(estimateStripeFeeCents(0, 'klarna'), 0);
});
