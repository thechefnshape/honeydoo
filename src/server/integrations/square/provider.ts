import type { Queryable } from '@/lib/db';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import type { CheckoutRequest, CommerceProvider, LocationRef, QuoteLine } from '../types';
import { amountOf, money, squareRequest } from './client';
import { accessTokenFor } from './credentials';
import { enqueueSync } from './sync';

/**
 * Builds the Square order body: the shop's catalog items at the shop's prices, its own taxes, pickup.
 * No Honeydoo line is added. The customer pays exactly what they would pay in store.
 */
export function buildSquareOrder(args: { location: LocationRef; lines: QuoteLine[]; currency: string; referenceId?: string; orderId?: string; contact?: { name: string; email: string }; pickupNote?: string }) {
  const order: any = {
    location_id: args.location.sourceLocationId,
    line_items: args.lines.map((l) => ({
      catalog_object_id: l.sourceVariationId,
      quantity: String(l.quantity),
      modifiers: l.modifiers.map((m) => ({ catalog_object_id: m.sourceId })),
    })),
    pricing_options: { auto_apply_taxes: true, auto_apply_discounts: false },
  };
  if (args.referenceId) order.reference_id = args.referenceId;
  if (args.orderId) order.metadata = { honeydoo_order_id: args.orderId };
  if (args.contact) {
    order.fulfillments = [{
      type: 'PICKUP', state: 'PROPOSED',
      pickup_details: {
        recipient: { display_name: args.contact.name.slice(0, 100), email_address: args.contact.email },
        schedule_type: 'ASAP', prep_time_duration: `PT${Math.max(5, args.location.prepMinutes)}M`,
        note: args.pickupNote ? args.pickupNote.slice(0, 500) : `Honeydoo order ${args.referenceId ?? ''}`.trim(),
      },
    }];
  }
  return order;
}

/**
 * Honeydoo's fee is a Square application fee: Square deducts it from the MERCHANT's proceeds and routes it to
 * Honeydoo. It never changes what the customer pays. Requires the merchant to grant
 * PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS; otherwise the fee is recorded as receivable and invoiced.
 * Square caps application fees below the payment amount, so tiny orders are capped at 90% of the total.
 */
export function appFeeFor(req: Pick<CheckoutRequest, 'merchantFee' | 'total'>, grantedScopes: string[]) {
  if (env().SQUARE_COLLECT_APP_FEE !== 'true' || req.merchantFee <= 0 || !grantedScopes.includes('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS')) return 0;
  return Math.min(req.merchantFee, Math.floor(req.total * 0.9));
}

export function buildPaymentLinkRequest(req: CheckoutRequest, grantedScopes: string[]) {
  const appFee = appFeeFor(req, grantedScopes);
  return {
    idempotency_key: req.idempotencyKey,
    order: buildSquareOrder({ location: req.location, lines: req.lines, currency: req.currency, referenceId: req.publicCode, orderId: req.orderId, contact: req.contact, pickupNote: req.pickupNote }),
    checkout_options: {
      redirect_url: req.redirectUrl,
      ask_for_shipping_address: false,
      allow_tipping: false,
      ...(req.merchant.contactEmail ? { merchant_support_email: req.merchant.contactEmail } : {}),
      ...(appFee > 0 ? { app_fee_money: money(appFee, req.currency) } : {}),
    },
    pre_populated_data: { buyer_email: req.contact.email },
    payment_note: `Honeydoo ${req.publicCode}`,
  };
}

async function scopesFor(q: Queryable, integrationId: string): Promise<string[]> {
  return (await q.query(`select granted_scopes from merchant_integrations where id = $1`, [integrationId])).rows[0]?.granted_scopes ?? [];
}

export const squareProvider: CommerceProvider = {
  id: 'square',
  // Delivery is intentionally false: Square restricts visibility of third-party delivery orders without a partnership.
  capabilities: { onlinePayments: true, pickup: true, delivery: false, inventory: true, applicationFees: true },

  async calculate({ q, merchant, location, lines }) {
    if (!merchant.integrationId) throw new HttpError(409, 'not_connected', 'This shop is not connected to Square.');
    const token = await accessTokenFor(merchant.integrationId, q);
    const r = await squareRequest('/v2/orders/calculate', { token, body: { order: buildSquareOrder({ location, lines, currency: 'USD' }) } });
    const o = r.order ?? {};
    // Guard against a stale Honeydoo catalog: Square's line prices must match what the shopper saw.
    const squareGross = (o.line_items ?? []).reduce((s: number, li: any) => s + amountOf(li.gross_sales_money), 0);
    const ours = lines.reduce((s, l) => s + l.lineTotal, 0);
    if (squareGross !== ours) {
      await enqueueSync(merchant.integrationId, 'reconcile');
      throw new HttpError(409, 'prices_changed', 'This shop just updated its prices. Refresh to see the latest.');
    }
    return { taxTotal: amountOf(o.total_tax_money), discountTotal: amountOf(o.total_discount_money), taxNote: 'Calculated by the shop\'s Square account.' };
  },

  async createCheckout({ q, req }) {
    if (!req.merchant.integrationId) return { kind: 'not_configured', reason: 'This shop is not connected to Square yet.' };
    if (!req.location.sourceLocationId) throw new HttpError(409, 'location_unmapped', 'This location is not linked to a Square location.');
    const token = await accessTokenFor(req.merchant.integrationId, q);
    const scopes = await scopesFor(q, req.merchant.integrationId);
    const body = buildPaymentLinkRequest(req, scopes);
    const r = await squareRequest('/v2/online-checkout/payment-links', { token, body });
    const link = r.payment_link;
    const sqOrder = (r.related_resources?.orders ?? [])[0];
    const sqTotal = sqOrder ? amountOf(sqOrder.total_money) : null;
    if (sqTotal !== null && sqTotal !== req.total) {
      // Never send the shopper to pay an amount that differs from the total they approved.
      await squareRequest(`/v2/online-checkout/payment-links/${link.id}`, { token, method: 'DELETE' }).catch(() => undefined);
      throw new HttpError(409, 'quote_changed', 'The total changed while preparing payment. Review your order again.');
    }
    return { kind: 'redirect', url: link.url, providerOrderId: link.order_id, providerLinkId: link.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000), appFee: appFeeFor(req, scopes) };
  },
};
