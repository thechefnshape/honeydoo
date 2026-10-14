import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { safeEqual } from '@/lib/crypto';
import { processDueJobs, enqueueSync } from '@/server/integrations/square/sync';
import { processSquareEvent } from '@/server/integrations/square/webhooks';
import { refreshIntegration } from '@/server/integrations/square/credentials';
import { transition } from '@/server/orders';

/**
 * Background work, called by a scheduler (e.g. Vercel Cron) with CRON_SECRET:
 * due sync jobs, failed webhook retries, nightly reconciliation, token refresh, and checkout expiry.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new NextResponse('unauthorized', { status: 401 });
  const d = await db();
  const out: Record<string, unknown> = {};

  out.jobs = await processDueJobs(10);

  const failed = (await d.query(`select id, payload from webhook_events where status in ('failed','received') and attempts < 8 and received_at > now() - interval '3 days' order by received_at limit 25`)).rows;
  let retried = 0;
  for (const e of failed) { try { await processSquareEvent(e.id, typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload); retried++; } catch { /* stays failed */ } }
  out.webhooksRetried = retried;

  const stale = (await d.query(`select id from merchant_integrations where provider = 'square' and connection_status = 'connected' and (last_sync_at is null or last_sync_at < now() - interval '6 hours')`)).rows;
  for (const s of stale) await enqueueSync(s.id, 'reconcile');
  out.reconcileQueued = stale.length;

  const expiring = (await d.query(`select id from merchant_integrations where provider = 'square' and connection_status = 'connected' and token_expires_at < now() + interval '7 days'`)).rows;
  for (const i of expiring) { try { await refreshIntegration(i.id, d); } catch { /* flagged needs_reauth */ } }
  out.tokensRefreshed = expiring.length;

  const expired = (await d.query(`select o.id from orders o join payments p on p.order_id = o.id where o.status = 'awaiting_payment' and p.expires_at < now()`)).rows;
  for (const o of expired) await d.tx((q) => transition(q, o.id, 'expired', 'system', 'checkout link expired'));
  out.checkoutsExpired = expired.length;

  return NextResponse.json(out);
}

// Vercel Cron issues GET requests with `Authorization: Bearer $CRON_SECRET`.
export const GET = POST;
