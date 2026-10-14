import { describe, it, expect, beforeAll } from 'vitest';
import { WebhooksHelper } from 'square';
import { freshDb, fakeSquare, squareMerchant, calls, SESSION } from './helpers';
import { addItem, getOrCreateCart, getCartView } from '../src/server/cart';
import { quoteMerchant } from '../src/server/pricing';
import { createCheckout } from '../src/server/checkout';
import { applyRefund, applyVerifiedPayment } from '../src/server/payments';
import { processSquareEvent, recordEvent, verifySquareSignature } from '../src/server/integrations/square/webhooks';
import { hmac } from '../src/lib/crypto';
import { appFeeFor } from '../src/server/integrations/square/provider';
import type { Db } from '../src/lib/db';

let db: Db; let ids: Awaited<ReturnType<typeof squareMerchant>>; let orderId: string; let total: number;

async function seedSquareProduct() {
  const p = (await db.query(`insert into products(merchant_id, source_provider, source_item_id, name, publication_status, taxable) values ($1,'square','ITEM_BOUQUET','Garden Bouquet','published',true) returning id`, [ids.merchantId])).rows[0].id;
  const v = (await db.query(`insert into product_variations(product_id, source_variation_id, name, price_minor_units) values ($1,'VAR_SMALL','Small',3500) returning id`, [p])).rows[0].id;
  await db.query(`insert into product_location_availability(variation_id, merchant_location_id, availability_status) values ($1,$2,'available')`, [v, ids.locationId]);
  return v as string;
}

const squareCheckout = (taxPerLine = 280) => (m: string, p: string, b: any): [number, any] | undefined => {
  const gross = (b?.order?.line_items ?? []).reduce((s: number, li: any) => s + 3500 * Number(li.quantity), 0);
  const fee = 0; // no customer-facing fee lines
  const lineItems = (b?.order?.line_items ?? []).map((li: any) => ({ gross_sales_money: { amount: 3500 * Number(li.quantity) } }));
  if (m === 'POST' && p === '/v2/orders/calculate') return [200, { order: { line_items: lineItems, total_tax_money: { amount: taxPerLine }, total_discount_money: { amount: 0 }, total_money: { amount: gross + taxPerLine + fee } } }];
  if (m === 'POST' && p === '/v2/online-checkout/payment-links') return [200, { payment_link: { id: 'PL1', url: 'https://sandbox.square.link/u/abc', order_id: 'SQ_ORDER_1' }, related_resources: { orders: [{ id: 'SQ_ORDER_1', total_money: { amount: gross + taxPerLine + fee } }] } }];
};

beforeAll(async () => {
  db = await freshDb(false);
  ids = await squareMerchant(db);
  const vid = await seedSquareProduct();
  const cart = await getOrCreateCart(SESSION);
  await addItem(cart.id, { variationId: vid, quantity: 1, modifierIds: [] });
  fakeSquare(squareCheckout());
  const q = await quoteMerchant(db, { cartId: cart.id, merchantId: ids.merchantId });
  expect(q.provider).toBe('square');
  expect(q.taxTotal).toBe(280);
  expect(q.grandTotal).toBe(3500 + 280); // customer pays the shop price plus tax, nothing else
  total = q.grandTotal;
  const out = await createCheckout({ sessionId: SESSION, cartId: cart.id, merchantId: ids.merchantId, quoteHash: q.quoteHash, contact: { name: 'Pat', email: 'pat@example.com' } });
  expect(out.checkoutUrl).toBe('https://sandbox.square.link/u/abc');
  orderId = out.orderId;
});

describe('Square checkout request', () => {
  it('sends catalog variation ids at shop prices, no customer fee line, the $1 merchant app fee and a pickup fulfillment', () => {
    const req = calls.find((c) => c.path === '/v2/online-checkout/payment-links')!.body;
    expect(req.idempotency_key).toBeTruthy();
    expect(req.order.location_id).toBe('LOC1');
    expect(req.order.line_items[0]).toMatchObject({ catalog_object_id: 'VAR_SMALL', quantity: '1' });
    expect(req.order.service_charges).toBeUndefined();
    expect(req.checkout_options.app_fee_money).toEqual({ amount: 100, currency: 'USD' });
    expect(req.order.fulfillments[0]).toMatchObject({ type: 'PICKUP', pickup_details: { schedule_type: 'ASAP', recipient: { email_address: 'pat@example.com' } } });
    expect(req.order.pricing_options.auto_apply_taxes).toBe(true);
  });
  it('does not mark the order paid when the shopper merely returns', async () => {
    expect((await db.query(`select status from orders where id = $1`, [orderId])).rows[0].status).toBe('awaiting_payment');
  });
});

