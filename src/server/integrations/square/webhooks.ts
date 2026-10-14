import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { hmac, safeEqual } from '@/lib/crypto';
import { log } from '@/lib/http';
import { track } from '@/lib/analytics';
import { applyRefund, applyVerifiedPayment } from '../../payments';
import { transition, type OrderStatus } from '../../orders';
import { amountOf, squareRequest } from './client';
import { accessTokenFor } from './credentials';
import { applyInventoryCounts, enqueueSync } from './sync';

/** Square signs notificationUrl + rawBody with HMAC-SHA256 (base64). Constant-time compare. */
export function verifySquareSignature(rawBody: string, signature: string | null, key = env().SQUARE_WEBHOOK_SIGNATURE_KEY, url = env().SQUARE_WEBHOOK_URL) {
  if (!signature || !key || !url) return false;
  return safeEqual(hmac(key, url + rawBody, 'base64'), signature);
}

/** Stores the event once (dedupe on Square event_id). Returns false for duplicates. */
export async function recordEvent(evt: any): Promise<{ id: string; duplicate: boolean }> {
  const d = await db();
  const r = await d.query<{ id: string }>(
    `insert into webhook_events(provider, provider_event_id, event_type, merchant_ref, payload) values ('square',$1,$2,$3,$4)
     on conflict (provider, provider_event_id) do nothing returning id`, [evt.event_id, evt.type, evt.merchant_id ?? null, JSON.stringify(evt)]);
  if (r.rows[0]) return { id: r.rows[0].id, duplicate: false };
  const existing = (await d.query(`select id, status from webhook_events where provider = 'square' and provider_event_id = $1`, [evt.event_id])).rows[0];
  // A previously failed event may be retried by Square; process it again.
  return { id: existing.id, duplicate: existing.status === 'processed' || existing.status === 'ignored' };
}

async function integrationFor(squareMerchantId: string) {
  const d = await db();
  return (await d.query(`select id, merchant_id from merchant_integrations where provider = 'square' and provider_merchant_id = $1 and environment = $2`,
    [squareMerchantId, env().SQUARE_ENVIRONMENT])).rows[0] as { id: string; merchant_id: string } | undefined;
}

const FULFILLMENT_STATE: Record<string, OrderStatus> = { RESERVED: 'accepted', PREPARED: 'ready', COMPLETED: 'completed', CANCELED: 'canceled', FAILED: 'canceled' };

export async function processSquareEvent(eventRowId: string, evt: any) {
  const d = await db();
  const done = (status: 'processed' | 'ignored' | 'failed', err?: string) =>
    d.query(`update webhook_events set status = $2, processed_at = now(), attempts = attempts + 1, error_details = $3 where id = $1`, [eventRowId, status, err ?? null]);
  try {
    const integ = evt.merchant_id ? await integrationFor(evt.merchant_id) : undefined;
    if (!integ) { await done('ignored', 'no matching integration'); return; }
    const obj = evt.data?.object ?? {};

    switch (evt.type) {
      case 'payment.created':
      case 'payment.updated': {
        const pid = obj.payment?.id ?? evt.data?.id;
        // Re-read the payment from Square instead of trusting the webhook body.
        const token = await accessTokenFor(integ.id);
        const { payment } = await squareRequest(`/v2/payments/${pid}`, { token });
        const processing = (payment.processing_fee ?? []).reduce((s: number, f: any) => s + amountOf(f.amount_money), 0);
        await applyVerifiedPayment({
          providerPaymentId: payment.id, providerOrderId: payment.order_id, status: payment.status, amount: amountOf(payment.total_money ?? payment.amount_money),
          tip: amountOf(payment.tip_money), appFee: amountOf(payment.app_fee_money), processingFee: payment.processing_fee ? processing : null,
          refunded: amountOf(payment.refunded_money), currency: payment.total_money?.currency ?? 'USD',
        });
        break;
      }
      case 'refund.created':
      case 'refund.updated': {
        const token = await accessTokenFor(integ.id);
        const { refund } = await squareRequest(`/v2/refunds/${obj.refund?.id ?? evt.data?.id}`, { token });
        await applyRefund({ providerRefundId: refund.id, providerPaymentId: refund.payment_id, amount: amountOf(refund.amount_money),
          appFeeRefunded: amountOf(refund.app_fee_money), status: refund.status, reason: refund.reason });
        break;
      }
      case 'order.fulfillment.updated':
      case 'order.updated': {
        const orderId = obj.order_fulfillment_updated?.order_id ?? obj.order_updated?.order_id ?? evt.data?.id;
        const local = (await d.query(`select id, status from orders where provider = 'square' and provider_order_id = $1`, [orderId])).rows[0];
        if (!local) { await done('ignored', 'order not created by Honeydoo'); return; }
        const token = await accessTokenFor(integ.id);
        const { order } = await squareRequest(`/v2/orders/${orderId}`, { token });
        const f = (order.fulfillments ?? []).find((x: any) => x.type === 'PICKUP');
        const target = order.state === 'CANCELED' ? 'canceled' : f ? FULFILLMENT_STATE[f.state] : undefined;
        if (target) {
          const moved = await d.tx((q) => transition(q, local.id, target, 'square', `fulfillment ${f?.state ?? order.state}`));
          if (moved && target === 'completed') await track('order_fulfilled', { orderId: local.id, merchantId: integ.merchant_id });
        }
        break;
      }
      case 'inventory.count.updated':
        await applyInventoryCounts(integ.id, obj.inventory_counts ?? []);
        break;
      case 'catalog.version.updated':
        await enqueueSync(integ.id, 'webhook_update');
        break;
      case 'oauth.authorization.revoked':
        await d.query(`update merchant_integrations set connection_status = 'revoked', encrypted_credentials_reference = null, updated_at = now() where id = $1`, [integ.id]);
        // A merchant who revokes access immediately stops being orderable.
        await d.query(`update merchants set status = 'disconnected', updated_at = now() where id = $1`, [integ.merchant_id]);
        break;
      default:
        await done('ignored', 'event type not handled'); return;
    }
    await done('processed');
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 500) : 'processing failed';
    log('error', 'square_webhook_failed', { type: evt.type, eventId: evt.event_id, error: msg });
    await done('failed', msg);
    throw e;
  }
}
