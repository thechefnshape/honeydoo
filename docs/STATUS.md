# Status: what works today

Verified on 2026-10-14 with `npm test` (68 tests), `npm run typecheck`, a production build, `scripts/smoke.sh` (13 end-to-end checks) and browser runs of every main screen.

## Implemented and tested

**Phase 1: marketplace (complete)**
- Official logo as vectors, bee wing flutter while AI is thinking (respects reduced motion), favicon.
- Mobile-first home: hero, search with AI icon, category row, local shop cards, featured products, merchant call to action, mobile bottom navigation.
- Location: city picker, opt-in device location used only in the browser.
- Shops list, storefronts (cover, description, address, hours, pickup status, phone, in-store search and category filter), product pages with variations, modifiers and stock.
- Keyword search with category, price and pickup-today filters.
- Bag: per-shop groups, quantity changes, live prices and availability warnings, separate checkout per shop.
- Demo checkout: authoritative quote at the shop's prices plus tax (no customer fee), explicit authorization, idempotent order creation. Demo orders are recorded as "not charged" and are never marked paid.
- Orders list and order detail with status. Guest orders are private to the browser session; account orders follow the account.
- Customer accounts (optional): email and password sign-up and sign-in, scrypt password hashing, server-side sessions stored only as hashes, sign-in rate limits per address and per email, identical errors for unknown email and wrong password. Signing in moves this browser's guest orders and bag into the account (bags merge across devices). Profile with name and phone, checkout prefill, change password (signs out other devices), sign out (gives the browser a fresh guest session), account deletion (erases personal details, keeps shop transaction records unlinked). Password reset with single-use, 30-minute links is built and sends through Resend once `RESEND_API_KEY` is set.
- Seeded Lakewood demo marketplace: 9 fictional shops, 51 products, clearly labeled Demo everywhere.

**Search and link previews**
- Sitemap (live shops and products only), robots.txt, canonical URLs, page titles and descriptions.
- Branded link-preview images (Open Graph, 1200 x 630) for the home page, each shop and each product, with the photo when available.
- Structured data: shops as local businesses (type by category, address, map position, hours, pickup ordering), products with price and stock, breadcrumbs, organization.
- Indexing is off everywhere until `SITE_INDEXING=true`. Demo shops are never indexed or described as real businesses. Personal and staff pages send noindex headers.

**Phase 2 and 3: Square (code complete, tested against a fake Square API)**
- OAuth with single-use, session-bound state; least-privilege scopes; encrypted token storage; refresh and revocation handling.
- Location import (inactive until the merchant turns them on), full catalog import with pagination, variations, modifiers, taxes, images, per-location presence, inventory counts, deletions, archives, price changes, restricted-category exclusion, idempotent re-sync, retry queue with backoff, manual sync.
- Quotes via Square CalculateOrder with price cross-check; payment links with catalog ids, pickup fulfillment and the $1 merchant-paid application fee (receivable when not permitted); total check before redirect.
- Webhooks: signature verification (matches Square's SDK), de-duplication, payment verification by reading back from Square, refunds, fulfillment status updates, inventory updates, catalog-change resync, revocation.
- Ledger separating merchant proceeds, Honeydoo revenue, processing costs, refunds and contribution margin. Reconciliation states for late, unmatched or mismatched payments.

**Phase 4: AI search (implemented, tested with a scripted model)**
- Claude tool calling behind a replaceable provider interface; invented or over-budget ids are dropped; prompt-injection wrapping; rate limits, daily budget, timeout and usage logging; deterministic fallback (what you see today, since no API key is configured).

**Phase 5 pieces**
- Merchant dashboard: overview tiles, go-live checklist, terms acceptance with recorded consent, activation gate, product visibility overrides (never written to Square), orders, settings (profile, locations, pickup, fee toggle, pause, disconnect), storefront link and QR code with referral attribution.
- Staff accounts for the admin dashboard: invite-only (first owner from the command line), password plus authenticator code on every sign-in, one-time codes cannot be reused, lockout after 5 failures, 12-hour sessions stored only as hashes, owner and analyst roles, remove access instantly, every sign-in and failure in the audit log. The dashboard is never open without sign-in, including in demo mode.
- Admin dashboard: merchant counts, GMV, paid and completed orders, repeat rate, completion rate, revenue and margin per order, refunds, onboarding time, reliability, AI usage, funnel and geography, with demo data excluded by default.
- First-party analytics for all 15 events in the brief.

## Not yet verified or not built

| Item | Status | What is needed |
| --- | --- | --- |
| Square Sandbox connection and payments | Owner reports successful Sandbox transactions (2026-10-15) | Confirm the $1 app fee appears in the developer account's Sandbox dashboard |
| Production deployment | Not deployed | Vercel project and a Supabase database |
| Real payments | Not active | Square production account (business entity and EIN decided first), production credentials, `DEMO_MODE=false` |
| AI model responses | Fallback only today | `ANTHROPIC_API_KEY` |
| Password reset email | Built, not sending | `RESEND_API_KEY` and a verified sending domain |
| Email verification on sign-up | Not built | Same email provider |
| Order confirmation emails | Not built (Square sends a receipt) | Email provider |
| Merchant sign-in other than Square OAuth | Not built | Email magic link for merchant staff |
| Error tracking service | Structured logs only | Sentry DSN |
| Merchant-chosen pickup hours in the UI | Database and API support it, UI uses Square hours plus prep time | Small UI addition |
| Image uploads to object storage | Not built; uses Square images or override URLs | Supabase Storage bucket |
| Shared rate limiting | In-memory per instance | Upstash Redis when scaling out |
| CAC, MAC, satisfaction metrics | Not tracked | Marketing spend inputs and a post-pickup survey |
| Logo master and Satoshi font | Traced from the 1536 px board; Figtree used as the typeface | Original vector file and Satoshi font files |
| Demo photos | Unsplash images chosen by description, not visually reviewed | A quick visual pass |
