# Production readiness checklist

## Business and legal
- [ ] Counsel reviews `/terms`, `/privacy` and the merchant terms (version `2026-10-v1`, which now states the merchant pays the $1 fee); bump `MERCHANT_TERMS_VERSION` if text changes.
- [ ] Accountant confirms how the $1 merchant fee (application fee) is booked, and the invoicing process for any `fee_receivable`.
- [ ] Square production app approved for OAuth and application fees.
- [ ] Signed merchant agreement process for the first 10 merchants (consents are recorded in `merchant_consents`).

## Brand
- [ ] Replace traced logo paths with the original vector master (`src/components/bee-paths.json`, `letters-path.json`).
- [ ] License Satoshi and add the font files (the app currently falls back to Figtree).
- [ ] Replace demo stock photos; real merchants use their own Square images.

## Configuration
- [ ] `DEMO_MODE=false`, demo data not seeded in production.
- [ ] All secrets set and unique per environment; `TOKEN_ENCRYPTION_KEY` backed up in a secrets manager (losing it means every merchant must reconnect).
- [ ] Production Square credentials, redirect URL and webhook URL; `SQUARE_ENVIRONMENT=production`.
- [ ] Supabase RLS applied (`db:migrate -- --supabase`), automated backups and point-in-time recovery enabled.

## Reliability and monitoring
- [ ] Error tracking (Sentry or similar) wired into `src/lib/http.ts` `log()` and route errors.
- [ ] Alert on: failed webhooks, `needs_reconciliation` orders, unmatched payments, sync job failures (all visible on `/admin`).
- [ ] Shared rate-limit store (Upstash Redis) instead of in-memory limits when running more than one instance.
- [ ] Transactional email provider for order confirmations and merchant alerts (Square sends the payment receipt today).

## Verification
- [ ] Sandbox acceptance tests in `docs/SQUARE_SETUP.md` sections 5 and 6 pass on the deployed preview.
- [ ] `npm test` and `scripts/smoke.sh` green.
- [ ] One live, low-value transaction with a consenting merchant, then a full refund, reconciled in `/admin`.

## Search and link previews
- [ ] Set `SITE_INDEXING=true` on the production domain only (never on staging or previews).
- [ ] Confirm `APP_URL` is the final https domain; canonical links, sitemap and preview images use it.
- [ ] Submit `https://YOUR-DOMAIN/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- [ ] Check a live shop and product page in Google's Rich Results Test.
- [ ] Paste a shop link into iMessage or Slack to confirm the preview card.
- [ ] Remove demo shops before launch; they are excluded from search, but should not be live.
