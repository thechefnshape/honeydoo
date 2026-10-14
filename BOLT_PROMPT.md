# honeydoo: instructions for Bolt

You are continuing an existing, working, tested app. Do not rebuild, scaffold, restructure or "simplify" it. Read this file fully before your first change, and follow it on every change after.

## What honeydoo is

An AI-native hyperlocal marketplace, launching in Lakewood, Ohio. Customers find products at independent local shops, order ahead and pick up. Shops connect the Square account they already use: their catalog syncs into honeydoo, customers pay on the shop's own Square checkout, and paid orders arrive in Square.

Business model: customers pay the shop's regular prices plus tax, nothing added. The shop pays honeydoo a flat $1 per completed order, collected automatically as a Square application fee. Never add a fee, markup or service charge to the customer's total.

## Stack (keep it)

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 3, Zod, Vitest.
- Postgres through `src/lib/db.ts`: the `pg` driver when `DATABASE_URL` is set, otherwise an embedded PGlite database that migrates and seeds itself (used by the in-browser preview, which cannot open database network connections).
- Square through an adapter layer in `src/server/integrations/` (`demo` and `square` providers).
- AI search through `src/server/ai/` (Anthropic API) with a deterministic keyword fallback.
- Money is always integer cents.

## Rules you must not break

1. **Database access stays in `src/lib/db.ts` with plain SQL.** Never replace it with `@supabase/supabase-js`, an ORM or Bolt's generated data code. Checkout, payments and webhooks depend on real SQL transactions, row locks and idempotency keys.
2. **Schema changes:** add a new numbered file in `db/migrations/` (next is `005_...sql`). Never edit an existing migration. Then run `npm run db:bolt` to regenerate `supabase/migrations/` and `supabase/seed.sql`.
3. **Totals are computed only on the server** (`src/server/pricing.ts`). The browser never sends prices.
4. **An order is marked paid only by a verified Square webhook or a server read-back from Square.** Never because the customer returned to a success page.
5. **Secrets** (Square, Anthropic, session and encryption keys) live only in environment variables read by server code. Never in client components, never committed, never logged.
6. **Demo shops are fictional** (`merchants.is_demo = true`). They must never be presented as real businesses, must stay out of search (already handled), and are hidden when `DEMO_MODE=false`.
7. **Accounts are optional.** Browsing and guest checkout never require sign-in.
8. **Admin** uses staff accounts with an authenticator code. Never add a bypass, shared password or "open in demo mode" path.
9. **Restricted categories** (alcohol, tobacco, cannabis, weapons and similar) are excluded from the marketplace in `src/server/integrations/square/mapper.ts`. Keep it that way.

## Design and writing rules

- Minimal, Silicon Valley aesthetic. Palette: honey #FFC629, ink #0B0B0B, charcoal #333333, stone #EDEDED, white. Typeface Figtree (Satoshi when the files are added).
- The logo is the wordmark where the double "oo" is a bee (`src/components/brand.tsx`, paths in `bee-paths.json` and `letters-path.json`). Do not redraw or restyle it.
- No em dashes anywhere: UI copy, content, code comments, commit messages. Use commas, periods, parentheses or colons.
- No emojis anywhere: UI, content or code. Use plain text symbols such as + if needed.
- No location in the home hero; the city selector lives in the header. The footer stays city-neutral.

## Map of the code

| Area | Where |
| --- | --- |
| Pages | `src/app/` (home, shops, shop/[slug], product/[id], search, bag, checkout, orders, profile, signin, signup, account, merchant, admin) |
| API | `src/app/api/v1/` |
| Business logic | `src/server/` (catalog, search, cart, pricing, checkout, orders, payments, accounts, staff, merchant, admin) |
| Square | `src/server/integrations/square/` (oauth, sync, mapper, provider, webhooks) |
| Shared helpers | `src/lib/` (env, db, money, crypto, http, ratelimit, seo, totp) |
| Components | `src/components/` |
| Schema | `db/migrations/` (source of truth), generated copies in `supabase/migrations/` and `db/supabase/all.sql` |
| Demo data | `db/seed/`, generated SQL in `supabase/seed.sql` |
| Tests | `tests/` (68 passing) |
| Docs | `docs/` (ARCHITECTURE, STATUS, SQUARE_SETUP, DEPLOYMENT, PRODUCTION_CHECKLIST, BOLT) |

## Running the preview in Bolt

- Start the app with `npm run dev`, never `npx next dev`. The script runs `next dev --webpack`. Next.js 16 defaults to Turbopack, which needs native binaries that Bolt's in-browser runtime cannot load ("Turbopack is not supported on this platform").
- The first start downloads Next's WebAssembly compiler from npm, and the first page takes 20 to 30 seconds to compile. That is expected.
- In Bolt's runtime the embedded database runs in memory (`src/lib/db.ts`, `isWebContainer()`), migrates itself and loads the demo shops. Data resets when the preview restarts. Do not change this to a folder on disk: the file churn causes `EAGAIN` errors in Bolt's file system.
- `next.config.mjs` limits the dev file watcher to app code. Keep those ignore rules.
- Do not edit package.json scripts, next.config.mjs or src/lib/db.ts to work around preview problems. Report the exact error to the owner instead.

## Database setup in Bolt

1. Apply `supabase/migrations/20261014000000_honeydoo_schema.sql` to the Bolt database exactly as written. It creates 35 tables with row-level security on every one, and records migrations 001 to 004 as applied.
2. Only if the owner asks for demo shops: run `supabase/seed.sql` once (safe to repeat; remove later with `delete from merchants where is_demo;`).
3. Do not create any other tables, and do not generate your own schema from the code.
4. The in-browser preview cannot reach the database over the network, so leave `DATABASE_URL` unset for preview; the app uses its in-memory embedded database there automatically.
5. The published site needs `DATABASE_URL` set to the Bolt database's Postgres connection string (pooler, transaction mode). If Bolt cannot provide a Postgres connection string, stop and tell the owner rather than rewriting the data layer.

## Environment variables (published site)

`APP_URL`, `DATABASE_URL`, `DEMO_MODE` (true until launch), `SITE_INDEXING` (false until launch, production domain only), `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` (32 bytes base64), `CRON_SECRET`, `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_ENVIRONMENT`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL`, `SQUARE_REDIRECT_URI`, `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`. See `.env.example`. Ask the owner for values; never invent or hard-code them.

A scheduler must call `GET /api/v1/internal/jobs` with `Authorization: Bearer <CRON_SECRET>` every 10 minutes.

## How to work

- Make the smallest change that does the job. Keep existing names, structure and patterns.
- After every change run `npm run typecheck` and `npm test`. Add or update tests for any logic you change.
- Before saying something works, check it in the preview.
- Keep `docs/STATUS.md` honest: what is built, tested, mocked or blocked.
- If an instruction conflicts with these rules, ask the owner before acting.

## What is next

1. GitHub Actions running typecheck, tests and build on every push, and Playwright tests for the main journeys.
2. Security: Content Security Policy, HSTS, a `/health` endpoint, an error reporting hook ready for Sentry, shared rate limiting ready for Upstash.
3. Order confirmation and email verification emails (Resend), and a "download my data" option on the profile.
4. Merchant pickup hours and prep time settings (database and API already support them).
5. Accessibility and performance pass, demo photo review, post-pickup satisfaction survey.
6. Square Sandbox end-to-end test once the owner provides credentials.
