import type { Queryable } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { sha256 } from '@/lib/crypto';
import { pickupWindow } from '@/lib/hours';
import { getCartView } from './cart';
import { providerForMerchant } from './integrations/registry';
import type { CommerceProvider, LocationRef, MerchantRef, QuoteLine } from './integrations/types';

export interface Quote {
  cartId: string; cartVersion: number;
  merchant: MerchantRef & { slug: string }; location: LocationRef & { pickupLabel: string; address: string };
  provider: CommerceProvider['id']; paymentsEnabled: boolean;
  lines: QuoteLine[];
  merchandiseSubtotal: number; taxTotal: number; discountTotal: number; tipTotal: number;
  /** Honeydoo's per-order fee, paid by the merchant. Never added to the customer's total. */
  merchantFee: number; merchantFeeWaived: boolean; grandTotal: number; currency: string;
  taxNote: string; issues: string[]; quoteHash: string;
}

/** Server-side, authoritative quote for ONE merchant's items in the bag. The client never supplies prices. */
export async function quoteMerchant(q: Queryable, args: { cartId: string; merchantId: string; tipMinor?: number }): Promise<Quote> {
  const cart = await getCartView(args.cartId, q);
  const group = cart.groups.find((g) => g.merchant.id === args.merchantId);
  if (!group || !group.lines.length) throw new HttpError(404, 'nothing_to_checkout', 'There are no items from this shop in your bag.');

  const m = (await q.query(
    `select m.id, m.slug, m.display_name, m.is_demo, m.status, m.service_fee_enabled, m.service_fee_minor, m.contact_email,
            l.id as location_id, l.source_location_id, l.tax_rate_bps, l.timezone, l.pickup_prep_minutes, l.name as location_name,
            l.operating_hours, l.pickup_enabled, l.active, l.address, l.city, l.state
       from merchants m join merchant_locations l on l.id = $2 where m.id = $1`, [args.merchantId, group.lines[0].locationId])).rows[0];
  if (!m || m.status !== 'active') throw new HttpError(409, 'merchant_unavailable', 'This shop is not taking orders on Honeydoo right now.');
  if (!m.active || !m.pickup_enabled) throw new HttpError(409, 'pickup_unavailable', 'This location is not accepting pickup orders right now.');

  const issues = group.lines.filter((l) => !l.available).map((l) => `${l.productName}: ${l.availabilityNote}`);
  const live = group.lines.filter((l) => l.available);
  if (!live.length) throw new HttpError(409, 'items_unavailable', 'None of the items from this shop are available right now.', { issues });

  const details = (await q.query(
    `select v.id, v.source_variation_id, p.taxable from product_variations v join products p on p.id = v.product_id where v.id = any($1::uuid[])`,
    [live.map((l) => l.variationId)])).rows;
  const dmap = new Map(details.map((d) => [d.id, d]));
  const modSrc = new Map((await q.query(`select id, source_id from modifiers where id = any($1::uuid[])`, [live.flatMap((l) => l.modifiers.map((x) => x.id))])).rows.map((r) => [r.id, r.source_id]));

  const lines: QuoteLine[] = live.map((l) => ({
    cartItemId: l.id, productId: l.productId, variationId: l.variationId, sourceVariationId: dmap.get(l.variationId)!.source_variation_id,
    productName: l.productName, variationName: l.variationName, unitPrice: l.unitPrice, quantity: l.quantity, taxable: dmap.get(l.variationId)!.taxable,
    modifiers: l.modifiers.map((x) => ({ ...x, sourceId: modSrc.get(x.id) })), lineTotal: l.lineTotal,
  }));
  const merchandiseSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  // Bites-style model: the shop pays Honeydoo's flat fee out of the payment; the customer never sees it.
  const merchantFeeWaived = !m.service_fee_enabled;
  const merchantFee = merchantFeeWaived ? 0 : m.service_fee_minor;
  const tipTotal = Math.max(0, Math.min(args.tipMinor ?? 0, 100_00));

  const merchant: MerchantRef & { slug: string } = { id: m.id, slug: m.slug, name: m.display_name, isDemo: m.is_demo, integrationId: null, contactEmail: m.contact_email };
  const location = {
    id: m.location_id, sourceLocationId: m.source_location_id, taxRateBps: m.tax_rate_bps, timezone: m.timezone, prepMinutes: m.pickup_prep_minutes,
    name: m.location_name, address: [m.address, m.city, m.state].filter(Boolean).join(', '),
    pickupLabel: pickupWindow(m.operating_hours ?? {}, m.timezone, m.pickup_prep_minutes).label,
  };
  const { provider, integrationId } = await providerForMerchant(q, m.id);
  merchant.integrationId = integrationId;
  const { taxTotal, discountTotal, taxNote } = await provider.calculate({ q, merchant, location, lines });
  const grandTotal = merchandiseSubtotal + taxTotal + tipTotal - discountTotal;

  const quoteHash = sha256(JSON.stringify({
    c: args.cartId, v: cart.version, m: m.id, l: lines.map((x) => [x.variationId, x.quantity, x.unitPrice, x.modifiers.map((y) => y.id)]),
    t: [merchandiseSubtotal, taxTotal, discountTotal, tipTotal, grandTotal],
  })).slice(0, 32);

  return {
    cartId: args.cartId, cartVersion: cart.version, merchant, location, provider: provider.id, paymentsEnabled: provider.capabilities.onlinePayments,
    lines, merchandiseSubtotal, taxTotal, discountTotal, tipTotal, merchantFee, merchantFeeWaived, grandTotal, currency: 'USD', taxNote, issues, quoteHash,
  };
}
