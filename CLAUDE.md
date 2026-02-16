# CLAUDE.md — Eastern Shore AI

## Project Overview

Marketing and booking website for Eastern Shore AI, a local AI consulting business selling OpenClaw setup services. Static frontend hosted on GitHub Pages, serverless API on Cloudflare Workers.

**Domain**: www.easternshore.ai

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no framework, no build step)
- **Backend**: Cloudflare Workers (`worker/src/index.js`)
- **Database**: Cloudflare D1 (SQLite)
- **Payments**: Stripe (checkout sessions + webhooks)
- **Email**: Resend API
- **Hosting**: GitHub Pages (frontend), Cloudflare Workers (API)

## Project Structure

```
├── index.html                 # Main homepage (self-contained HTML/CSS/JS)
├── openclaw-setup.html        # Setup booking page with Stripe checkout
├── favicon.svg
├── CNAME                      # GitHub Pages domain config
├── robots.txt / sitemap.xml   # SEO files
└── worker/
    ├── wrangler.toml          # Cloudflare Workers config
    ├── src/index.js           # All API routes (contact, checkout, webhook)
    └── migrations/            # D1 database schema
```

## Deployment

**Frontend**: Push to `main` branch — GitHub Pages auto-deploys. No build step.

**Worker**:
```bash
cd worker && wrangler deploy
```

Worker secrets (configured in Cloudflare dashboard): `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

## API Endpoints

All routes in `worker/src/index.js`:
- `POST /api/contact` — Form submissions (domain offers, questions)
- `POST /api/checkout-session` — Creates Stripe checkout with booking conflict check
- `POST /api/stripe-webhook` — Stripe payment confirmation, records bookings in D1

Response shape: `{ ok: boolean, error?: string }`

## Code Conventions

- **No frameworks or build tools** — pages are self-contained HTML with inline CSS/JS
- **CSS**: Custom properties for theming (`--bg`, `--cyan`, `--text`), dark theme, mobile-first responsive
- **JS**: Vanilla, async/await, camelCase functions and variables
- **HTML classes/IDs**: kebab-case (`.btn-primary`, `#setup-modal`)
- **Accessibility**: ARIA attributes (`aria-hidden`, `aria-labelledby`, `aria-modal`)
- **Security**: CORS origin validation, honeypot spam fields, Stripe HMAC-SHA256 signature verification
- **API status codes**: 200, 400, 403, 404, 409, 500, 502

## Key Patterns

- Modals use overlay click and Escape key to close
- Forms validate client-side before API calls, show inline status feedback
- Stripe checkout redirects back to the setup page with success/cancel query params
- Worker checks D1 for booking slot conflicts before creating checkout sessions

## Testing

No automated tests. Manual testing via browser and API tools (curl/Postman). Use Stripe test mode for payment flows.

---

## Stripe Setup Details (Current Production Design)

### Stripe product/pricing model

Current implementation creates checkout sessions dynamically in the worker using inline `price_data`:
- Product name: `OpenClaw Setup`
- Currency: `usd`
- Amount: `10000` cents ($100.00)
- Quantity: `1`

This means no pre-created Stripe Price ID is required today.

### Frontend payment flow (`openclaw-setup.html`)

1. User selects:
   - `setup-date` (date)
   - `setup-time` (2-hour block)
2. User clicks `Book + Pay Now`
3. Frontend calls:
   - `POST /api/checkout-session`
4. Worker responds with `checkoutUrl`
5. Browser redirects to Stripe Checkout
6. Stripe redirects back to:
   - Success: `/openclaw-setup.html?paid=1`
   - Cancel: `/openclaw-setup.html?canceled=1`
7. Success modal appears on return and displays saved date/time.

### Worker Stripe routes

#### `POST /api/checkout-session`

- Validates required fields (`setupDate`, `setupTime`)
- Composes `setup_at` as `${setupDate}T${setupTime}`
- Checks D1 for conflicts before creating session:
  - Existing `bookings` with status in `('paid','confirmed')`
  - Existing active rows in `blocked_slots`
- Creates Stripe Checkout Session via `https://api.stripe.com/v1/checkout/sessions`
- Stores a `pending` booking row in D1 keyed by `stripe_session_id`
- Returns:
  - `{ ok: true, checkoutUrl, id }`

#### `POST /api/stripe-webhook`

- Verifies Stripe signature using HMAC SHA-256 against `STRIPE_WEBHOOK_SECRET`
- Handles event type:
  - `checkout.session.completed`
- Upserts booking row in D1 and marks status `paid`
- Stores/updates:
  - `stripe_session_id`
  - `stripe_payment_intent_id`
  - `setup_date`, `setup_time`, `setup_at`
  - `customer_name`, `customer_email`
  - `amount_cents`
  - `paid_at`

### Stripe metadata strategy

Checkout session metadata includes:
- `setup_date`
- `setup_time`
- `setup_at`
- `customer_name`

These are mirrored onto `payment_intent_data.metadata` for downstream reconciliation.

### Required Stripe events

Minimum required webhook event:
- `checkout.session.completed`

Configured webhook endpoint:
- `https://eastern-shore-ai-contact.99redder.workers.dev/api/stripe-webhook`

### Worker secrets and config

Required secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Other related secrets:
- `ADMIN_API_KEY` (admin booking controls)
- `RESEND_API_KEY` (email)

Set via:
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

### D1 booking persistence

Database: `eastern-shore-ai-bookings`

Tables used by Stripe flow:
- `bookings`
  - stores pending and paid records
- `blocked_slots`
  - admin-blocked unavailable slots

Migrations:
- `0001_create_bookings.sql`
- `0002_create_blocked_slots.sql`

### Public/admin availability behavior

- Public endpoint: `GET /api/availability`
  - returns unavailable `setup_at` values from:
    - paid/confirmed bookings
    - active blocked slots
- Frontend disables unavailable time blocks in dropdown
- Checkout route re-validates conflicts server-side (authoritative)

### Admin operations affecting Stripe booking

Hidden admin mode on booking page:
- `openclaw-setup.html?admin=1`

Admin APIs:
- `GET /api/bookings?key=...`
- `POST /api/admin/block-slot?key=...`

Blocking a slot prevents new Stripe checkout sessions for that slot.

### Troubleshooting checklist

If Stripe payment succeeds but slot not marked paid:
1. Check Stripe webhook delivery logs (expect HTTP 200)
2. Confirm `STRIPE_WEBHOOK_SECRET` matches configured endpoint secret
3. Confirm event type `checkout.session.completed` is enabled
4. Confirm Worker deployment includes latest webhook code
5. Query `/api/bookings?key=...` to inspect status (`pending` vs `paid`)

If checkout creation fails:
1. Verify `STRIPE_SECRET_KEY` exists in worker secrets
2. Check worker logs for `Stripe session failed`
3. Confirm selected slot is not blocked/booked (`409` indicates conflict)

### Go-live notes

When moving from test to live:
- Rotate all test keys to live keys
- Recreate/verify webhook endpoint in live Stripe mode
- Set live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- Run one full end-to-end live verification payment
