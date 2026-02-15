# Contact Form Worker (Cloudflare + Resend)

This worker receives contact/domain-offer form submissions and emails them to `easternshoreai@outlook.com`.

## 1) Install and login

- `npm i -g wrangler`
- `wrangler login`

## 2) Configure sender domain in Resend

- Verify a sending domain in Resend (for `FROM_EMAIL` in `wrangler.toml`).

## 3) Set secret

- `wrangler secret put RESEND_API_KEY`

## 4) Deploy

- `cd worker`
- `wrangler deploy`

Default endpoint used by the site:

- `https://eastern-shore-ai-contact.99redder.workers.dev/api/contact`

## Notes

- CORS allowed origins are set in `wrangler.toml` (`ALLOWED_ORIGINS`) as a comma-separated list.
- Messages include `reply_to` set to the submitter's email.
