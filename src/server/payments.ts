import { db, type Queryable } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/http';
import { track } from '@/lib/analytics';
import { transition, type OrderStatus } from './orders';

export interface VerifiedPayment {
  providerPaymentId: string; providerOrderId: string; status: 'APPROVED' | 'PENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED';
  amount: number; tip: number; appFee: number; processingFee: number | null; refunded: number; currency: string;
}

/**
 * Applies a payment state that was VERIFIED with the provider's API (never from the browser redirect or an
 * unverified webhook body). Idempotent: replays and out-of-order events cannot double-count or move status backwards.
 */
export async function applyVerifiedPayment(p: VerifiedPayment, actor = 'square') {
  const d = await db();
  return d.tx(async (q) => {
    const o = (await q.query(`select * from orders where provider = 'square' and provider_order_id = $1 for update`, [p.providerOrderId])).rows[0];
    if (!o) {
      // Money moved but we cannot match it. Keep it visible for an operator; never drop it.
      await q.query(`insert into audit_log(actor, action, entity, entity_id, details) values ($1,'unmatched_payment','payment',$2,$3)`,
        [actor, p.providerPaymentId, JSON.stringify({ providerOrderId: p.providerOrderId, amount: p.amount, status: p.status })]);
      log('error', 'unmatched_payment', { providerPaymentId: p.providerPaymentId, providerOrderId: p.providerOrderId });
      return { matched: false as const };
    }

    const pay = (await q.query(`select id from payments where order_id = $1 order by created_at desc limit 1`, [o.id])).rows[0];
    const payStatus = p.status === 'COMPLETED' ? 'completed' : p.status === 'APPROVED' ? 'approved' : p.status === 'PENDING' ? 'pending' : p.status === 'CANCELED' ? 'canceled' : 'failed';
    if (pay) {
      await q.query(`update payments set provider_payment_id = $2, status = $3, amount = $4, application_fee = $5, processing_fee = $6, refunded_amount = $7, updated_at = now() where id = $1`,
        [pay.id, p.providerPaymentId, payStatus, p.amount, p.appFee, p.processingFee, p.refunded]);
    } else {
      await q.query(`insert into payments(order_id, provider, provider_payment_id, status, amount, application_fee, processing_fee, refunded_amount, currency) values ($1,'square',$2,$3,$4,$5,$6,$7,$8)`,
        [o.id, p.providerPaymentId, payStatus, p.amount, p.appFee, p.processingFee, p.refunded, p.currency]);
    }

    if (p.status === 'COMPLETED') {
      // Amount check: a paid total that differs from the approved order total needs a human.
      const expected = o.grand_total - o.tip_total + p.tip;
      const target: OrderStatus = p.amount === expected ? 'paid' : 'needs_reconciliation';
      if (p.tip !== o.tip_total) await q.query(`update orders set tip_total = $2, grand_total = merchandise_subtotal + tax_total + service_fee + $2 - discount_total where id = $1`, [o.id, p.tip]);
      const moved = await transition(q, o.id, target, actor, target === 'paid' ? 'payment verified with Square' : `paid ${p.amount} but expected ${expected}`);
      if (!moved && !['paid', 'accepted', 'ready', 'completed'].includes(o.status)) await transition(q, o.id, 'needs_reconciliation', actor, `payment completed while order was ${o.status}`);
      await upsertTransaction(q, o.id, p);
      if (o.cart_id) {
        // Paid lines leave the bag; other shops' items stay.
        await q.query(`delete from cart_items ci using product_variations v, products p2 where ci.product_variation_id = v.id and v.product_id = p2.id and ci.cart_id = $1 and p2.merchant_id = $2`, [o.cart_id, o.merchant_id]);
      }
      return { matched: true as const, orderId: o.id, merchantId: o.merchant_id, sessionId: o.session_id, completed: true, wasPaid: ['paid', 'accepted', 'ready', 'completed'].includes(o.status) };
    }
    if (p.status === 'FAILED' || p.status === 'CANCELED') await transition(q, o.id, 'payment_failed', actor, `payment ${p.status.toLowerCase()}`);
    return { matched: true as const, orderId: o.id, merchantId: o.merchant_id, sessionId: o.session_id, completed: false, wasPaid: false };
  }).then(async (r) => {
    if (r.matched && r.completed && !r.wasPaid) {
      await track('checkout_completed', { sessionId: r.sessionId, merchantId: r.merchantId, orderId: r.orderId, properties: { amount: p.amount } });
      const d2 = await db();
      const n = (await d2.query(`select count(*)::int as n from orders where merchant_id = $1 and status in ('paid','accepted','ready','completed')`, [r.merchantId])).rows[0].n;
      if (n === 1) await track('merchant_first_order', { merchantId: r.merchantId, orderId: r.orderId });
      if (r.sessionId) {
        const prior = (await d2.query(`select count(*)::int as n from orders where session_id = $1 and id <> $2 and status in ('paid','accepted','ready','completed','refunded','partially_refunded')`, [r.sessionId, r.orderId])).rows[0].n;
        if (prior > 0) await track('repeat_purchase', { sessionId: r.sessionId, orderId: r.orderId });
      }
    }
    return r;
  });
}

