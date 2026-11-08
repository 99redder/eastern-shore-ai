# Shipping Insurance Reimbursement Accounting

## Rule

A USPS (or other carrier) claim payment for a lost or damaged business shipment is **business income**, even when the check is made out to Chris personally or the label was bought with personal funds.

Why: the business already deducted what the claim pays back (the label as a shipping expense, the parts in the box as inventory expense), so the recovery goes back into income.
- IRS Publication 547, "Loss of inventory": when the loss runs through cost of goods sold, "include any insurance or other reimbursement you receive for the loss in gross income."
- IRS Publication 334, "Recovery of items previously deducted": "include the recovery in income on Schedule C."
- A single-member LLC is "disregarded as separate from its owner" for income tax, so a check payable to the owner doesn't make it personal money, and costs from just before the LLC was approved are reported on the same Schedule C.

It is **not** an owner contribution: that would leave the deducted costs in place and keep the recovery out of income.

## How to book it in admin.html

1. Deposit the check into Bluevine.
2. Tax Ledger > Add Income:
   - **Category:** `Shipping Insurance Reimbursement`
   - **Source:** the carrier (e.g. `USPS`)
   - **Amount:** the full check (insurance + any postage refund), positive
   - **Date:** the deposit date
   - **Notes:** what was lost, the label's expense #, the reship expense #, and that it was deposited to Bluevine
   - Owner funded: **off**
3. Book it as one row for the whole check, so it matches the single deposit in Reconciliation.

Don't use the `Shipping Insurance Reimbursement` *expense* category for a claim payment: a positive expense lowers profit, the opposite of a recovery.

Form 202 isn't affected: line 3 counts direct sales only.

## History

- 2026-04-14: USPS paid $119.97 ($100 standard insurance + $19.97 postage) for the first Survival Node shipment (label expense #61 on Mar 15, paid personally a few days before the LLC was approved; reshipped by UPS, expense #70). The check was made out to Chris and deposited to Bluevine. It was first booked as an owner transfer (journal #333).
- 2026-11-08: Rebooked as income #29 (`Shipping Insurance Reimbursement`, $119.97), with manual journal #3056 reversing transfer #333. Owner Contributions went from $6,188.92 to $6,068.95, and 2026 profit rose $119.97. Bluevine's cash didn't change.

## Documents to keep

- The USPS claim approval and the check (or deposit confirmation)
- The original label receipt and tracking showing the package was lost
