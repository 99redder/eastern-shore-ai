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