/** Ledger: separates merchant proceeds, Honeydoo revenue and costs. $1 gross is not $1 profit. */
export async function upsertTransaction(q: Queryable, orderId: string, p: Pick<VerifiedPayment, 'amount' | 'appFee' | 'processingFee' | 'refunded'>, feeRefunded = 0) {
  const o = (await q.query(`select * from orders where id = $1`, [orderId])).rows[0];
  const honeydooRevenue = Math.max(0, p.appFee - feeRefunded);
  // Merchant-paid fee not collected through Square (permission missing or capped) is invoiced.
  const fullyRefunded = p.refunded >= p.amount && p.amount > 0;
  const receivable = fullyRefunded ? 0 : Math.max(0, (o.merchant_fee ?? 0) - p.appFee);
  const variable = env().HONEYDOO_VARIABLE_COST_MINOR;
  const merchantProceeds = p.processingFee === null ? null : p.amount - p.appFee - p.processingFee - p.refunded + feeRefunded;
  await q.query(
    `insert into transactions(order_id, merchant_id, gross_amount, merchandise_subtotal, tax_total, discount_total, tip_total, honeydoo_revenue,
       processing_cost, honeydoo_variable_cost, merchant_proceeds, refunds, estimated_contribution_margin, settlement_status, fee_receivable)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (order_id) do update set gross_amount = excluded.gross_amount, tip_total = excluded.tip_total, honeydoo_revenue = excluded.honeydoo_revenue,
       processing_cost = excluded.processing_cost, merchant_proceeds = excluded.merchant_proceeds, refunds = excluded.refunds,
       estimated_contribution_margin = excluded.estimated_contribution_margin, settlement_status = excluded.settlement_status, fee_receivable = excluded.fee_receivable, updated_at = now()`,
    [orderId, o.merchant_id, p.amount, o.merchandise_subtotal, o.tax_total, o.discount_total, o.tip_total, honeydooRevenue, p.processingFee, variable,
     merchantProceeds, p.refunded, honeydooRevenue + receivable - variable, fullyRefunded ? 'reversed' : 'pending', receivable]);
}

export async function applyRefund(r: { providerRefundId: string; providerPaymentId: string; amount: number; appFeeRefunded: number; status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REJECTED'; reason?: string }) {
  const d = await db();
  return d.tx(async (q) => {
    const pay = (await q.query(`select p.*, o.grand_total, o.status as order_status from payments p join orders o on o.id = p.order_id where p.provider_payment_id = $1`, [r.providerPaymentId])).rows[0];
    if (!pay) { await q.query(`insert into audit_log(actor, action, entity, entity_id, details) values ('square','unmatched_refund','refund',$1,$2)`, [r.providerRefundId, JSON.stringify(r)]); return { matched: false }; }
    const status = r.status.toLowerCase();
    await q.query(`insert into refunds(order_id, payment_id, provider_refund_id, amount, fee_refunded, status, reason) values ($1,$2,$3,$4,$5,$6,$7)
                   on conflict (provider_refund_id) where provider_refund_id is not null do update set amount = excluded.amount, fee_refunded = excluded.fee_refunded, status = excluded.status, updated_at = now()`,
      [pay.order_id, pay.id, r.providerRefundId, r.amount, r.appFeeRefunded, status, r.reason ?? null]);
    const totals = (await q.query(`select coalesce(sum(amount),0)::int as refunded, coalesce(sum(fee_refunded),0)::int as fee from refunds where payment_id = $1 and status = 'completed'`, [pay.id])).rows[0];
    await q.query(`update payments set refunded_amount = $2, updated_at = now() where id = $1`, [pay.id, totals.refunded]);
    if (totals.refunded > 0) {
      await transition(q, pay.order_id, totals.refunded >= pay.amount ? 'refunded' : 'partially_refunded', 'square', 'refund recorded');
      await upsertTransaction(q, pay.order_id, { amount: pay.amount, appFee: pay.application_fee, processingFee: pay.processing_fee, refunded: totals.refunded }, totals.fee);
    }
    return { matched: true, orderId: pay.order_id };
  });
}
