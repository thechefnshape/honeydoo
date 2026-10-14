import { handler, ok } from '@/lib/http';
import { db } from '@/lib/db';
import { log } from '@/lib/http';
import { audit } from '@/lib/analytics';
import { requireMerchant } from '@/server/merchant-auth';
import { revokeAccess } from '@/server/integrations/square/oauth';

export const POST = handler(async () => {
  const s = await requireMerchant();
  const d = await db();
  const integ = (await d.query(`select id, provider_merchant_id from merchant_integrations where merchant_id = $1 and provider = 'square' and connection_status <> 'disconnected'`, [s.merchantId])).rows[0];
  if (integ) {
    try { await revokeAccess(integ.provider_merchant_id); } catch (e) { log('warn', 'square_revoke_failed', { error: e instanceof Error ? e.message : String(e) }); }
    await d.query(`update merchant_integrations set connection_status = 'disconnected', encrypted_credentials_reference = null, updated_at = now() where id = $1`, [integ.id]);
  }
  await d.query(`update merchants set status = 'disconnected', updated_at = now() where id = $1`, [s.merchantId]);
  await audit(s.sub, 'square_disconnected', 'merchant', s.merchantId);
  return ok({ data: { disconnected: true } });
});
