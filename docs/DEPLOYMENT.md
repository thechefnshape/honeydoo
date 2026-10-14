# Deployment (Vercel + Supabase)

The embedded database is for local development only. Production needs managed Postgres.

## Database (Supabase)

1. Create a Supabase project in a US East region (close to Ohio and to Vercel's iad1).
2. Project Settings → Database → Connection string → **Transaction pooler** URI. Use it as `DATABASE_URL`.
3. Apply the schema from your machine:
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate -- --supabase
   ```
   `--supabase` also applies the row-level security policies.
4. Optional, for a staging environment only: `DATABASE_URL=... npm run db:seed` adds the demo marketplace. Do not seed demo data in production.

## App (Vercel)

1. Import the repository into Vercel (framework preset: Next.js).
2. Add every variable from `.env.example` for Production and Preview, with real values:
   - `APP_URL` = your domain, `DEMO_MODE=false` in production, strong `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`.
   - Square values from `docs/SQUARE_SETUP.md` (separate Sandbox values for Preview).
   - `ANTHROPIC_API_KEY` for AI search (optional; without it search uses the keyword fallback).
3. Deploy. `vercel.json` schedules `/api/v1/internal/jobs` every 10 minutes (sync jobs, webhook retries, token refresh, checkout expiry). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
4. Update the Square OAuth redirect URL and webhook URL to the deployed domain.
5. Admin access: run `npm run admin:invite -- --email you@example.com --name "Your Name" --role owner` with `DATABASE_URL` and `APP_URL` pointing at production, open the printed link, scan the QR code with an authenticator app and choose a password. Invite everyone else from Admin > Staff.

## After each deploy

```bash
bash scripts/smoke.sh https://YOUR-DOMAIN   # against staging with demo data
```
