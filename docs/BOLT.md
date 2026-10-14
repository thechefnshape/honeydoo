# Moving honeydoo to Bolt

This project is a complete Next.js app with its own server code, database layer and tests. Bolt can host and edit it, but a few things about how Bolt runs code matter. Read this before the first prompt in Bolt.

## 1. Bring the code in through GitHub

Bolt imports existing projects from GitHub: on the Bolt homepage, connect GitHub, then choose the repository (or paste its URL under "Import from URL"). Bolt opens the `main` branch.

1. Create an empty private repository, for example `honeydoo`.
2. From this folder: `git init && git add . && git commit -m "honeydoo v1" && git branch -M main && git remote add origin <repo url> && git push -u origin main`
3. `.gitignore` already excludes `.env.local`, `.data` (the local database) and `node_modules`. Never commit `.env.local`.

## 2. Database: use Supabase, not Bolt Database

honeydoo's schema is plain Postgres (35 tables, row-level security on all of them) and the server talks to it with SQL. Bolt can connect a project to an existing Supabase project (Database > Advanced > Connect, Pro or Teams plan). Create the Supabase project first, then connect it, so Bolt does not create a separate Bolt Database.

To build the database:
1. Create a Supabase project (US East is closest to Ohio).
2. Open SQL Editor, paste all of `db/supabase/all.sql` and run it once. It creates every table, the security policies and the migration record. Regenerate it after schema changes with `npm run db:bundle`.
3. Optional demo shops: from your computer, set `DATABASE_URL` to the Supabase connection string and run `npm run db:seed`. Do not seed the production project you launch with.
4. Create the first admin owner: `npm run admin:invite -- --email you@example.com --name "Your Name" --role owner` with `DATABASE_URL` and `APP_URL` set to the live values.

## 3. How the database connects inside Bolt

The server uses the `pg` driver (`src/lib/db.ts`), which needs a direct network (TCP) connection.

- **Bolt's in-browser preview cannot open TCP connections**, so `pg` cannot reach Supabase there. With no `DATABASE_URL` set, honeydoo automatically falls back to an embedded database (PGlite) with the demo shops, so the preview still runs. Leave `DATABASE_URL` unset for preview.
- **Published sites run on a real Node.js server**, where `pg` connects normally. Set `DATABASE_URL` to the Supabase pooler connection string (Transaction mode, port 6543) in the published environment.
- Do not let Bolt rewrite `src/lib/db.ts` to use `@supabase/supabase-js`. Every query, transaction, lock and idempotency guarantee in checkout and payments depends on real SQL transactions, which supabase-js does not provide.

Not yet verified: whether Next.js 16 and PGlite both run inside Bolt's preview. If the preview fails to start, the fallback is to edit in Bolt and check changes on the published site or a Vercel preview.

## 4. Environment variables for the published site

| Name | Value |
| --- | --- |
| `APP_URL` | The published https address |
| `DATABASE_URL` | Supabase pooler connection string |
| `DEMO_MODE` | `true` until real launch, then `false` |
| `SITE_INDEXING` | `false` until launch, then `true` on the production domain only |
| `SESSION_SECRET` | 32+ random characters (`openssl rand -base64 48`) |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`) |
| `CRON_SECRET` | 32+ random characters |
| `SQUARE_*` | From the Square developer app (see `SQUARE_SETUP.md`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | For password reset email |
| `ANTHROPIC_API_KEY` | For AI search |

Never put any of these in a file that is committed, and never in code that runs in the browser.

## 5. Instructions to give Bolt

Paste this into Bolt's project instructions (or at the start of the first chat) so its edits respect the architecture:

```
This is an existing, tested Next.js 16 App Router app (TypeScript, Tailwind, Zod, Vitest).
- Keep the database layer in src/lib/db.ts (pg with PGlite fallback). Do not switch to supabase-js or Bolt Database.
- Schema changes go in a new numbered file in db/migrations, never by editing old migrations. Then run npm run db:bundle.
- Money is integer cents. Totals are always computed on the server (src/server/pricing.ts).
- Customers never pay a honeydoo fee. The shop pays $1 per completed order through Square's app fee.
- Never mark an order paid from the browser; only verified Square webhooks or a server read-back can.
- Secrets live only in environment variables and server code.
- Writing style: no em dashes, no emojis anywhere in UI, content or code. Minimal, Silicon Valley aesthetic.
- Run npm run typecheck and npm test after changes.
```

## 6. Scheduled jobs

`vercel.json` runs `/api/v1/internal/jobs` every 10 minutes (sync retries, token refresh, stale-checkout expiry). Bolt hosting does not read `vercel.json`. On another host, call `GET /api/v1/internal/jobs` with header `Authorization: Bearer <CRON_SECRET>` every 10 minutes from a scheduler (for example Supabase cron with `pg_net`, or any uptime/cron service).
