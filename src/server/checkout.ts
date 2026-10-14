import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { HttpError, log } from '@/lib/http';
import { sha256 } from '@/lib/crypto';
import { track } from '@/lib/analytics';
import { quoteMerchant } from './pricing';
import { publicCode, transition } from './orders';
import { providerForMerchant } from './integrations/registry';

export interface CreateCheckoutInput {
  sessionId: string; customerId?: string | null; cartId: string; merchantId: string; quoteHash: string;
  contact: { name: string; email: string }; pickupNote?: string; tipMinor?: number; referralSource?: string;
}

export interface CreateCheckoutOutput { orderId: string; status: string; checkoutUrl: string | null; message: string | null; reused: boolean }

/**
 * Creates (or reuses) the order for one merchant and starts payment with that merchant's provider.
 * Idempotent: the same bag contents + quote always map to the same order, so double clicks and retries
 * never create a second order or a second payment link.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
  const d = await db();

  const prepared = await d.tx(async (q) => {
    await q.query(`select id from carts where id = $1 for update`, [input.cartId]);
    // A repeat submit of an already-approved quote returns that order, even if the bag has since been cleared.
    const prior = (await q.query(`select o.id, o.status, (select checkout_url from payments p where p.order_id = o.id order by created_at desc limit 1) as url
                                   from orders o where cart_id = $1 and merchant_id = $2 and quote_hash = $3 and status <> 'payment_failed' order by created_at desc limit 1`,
      [input.cartId, input.merchantId, input.quoteHash])).rows[0];
    if (prior) return { reused: true as const, orderId: prior.id as string, status: prior.status as string, url: prior.url as string | null };
    const quote = await quoteMerchant(q, { cartId: input.cartId, merchantId: input.merchantId, tipMinor: input.tipMinor });
    if (quote.quoteHash !== input.quoteHash) throw new HttpError(409, 'quote_changed', 'Prices or availability changed. Review your order total before paying.', { quote });
    if (quote.issues.length) throw new HttpError(409, 'items_unavailable', 'Some items are no longer available. Remove them to continue.', { issues: quote.issues });

    const idempotencyKey = sha256(`checkout:${input.cartId}:${input.merchantId}:${quote.cartVersion}:${quote.quoteHash}`).slice(0, 48);
    const existing = (await q.query(`select o.id, o.status, (select checkout_url from payments p where p.order_id = o.id order by created_at desc limit 1) as url
                                      from orders o where idempotency_key = $1`, [idempotencyKey])).rows[0];
    if (existing && existing.status === 'payment_failed') {
      // A failed attempt frees its key so the shopper can retry; the failed order stays for the audit trail.
      await q.query(`update orders set idempotency_key = idempotency_key || ':failed:' || gen_random_uuid() where id = $1`, [existing.id]);
    } else if (existing) {
      return { reused: true as const, orderId: existing.id as string, status: existing.status as string, url: existing.url as string | null };
    }

    const order = (await q.query<{ id: string; public_code: string }>(
      `insert into orders(public_code, customer_id, session_id, cart_id, merchant_id, merchant_location_id, provider, idempotency_key, status,
         merchandise_subtotal, tax_total, service_fee, merchant_fee, merchant_fee_waived, discount_total, tip_total, grand_total, currency,
         pickup_details, contact_email, contact_name, referral_source, quote_hash)
       values ($1,$21,$2,$3,$4,$5,$6,$7,'awaiting_payment',$8,$9,0,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) returning id, public_code`,
      [publicCode(), input.sessionId, input.cartId, quote.merchant.id, quote.location.id, quote.provider, idempotencyKey,
       quote.merchandiseSubtotal, quote.taxTotal, quote.merchantFee, quote.merchantFeeWaived, quote.discountTotal, quote.tipTotal, quote.grandTotal, quote.currency,
       JSON.stringify({ type: 'pickup', schedule: 'asap', note: input.pickupNote ?? null, estimate: quote.location.pickupLabel, location: quote.location.name }),
       input.contact.email, input.contact.name, input.referralSource ?? null, quote.quoteHash, input.customerId ?? null])).rows[0];
    for (const l of quote.lines) {
      await q.query(
        `insert into order_items(order_id, product_id, variation_id, source_variation_id, product_name_snapshot, variation_name_snapshot,
           unit_price_snapshot, quantity, modifier_snapshot, taxable, line_total) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [order.id, l.productId, l.variationId, l.sourceVariationId, l.productName, l.variationName, l.unitPrice, l.quantity,
         JSON.stringify(l.modifiers.map((m) => ({ id: m.id, source_id: m.sourceId, name: m.name, price: m.price }))), l.taxable, l.lineTotal]);
    }
    await q.query(`insert into order_status_history(order_id, from_status, to_status, reason, actor) values ($1,null,'awaiting_payment','checkout created','shopper')`, [order.id]);
    return { reused: false as const, orderId: order.id, code: order.public_code, quote, idempotencyKey };
  });

  if (prepared.reused) {
    return { orderId: prepared.orderId, status: prepared.status, checkoutUrl: prepared.status === 'awaiting_payment' ? prepared.url : null, message: null, reused: true };
  }

  // Payment link creation happens outside the DB transaction (network call), keyed by the same idempotency key.
  const { quote } = prepared;
  await track('checkout_started', { sessionId: input.sessionId, customerId: input.customerId ?? null, merchantId: quote.merchant.id, orderId: prepared.orderId, properties: { total: quote.grandTotal, provider: quote.provider } });
  const { provider } = await providerForMerchant(d, quote.merchant.id);
  try {
    const result = await provider.createCheckout({
      q: d,
      req: {
        orderId: prepared.orderId, publicCode: prepared.code, idempotencyKey: prepared.idempotencyKey, merchant: quote.merchant, location: quote.location,
        lines: quote.lines, merchantFee: quote.merchantFee, tip: quote.tipTotal, total: quote.grandTotal, currency: quote.currency,
        contact: input.contact, pickupNote: input.pickupNote, redirectUrl: `${env().APP_URL}/orders/${prepared.orderId}?returned=1`,
      },
    });
    if (result.kind === 'redirect') {
      await d.tx(async (q) => {
        await q.query(`update orders set provider_order_id = $2, updated_at = now() where id = $1`, [prepared.orderId, result.providerOrderId]);
        await q.query(`insert into payments(order_id, provider, provider_link_id, checkout_url, status, amount, application_fee, currency, expires_at)
                       values ($1,$2,$3,$4,'pending',$5,$6,$7,$8)`,
          [prepared.orderId, provider.id, result.providerLinkId, result.url, quote.grandTotal, result.appFee, quote.currency, result.expiresAt]);
      });
      return { orderId: prepared.orderId, status: 'awaiting_payment', checkoutUrl: result.url, message: null, reused: false };
    }
    await d.tx(async (q) => {
      await q.query(`insert into payments(order_id, provider, status, amount, application_fee, currency) values ($1,$2,'not_configured',$3,0,$4)`,
        [prepared.orderId, provider.id, quote.grandTotal, quote.currency]);
      await q.query(`update orders set status = 'payment_not_configured', updated_at = now() where id = $1`, [prepared.orderId]);
      // Demo orders end here, so their lines leave the bag like a completed order would.
      await q.query(`delete from cart_items ci using product_variations v, products p where ci.product_variation_id = v.id and v.product_id = p.id and ci.cart_id = $1 and p.merchant_id = $2`, [input.cartId, quote.merchant.id]);
      await q.query(`update carts set version = version + 1, updated_at = now() where id = $1`, [input.cartId]);
      await q.query(`insert into order_status_history(order_id, from_status, to_status, reason, actor) values ($1,'awaiting_payment','payment_not_configured',$2,'system')`, [prepared.orderId, result.reason]);
    });
    return { orderId: prepared.orderId, status: 'payment_not_configured', checkoutUrl: null, message: result.reason, reused: false };
  } catch (e) {
    log('error', 'checkout_provider_failed', { orderId: prepared.orderId, provider: provider.id, error: e instanceof Error ? e.message : String(e) });
    await d.tx(async (q) => {
      await q.query(`insert into payments(order_id, provider, status, amount, currency) values ($1,$2,'failed',$3,$4)`, [prepared.orderId, provider.id, quote.grandTotal, quote.currency]);
      await transition(q, prepared.orderId, 'payment_failed', 'system', 'payment link could not be created');
    });
    await track('checkout_failed', { sessionId: input.sessionId, merchantId: quote.merchant.id, orderId: prepared.orderId });
    if (e instanceof HttpError && e.status === 409) throw e;
    throw new HttpError(502, 'payment_unavailable', 'We could not start payment with this shop. Nothing was charged. Please try again in a moment.');
  }
}
