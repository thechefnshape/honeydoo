import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/http';
import { maybeSessionId } from '@/lib/session';
import { audit, track } from '@/lib/analytics';
import { consumeOAuthState, exchangeCode } from '@/server/integrations/square/oauth';
import { REQUIRED_SCOPES } from '@/server/integrations/square/config';
import { squareRequest } from '@/server/integrations/square/client';
import { sealTokens } from '@/server/integrations/square/credentials';
import { enqueueSync, importLocations, runSyncJob } from '@/server/integrations/square/sync';
import { setMerchantSession } from '@/server/merchant-auth';

const back = (q: string) => NextResponse.redirect(`${env().APP_URL}/merchant/connect?${q}`, 302);

function slugify(s: string) { return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'shop'; }

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sid = await maybeSessionId();
  try {
    if (!sid) return back('error=session');
    const state = await consumeOAuthState(u.searchParams.get('state'), sid);
    if (u.searchParams.get('error')) return back(`error=${encodeURIComponent(u.searchParams.get('error')!)}`);
    const code = u.searchParams.get('code');
    if (!code) return back('error=missing_code');

    const tokens = await exchangeCode(code);
    const missing = REQUIRED_SCOPES.filter((s) => !tokens.scopes.includes(s));
    if (missing.length) return back(`error=scopes&missing=${missing.join(',')}`);
    const { merchant: sq } = await squareRequest('/v2/merchants/me', { token: tokens.accessToken });

    const d = await db();
    const { merchantId, integrationId } = await d.tx(async (q) => {
      const existing = (await q.query(`select id, merchant_id from merchant_integrations where provider = 'square' and environment = $1 and provider_merchant_id = $2`,
        [env().SQUARE_ENVIRONMENT, tokens.merchantId])).rows[0];
      let mid = existing?.merchant_id ?? state.merchant_id;
      if (!mid) {
        const base = slugify(sq.business_name ?? 'shop');
        const taken = (await q.query(`select count(*)::int as n from merchants where slug like $1`, [`${base}%`])).rows[0].n;
        const market = (await q.query(`select id from markets where slug = 'lakewood-oh'`)).rows[0];
        mid = (await q.query<{ id: string }>(
          `insert into merchants(market_id, legal_name, display_name, slug, category, status, is_demo, referral_code) values ($1,$2,$3,$4,'gifts','onboarding',false,$5) returning id`,
          [market?.id ?? null, sq.business_name ?? 'Square merchant', sq.business_name ?? 'New shop', taken ? `${base}-${taken + 1}` : base, `${base}-${Date.now().toString(36)}`])).rows[0].id;
      }
      const sealed = sealTokens(tokens);
      const iid = existing
        ? (await q.query<{ id: string }>(`update merchant_integrations set encrypted_credentials_reference = $2, granted_scopes = $3, token_expires_at = $4, authorized_at = now(),
              connection_status = 'connected', last_error = null, updated_at = now() where id = $1 returning id`, [existing.id, sealed, tokens.scopes, tokens.expiresAt])).rows[0].id
        : (await q.query<{ id: string }>(`insert into merchant_integrations(merchant_id, provider, environment, provider_merchant_id, encrypted_credentials_reference, granted_scopes, token_expires_at, authorized_at)
              values ($1,'square',$2,$3,$4,$5,$6,now()) returning id`, [mid, env().SQUARE_ENVIRONMENT, tokens.merchantId, sealed, tokens.scopes, tokens.expiresAt])).rows[0].id;
      await q.query(`insert into merchant_members(merchant_id, user_ref, role) values ($1,$2,'owner') on conflict do nothing`, [mid, `square:${tokens.merchantId}`]);
      return { merchantId: mid as string, integrationId: iid };
    });

    await audit(`square:${tokens.merchantId}`, 'square_connected', 'merchant', merchantId, { scopes: tokens.scopes, environment: env().SQUARE_ENVIRONMENT });
    await track('merchant_connected', { merchantId, sessionId: sid });
    await setMerchantSession(merchantId, `square:${tokens.merchantId}`);

    // Initial import. If it fails the job stays queued for retry and the dashboard shows the error.
    try { await importLocations(integrationId); const job = await enqueueSync(integrationId, 'full_import'); await runSyncJob(job); }
    catch (e) { log('warn', 'initial_import_failed', { merchantId, error: e instanceof Error ? e.message : String(e) }); }

    return NextResponse.redirect(`${env().APP_URL}${state.redirect_after ?? '/merchant'}?connected=1`, 302);
  } catch (e) {
    log('warn', 'square_callback_failed', { error: e instanceof Error ? e.message : String(e) });
    return back('error=connect_failed');
  }
}
