# honeydoo

Anything local. Just ask.

honeydoo is a hyperlocal marketplace for independent businesses. Merchants connect the POS they already use (Square first), their catalog syncs automatically, customers order for pickup, and paid orders flow back into the merchant's own system. Customers pay the shop's regular prices. The shop pays honeydoo a flat $1 per completed order, deducted automatically through Square.

## Run it locally (no setup required)

```bash
npm install
npm run dev            # http://localhost:3000
```

With no `DATABASE_URL`, the app starts an embedded Postgres in `.data/`, applies the migrations and seeds the Lakewood demo marketplace on first request. To reset it: `npm run db:reset`.

Copy `.env.example` to `.env.local` to configure Square, AI search and secrets.

```bash
npm test               # 44 automated tests (embedded Postgres + fake Square)
npm run typecheck
bash scripts/smoke.sh  # end-to-end checks against a running server
```

## What is where

| Path | What it does |
| --- | --- |
| `db/migrations/` | Postgres schema (money in integer cents) |
| `db/supabase/rls.sql` | Row-level security for Supabase |
| `db/seed/` | Repeatable demo marketplace (9 fictional shops, 51 products) |
| `src/server/catalog.ts`, `search.ts` | Public catalog and deterministic search |
| `src/server/ai/` | AI shopping assistant, provider-agnostic, with guardrails and fallback |
| `src/server/cart.ts`, `pricing.ts`, `checkout.ts` | Bag, authoritative quotes, idempotent checkout |
| `src/server/payments.ts`, `orders.ts` | Verified payment handling, ledger, refunds, order state machine |
| `src/server/integrations/` | Provider adapter layer: `demo` and `square` |
| `src/server/integrations/square/` | OAuth, encrypted tokens, catalog/inventory sync, payment links, webhooks |
| `src/app/api/v1/` | Versioned API |
| `src/app/` | Marketplace, storefronts, checkout, orders, merchant dashboard, admin |
| `tests/` | Automated tests |

## Docs

- `docs/ARCHITECTURE.md`: system design, fee model, data flow
- `docs/SQUARE_SETUP.md`: Square developer account and Sandbox setup
- `docs/DEPLOYMENT.md`: Vercel + Supabase deployment
- `docs/BOLT.md`: moving the project to Bolt, building the Supabase database from `db/supabase/all.sql`
- `docs/PRODUCTION_CHECKLIST.md`: launch readiness
- `docs/STATUS.md`: what is implemented, tested, mocked or blocked
