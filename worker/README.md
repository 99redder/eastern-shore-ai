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

### Quotes Endpoints

- Admin quotes list: `GET https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes`
- Admin quotes list (filtered): `GET https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes?status=sent`
- Admin quote detail (with line items): `GET https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes/detail?id=123`
- Admin quote create: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes`
- Admin quote update: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes/update`
- Admin quote delete: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes/delete`
- Admin quote send email: `POST https://eastern-shore-ai-contact.99redder.workers.dev/api/accounts/quotes/send`
- Public quote accept: `GET https://eastern-shore-ai-contact.99redder.workers.dev/api/quote/accept?token=<accept_token>`
- Public quote deny: `GET https://eastern-shore-ai-contact.99redder.workers.dev/api/quote/deny?token=<deny_token>`

## Notes

- Invoice create payload expects `customerName`, `customerEmail`, `issueDate`, `dueDate`, `descriptionOfWork` (or `notes`), and `items[]` where each item has `description`, optional `quantity`, and `unitAmountCents` (or `unitAmount` in dollars).
- Invoice detail endpoint returns the invoice row plus `line_items[]` for modal prefill/editing.
- Invoice update payload expects `{ id, customerName, customerEmail, dueDate, descriptionOfWork|notes, items[] }` and replaces line items while recalculating subtotal/tax/total/balance using existing `amount_paid_cents`.
- Invoice send payload expects `{ "id": <invoiceId> }` and sends branded HTML+text via Resend using `FROM_EMAIL`, `RESEND_API_KEY`, and optional `CC_EMAIL`.
- CORS allowed origins are set in `wrangler.toml` (`ALLOWED_ORIGINS`) as a comma-separated list.
- Messages include `reply_to` set to the submitter's email.

### Quotes System

The quotes system allows creating, sending, and tracking customer quotes with Accept/Deny functionality.

**Quote Flow:**
1. Admin creates a quote with customer info, line items, and expiry date (defaults to 30 days)
2. Admin sends quote email to customer via "Send Quote Email" action
3. Customer receives branded email with Accept and Decline buttons
4. **On Accept:** Quote converts to a draft invoice (not auto-sent), Chris receives notification email
5. **On Deny:** Quote is hard-deleted from the database

**Quote Create Payload:**
```json
{
  "quoteNumber": "Q-1234567890",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "validUntil": "2026-03-29",
  "descriptionOfWork": "AI consulting services",
  "items": [
    { "description": "Setup consultation", "quantity": 1, "unitAmountCents": 10000 }
  ]
}
```

**Quote Update Payload:**
```json
{
  "id": 123,
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "validUntil": "2026-03-29",
  "descriptionOfWork": "Updated scope",
  "items": [...]
}
```

**Public Accept/Deny:**
- Accept endpoint validates token, checks not expired/handled, creates invoice, sends notification, returns success HTML page
- Deny endpoint validates token, checks not expired/handled, hard deletes quote, returns confirmation HTML page
- Both endpoints return user-friendly HTML pages (not JSON) with clear status messages
