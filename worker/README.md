# Contact Form Worker (Cloudflare + Resend)

This worker receives contact/domain-offer form submissions and emails them to `easternshoreai@outlook.com`.

## 1) Install and login

- `npm i -g wrangler`
- `wrangler login`

## 2) Configure sender domain in Resend

- Verify a sending domain in Resend (for `FROM_EMAIL` in `wrangler.toml`, e.g. `noreply@easternshore.ai`).

## 3) Set secrets

- `wrangler secret put RESEND_API_KEY`
- `wrangler secret put STRIPE_SECRET_KEY`
- `wrangler secret put STRIPE_WEBHOOK_SECRET`
- `wrangler secret put ADMIN_PASSWORD`

## 4) Deploy

- `cd worker`
- `wrangler deploy`

Default endpoints used by the site:

- Contact/questions: `https://eastern-shore-ai-contact.99redder.workers.dev/api/contact`
- Stripe checkout session: `https://eastern-shore-ai-contact.99redder.workers.dev/api/checkout-session`
- Stripe webhook: `https://eastern-shore-ai-contact.99redder.workers.dev/api/stripe-webhook`
- Public availability read: `https://eastern-shore-ai-contact.99redder.workers.dev/api/availability`
- Admin bookings read: `https://eastern-shore-ai-contact.99redder.workers.dev/api/bookings?key=YOUR_ADMIN_API_KEY&limit=20`
- Admin block/unblock slot: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/admin/block-slot?key=YOUR_ADMIN_API_KEY`
- Admin invoices list/create: `GET/POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/invoices`
- Admin invoice detail (with line items): `GET https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/invoices/detail?id=123`
- Admin invoice update: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/invoices/update`
- Admin invoice send email: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/invoices/send`

## Notes

- Invoice create payload expects `customerName`, `customerEmail`, `issueDate`, `dueDate`, `descriptionOfWork` (or `notes`), and `items[]` where each item has `description`, optional `quantity`, and `unitAmountCents` (or `unitAmount` in dollars).
- Invoice detail endpoint returns the invoice row plus `line_items[]` for modal prefill/editing.
- Invoice update payload expects `{ id, customerName, customerEmail, dueDate, descriptionOfWork|notes, items[] }` and replaces line items while recalculating subtotal/tax/total/balance using existing `amount_paid_cents`.
- Invoice send payload expects `{ "id": <invoiceId> }` and sends branded HTML+text via Resend using `FROM_EMAIL`, `RESEND_API_KEY`, and optional `CC_EMAIL`.
- CORS allowed origins are set in `wrangler.toml` (`ALLOWED_ORIGINS`) as a comma-separated list.
- Messages include `reply_to` set to the submitter's email.