describe('Merchant-paid fee', () => {
  it('collects the fee from the merchant only when permitted, and caps it on tiny orders', () => {
    const all = ['PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS'];
    expect(appFeeFor({ merchantFee: 100, total: 3780 }, all)).toBe(100);
    expect(appFeeFor({ merchantFee: 100, total: 3780 }, [])).toBe(0);      // not granted: invoiced instead
    expect(appFeeFor({ merchantFee: 100, total: 90 }, all)).toBe(81);      // never exceeds the payment
    expect(appFeeFor({ merchantFee: 0, total: 3780 }, all)).toBe(0);       // waived
  });
});

describe('Payments, webhooks and reconciliation', () => {
  it('verifies Square webhook signatures exactly like the official SDK', async () => {
    const body = JSON.stringify({ event_id: 'e1', type: 'payment.updated' });
    const sig = hmac('whsec-test-key', 'https://honeydoo.test/api/v1/webhooks/square' + body, 'base64');
    expect(verifySquareSignature(body, sig)).toBe(true);
    expect(await WebhooksHelper.verifySignature({ requestBody: body, signatureHeader: sig, signatureKey: 'whsec-test-key', notificationUrl: 'https://honeydoo.test/api/v1/webhooks/square' })).toBe(true);
    expect(verifySquareSignature(body + ' ', sig)).toBe(false);
    expect(verifySquareSignature(body, null)).toBe(false);
  });

  it('marks paid only after reading the payment back from Square, and records the ledger', async () => {
    const payment = { id: 'PAY1', order_id: 'SQ_ORDER_1', status: 'COMPLETED', total_money: { amount: total, currency: 'USD' }, app_fee_money: { amount: 100 }, processing_fee: [{ amount_money: { amount: 145 } }] };
    fakeSquare((m, p) => (m === 'GET' && p === '/v2/payments/PAY1' ? [200, { payment }] : undefined));
    const evt = { event_id: 'evt-1', type: 'payment.updated', merchant_id: 'SQ_MERCHANT_1', data: { id: 'PAY1', object: { payment: { id: 'PAY1', status: 'COMPLETED' } } } };
    const r = await recordEvent(evt); expect(r.duplicate).toBe(false);
    await processSquareEvent(r.id, evt);
    expect((await db.query(`select status from orders where id = $1`, [orderId])).rows[0].status).toBe('paid');
    const t = (await db.query(`select * from transactions where order_id = $1`, [orderId])).rows[0];
    expect(t).toMatchObject({ gross_amount: total, honeydoo_revenue: 100, processing_cost: 145, merchant_proceeds: total - 100 - 145, estimated_contribution_margin: 100 - 8 });
    expect((await getCartView((await getOrCreateCart(SESSION)).id)).groups).toHaveLength(0);
  });

  it('deduplicates repeated webhook deliveries', async () => {
    const evt = { event_id: 'evt-1', type: 'payment.updated', merchant_id: 'SQ_MERCHANT_1', data: { id: 'PAY1' } };
    expect((await recordEvent(evt)).duplicate).toBe(true);
    await applyVerifiedPayment({ providerPaymentId: 'PAY1', providerOrderId: 'SQ_ORDER_1', status: 'COMPLETED', amount: total, tip: 0, appFee: 100, processingFee: 145, refunded: 0, currency: 'USD' });
    expect((await db.query(`select count(*)::int as n from transactions`)).rows[0].n).toBe(1);
    expect((await db.query(`select count(*)::int as n from analytics_events where event = 'checkout_completed'`)).rows[0].n).toBe(1);
  });

  it('records partial and full refunds and reduces Honeydoo revenue when the fee is refunded', async () => {
    await applyRefund({ providerRefundId: 'R1', providerPaymentId: 'PAY1', amount: 1000, appFeeRefunded: 0, status: 'COMPLETED' });
    expect((await db.query(`select status from orders where id = $1`, [orderId])).rows[0].status).toBe('partially_refunded');
    await applyRefund({ providerRefundId: 'R2', providerPaymentId: 'PAY1', amount: total - 1000, appFeeRefunded: 100, status: 'COMPLETED' });
    expect((await db.query(`select status from orders where id = $1`, [orderId])).rows[0].status).toBe('refunded');
    const t = (await db.query(`select refunds, honeydoo_revenue, settlement_status from transactions where order_id = $1`, [orderId])).rows[0];
    expect(t).toMatchObject({ refunds: total, honeydoo_revenue: 0, settlement_status: 'reversed' });
  });

  it('never loses a payment it cannot match, and flags amount mismatches', async () => {
    const r = await applyVerifiedPayment({ providerPaymentId: 'PAY_X', providerOrderId: 'UNKNOWN', status: 'COMPLETED', amount: 999, tip: 0, appFee: 0, processingFee: null, refunded: 0, currency: 'USD' });
    expect(r.matched).toBe(false);
    expect((await db.query(`select count(*)::int as n from audit_log where action = 'unmatched_payment'`)).rows[0].n).toBe(1);

    const o2 = (await db.query(`insert into orders(public_code, merchant_id, merchant_location_id, provider, provider_order_id, idempotency_key, status, merchandise_subtotal, grand_total, quote_hash)
      values ('HD-TEST2',$1,$2,'square','SQ_ORDER_2','k2','expired',1000,1000,'h') returning id`, [ids.merchantId, ids.locationId])).rows[0].id;
    await applyVerifiedPayment({ providerPaymentId: 'PAY2', providerOrderId: 'SQ_ORDER_2', status: 'COMPLETED', amount: 1000, tip: 0, appFee: 0, processingFee: null, refunded: 0, currency: 'USD' });
    expect((await db.query(`select status from orders where id = $1`, [o2])).rows[0].status).toBe('paid'); // late payment after expiry is honored

    const o3 = (await db.query(`insert into orders(public_code, merchant_id, merchant_location_id, provider, provider_order_id, idempotency_key, status, merchandise_subtotal, grand_total, quote_hash)
      values ('HD-TEST3',$1,$2,'square','SQ_ORDER_3','k3','awaiting_payment',1000,1000,'h') returning id`, [ids.merchantId, ids.locationId])).rows[0].id;
    await applyVerifiedPayment({ providerPaymentId: 'PAY3', providerOrderId: 'SQ_ORDER_3', status: 'COMPLETED', amount: 700, tip: 0, appFee: 0, processingFee: null, refunded: 0, currency: 'USD' });
    expect((await db.query(`select status from orders where id = $1`, [o3])).rows[0].status).toBe('needs_reconciliation');
  });

  it('marks failed payments without losing the order', async () => {
    const o4 = (await db.query(`insert into orders(public_code, merchant_id, merchant_location_id, provider, provider_order_id, idempotency_key, status, merchandise_subtotal, grand_total, quote_hash)
      values ('HD-TEST4',$1,$2,'square','SQ_ORDER_4','k4','awaiting_payment',1000,1000,'h') returning id`, [ids.merchantId, ids.locationId])).rows[0].id;
    await applyVerifiedPayment({ providerPaymentId: 'PAY4', providerOrderId: 'SQ_ORDER_4', status: 'FAILED', amount: 1000, tip: 0, appFee: 0, processingFee: null, refunded: 0, currency: 'USD' });
    expect((await db.query(`select status from orders where id = $1`, [o4])).rows[0].status).toBe('payment_failed');
  });

  it('refuses to send the shopper to pay a total that differs from the approved quote', async () => {
    await db.query(`delete from orders where status = 'awaiting_payment'`);
    const cart = await getOrCreateCart('second-session-bbbbbbbbbbbbbbbb');
    const vid = (await db.query(`select id from product_variations where source_variation_id = 'VAR_SMALL'`)).rows[0].id;
    await addItem(cart.id, { variationId: vid, quantity: 2, modifierIds: [] });
    fakeSquare((m, p, b) => {
      const base = squareCheckout()(m, p, b);
      if (base && p === '/v2/online-checkout/payment-links') base[1].related_resources.orders[0].total_money.amount += 50;
      if (m === 'DELETE') return [200, {}];
      return base;
    });
    const q = await quoteMerchant(db, { cartId: cart.id, merchantId: ids.merchantId });
    await expect(createCheckout({ sessionId: 'second-session-bbbbbbbbbbbbbbbb', cartId: cart.id, merchantId: ids.merchantId, quoteHash: q.quoteHash, contact: { name: 'B', email: 'b@example.com' } })).rejects.toThrow(/total changed/);
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/v2/online-checkout/payment-links/PL1')).toBe(true);
  });

  it('stops orders when a merchant revokes access', async () => {
    const evt = { event_id: 'evt-revoke', type: 'oauth.authorization.revoked', merchant_id: 'SQ_MERCHANT_1', data: {} };
    const r = await recordEvent(evt); await processSquareEvent(r.id, evt);
    expect((await db.query(`select status from merchants where id = $1`, [ids.merchantId])).rows[0].status).toBe('disconnected');
    expect((await db.query(`select connection_status, encrypted_credentials_reference from merchant_integrations where id = $1`, [ids.integrationId])).rows[0]).toMatchObject({ connection_status: 'revoked', encrypted_credentials_reference: null });
  });
});
