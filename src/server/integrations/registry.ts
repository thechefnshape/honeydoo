import type { Queryable } from '@/lib/db';
import { squareConfigured } from '@/lib/env';
import { demoProvider } from './demo';
import type { CommerceProvider } from './types';
import { squareProvider } from './square/provider';

/** Picks the provider that owns this merchant's catalog and payments. */
export async function providerForMerchant(q: Queryable, merchantId: string): Promise<{ provider: CommerceProvider; integrationId: string | null }> {
  const r = await q.query(
    `select id, provider, connection_status from merchant_integrations where merchant_id = $1 and provider <> 'demo'
      order by (connection_status = 'connected') desc, updated_at desc limit 1`, [merchantId]);
  const row = r.rows[0];
  if (row?.provider === 'square' && row.connection_status === 'connected' && squareConfigured()) return { provider: squareProvider, integrationId: row.id };
  return { provider: demoProvider, integrationId: null };
}
