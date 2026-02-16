# CLAUDE.md — Eastern Shore AI

## Project Overview

Marketing and booking website for Eastern Shore AI, a local AI consulting business selling OpenClaw setup services. Static frontend hosted on GitHub Pages, serverless API on Cloudflare Workers.

**Domain**: www.easternshore.ai

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no framework, no build step)
- **Fonts**: Google Fonts — Hanken Grotesk (headings, nav, buttons), Titillium Web (body text), Orbitron (header logo), Rajdhani (brand tagline only)
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

Worker secrets (configured in Cloudflare dashboard): `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_PASSWORD`

## API Endpoints

All routes in `worker/src/index.js`:
- `POST /api/contact` — Form submissions (domain offers, questions)
- `POST /api/checkout-session` — Creates Stripe checkout with booking conflict + past-time checks
- `POST /api/stripe-webhook` — Stripe payment confirmation, records bookings in D1, auto-inserts tax income row
- `GET /api/availability` — Public unavailable slots + blocked dates
- `GET /api/bookings` — Admin read: bookings + blocked slots + blocked days
- `POST /api/admin/block-slot` — Admin block/unblock a specific 2-hour slot
- `POST /api/admin/block-day` — Admin block/unblock an entire day
- `GET /api/tax/transactions` — Admin tax transactions by year/type
- `POST /api/tax/expense` — Admin add expense entry
- `POST /api/tax/income` — Admin add income entry
- `GET /api/tax/export.csv` — Admin CSV export for selected year/type

Response shape: `{ ok: boolean, error?: string }`

## Code Conventions

- **No frameworks or build tools** — pages are self-contained HTML with inline CSS/JS
- **CSS**: Custom properties for theming (`--bg`, `--cyan`, `--violet`, `--text`), cyberpunk scheme with cyan (`#00e5ff`) + purple (`#c850ff`) neon accents on dark blue-tinted backgrounds (`#0a0b10`); light theme uses neutral grays with `--cyan: #0099bb` and `--violet: #8a2ec0`. Battle-damaged hull edges via `clip-path: polygon()` on cards and buttons. Mobile-responsive with breakpoints at 820px, 760px, and 480px
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

## Responsive / Mobile Design

Both pages use inline `<style>` media queries for mobile optimization. The booking flow on `openclaw-setup.html` is prioritized for mobile usability.

### Breakpoints

| Breakpoint | Scope | Purpose |
|---|---|---|
| `820px` | `index.html` | Stacks offer grid, modal content, form grids; centers topbar/nav; full-width Book Now button; repositions hero lobster emoji |
| `760px` | `openclaw-setup.html` | Stacks booking/admin/form grids; converts top-right "Book + Pay Now" button into a full-width fixed bottom CTA bar (above footer); increases body bottom padding for sticky CTA + footer |
| `480px` | Both pages | Further reduces font sizes, card/container padding for small phones (iPhone SE) |

### Key mobile patterns

- **Sticky bottom CTA** (`openclaw-setup.html`): On mobile, `.top-book-btn` becomes `position:fixed; bottom:calc(52px + env(safe-area-inset-bottom))` — a full-width bar above the footer, always visible for booking
- **iOS zoom prevention**: All `input`, `textarea`, `select` elements set to `font-size:16px` at mobile breakpoints to prevent Safari auto-zoom on focus
- **Safe area insets**: Footer uses `env(safe-area-inset-bottom)` for notched devices; sticky CTA is offset accordingly
- **Single-column forms**: `.form-grid` switches from 2-column to 1-column at mobile breakpoints for touch-friendly input sizing

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
- `ADMIN_PASSWORD` (shared admin password for dashboard APIs)
- `RESEND_API_KEY`

Set via:
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put ADMIN_PASSWORD
wrangler secret put RESEND_API_KEY
```

### D1 persistence (booking + admin + tax)

Database: `eastern-shore-ai-bookings`

Tables:
- `bookings` — pending/paid setup bookings
- `blocked_slots` — blocked 2-hour setup blocks
- `blocked_days` — full-day blocks
- `tax_expenses` — manual expense entries (USD)
- `tax_income` — manual + Stripe-imported income entries (USD)

Migrations:
- `0001_create_bookings.sql`
- `0002_create_blocked_slots.sql`
- `0003_create_blocked_days.sql`
- `0004_create_tax_tables.sql`
- `0005_tax_income_unique_stripe_session.sql`

### Public/admin availability behavior

- Public endpoint: `GET /api/availability`
  - returns unavailable `setup_at` values from:
    - paid/confirmed bookings
    - active blocked slots
  - returns `blockedDates` from active `blocked_days`
- Frontend disables unavailable blocks and blocked days in dropdown
- Checkout route re-validates conflicts server-side (authoritative)
- Checkout also rejects past date/time blocks using `America/New_York`

### Admin operations (booking + tax)

Hidden admin mode on booking page:
- `openclaw-setup.html?admin=1`

Auth:
- Admin requests use `X-Admin-Password` header (value must match Worker secret `ADMIN_PASSWORD`)

Admin APIs:
- `GET /api/bookings`
- `POST /api/admin/block-slot`
- `POST /api/admin/block-day`
- `GET /api/tax/transactions`
- `POST /api/tax/expense`
- `POST /api/tax/income`
- `GET /api/tax/export.csv`

Blocking a slot/day prevents new Stripe checkout sessions for those times.

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
- Set/rotate `ADMIN_PASSWORD`
- Run one full end-to-end live verification payment

## Admin Dashboard (openclaw-setup.html) — Current UX

- Admin mode hides public booking marketing sections; shows admin controls only.
- Booking admin includes:
  - block/unblock individual 2-hour slots
  - block/unblock entire day
  - availability calendar with day markers (booked vs blocked)
- Tax Ledger is a separate admin section/card with:
  - year selector (defaults to current year)
  - type filter (`all`, `income`, `expense`)
  - side-by-side yearly totals snapshot (income vs expenses, bold totals)
  - category totals
  - manual Add Expense / Add Income forms (USD)
  - CSV download export for selected year/type

## Stripe → Tax Auto-Import

On `checkout.session.completed`, webhook now:
1. Upserts booking to `bookings` as `paid` (existing behavior)
2. Inserts tax income row in `tax_income` with:
   - source: `Stripe`
   - category: `OpenClaw Setup`
   - amount from Stripe `amount_total`
   - `stripe_session_id` for dedupe

Deduplication is enforced by unique index:
- `ux_tax_income_stripe_session_id` on `tax_income(stripe_session_id)` where non-null.
