# Moving honeydoo to Bolt

This project is a complete Next.js app with its own server code, database layer and tests. Bolt can host and edit it, but a few things about how Bolt runs code matter. Read this before the first prompt in Bolt.

## 1. Bring the code in through GitHub

The code is at `github.com/thechefnshape/honeydoo` (private, `main` branch). On the Bolt homepage, connect GitHub and choose that repository, or paste its URL under "Import from URL".

Bolt reads `.bolt/prompt` (short project rules). The full instructions are in `BOLT_PROMPT.md` at the repository root.

## 2. Database

Two options, both use the same files:

- **Bolt Database (starting point).** Ask Bolt to apply `supabase/migrations/20261014000000_honeydoo_schema.sql`, and `supabase/seed.sql` if you want the demo shops. Bolt Databases can later be claimed into your Supabase organization (Database > Advanced > Claim) without rebuilding.
- **Your own Supabase project.** Run `db/supabase/all.sql` in the SQL Editor (same schema), and `supabase/seed.sql` for demo shops.

Both are generated from `db/migrations/` with `npm run db:bolt`. Never edit the generated files by hand.

After the database exists, create the first admin owner with `npm run admin:invite -- --email you@example.com --name "Your Name" --role owner`, run with `DATABASE_URL` and `APP_URL` set to the live values.

## 3. How the database connects inside Bolt

The server uses the `pg` driver (`src/lib/db.ts`), which needs a direct network (TCP) connection.

- **Bolt's in-browser preview cannot open TCP connections**, so `pg` cannot reach Supabase there. With no `DATABASE_URL` set, honeydoo automatically falls back to an embedded database (PGlite) with the demo shops, so the preview still runs. Leave `DATABASE_URL` unset for preview.
- **Published sites run on a real Node.js server**, where `pg` connects normally. Set `DATABASE_URL` to the database's Postgres pooler connection string (transaction mode, port 6543). If the Bolt Database does not show one, claim it into Supabase, which does.
- Do not let Bolt rewrite `src/lib/db.ts` to use `@supabase/supabase-js`. Every query, transaction, lock and idempotency guarantee in checkout and payments depends on real SQL transactions, which supabase-js does not provide.

Not yet verified: whether Next.js 16 and PGlite both run inside Bolt's preview. If the preview fails to start, the fallback is to edit in Bolt and check changes on the published site or a Vercel preview.

## 4. Environment variables for the published site

| Name | Value |
| --- | --- |
| `APP_URL` | The published https address |
| `DATABASE_URL` | Postgres pooler connection string (Bolt Database or Supabase) |
| `DEMO_MODE` | `true` until real launch, then `false` |
| `SITE_INDEXING` | `false` until launch, then `true` on the production domain only |
| `SESSION_SECRET` | 32+ random characters (`openssl rand -base64 48`) |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`) |
| `CRON_SECRET` | 32+ random characters |
| `SQUARE_*` | From the Square developer app (see `SQUARE_SETUP.md`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | For password reset email |
| `ANTHROPIC_API_KEY` | For AI search |

Never put any of these in a file that is committed, and never in code that runs in the browser.

## 5. Instructions for Bolt

`.bolt/prompt` and `BOLT_PROMPT.md` in the repository. Keep them current when the architecture or rules change.

## 6. Scheduled jobs

`vercel.json` runs `/api/v1/internal/jobs` every 10 minutes (sync retries, token refresh, stale-checkout expiry). Bolt hosting does not read `vercel.json`. On another host, call `GET /api/v1/internal/jobs` with header `Authorization: Bearer <CRON_SECRET>` every 10 minutes from a scheduler (for example Supabase cron with `pg_net`, or any uptime/cron service).
