import { handler, HttpError, ok } from '@/lib/http';
import { db } from '@/lib/db';
import { requireMerchant } from '@/server/merchant-auth';
import { enqueueSync, runSyncJob } from '@/server/integrations/square/sync';

/** Manual resync. Runs immediately and also leaves a retryable job if it fails. */
export const POST = handler(async () => {
  const s = await requireMerchant();
  const d = await db();
  const integ = (await d.query(`select id, provider from merchant_integrations where merchant_id = $1 and provider = 'square' and connection_status = 'connected' limit 1`, [s.merchantId])).rows[0];
  if (!integ) throw new HttpError(409, 'not_connected', s.isDemo ? 'Demo shops have a fixed sample catalog. Connect Square to sync a real one.' : 'Connect Square before syncing.');
  const jobId = await enqueueSync(integ.id, 'manual_resync');
  const stats = await runSyncJob(jobId);
  return ok({ data: { jobId, stats, status: stats ? 'succeeded' : 'queued_for_retry' } });
});
