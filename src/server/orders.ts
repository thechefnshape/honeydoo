import { db, type Queryable } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { randomToken } from '@/lib/crypto';
import { SHOW_DEMO_LABELS } from '@/lib/flags';

export type OrderStatus = 'awaiting_payment' | 'payment_not_configured' | 'paid' | 'accepted' | 'ready' | 'completed' | 'canceled'
  | 'payment_failed' | 'expired' | 'refunded' | 'partially_refunded' | 'needs_reconciliation';

// Allowed transitions. Anything else is rejected so a late or replayed event cannot move an order backwards.
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ['paid', 'payment_failed', 'expired', 'canceled', 'needs_reconciliation'],
  payment_not_configured: ['canceled'],
  payment_failed: ['paid', 'expired', 'canceled'],
  expired: ['paid', 'needs_reconciliation'],
  needs_reconciliation: ['paid', 'canceled', 'refunded'],
  paid: ['accepted', 'ready', 'completed', 'canceled', 'refunded', 'partially_refunded'],
  accepted: ['ready', 'completed', 'canceled', 'refunded', 'partially_refunded'],
  ready: ['completed', 'canceled', 'refunded', 'partially_refunded'],
  completed: ['refunded', 'partially_refunded'],
  partially_refunded: ['refunded', 'partially_refunded', 'completed'],
  canceled: ['refunded', 'needs_reconciliation'],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) { return from === to || NEXT[from].includes(to); }

export async function transition(q: Queryable, orderId: string, to: OrderStatus, actor: string, reason?: string): Promise<boolean> {
  const cur = await q.query<{ status: OrderStatus }>(`select status from orders where id = $1 for update`, [orderId]);
  const from = cur.rows[0]?.status;
  if (!from) throw new HttpError(404, 'order_not_found', 'Order not found.');
  if (from === to) return false;
  if (!canTransition(from, to)) {
    await q.query(`insert into order_status_history(order_id, from_status, to_status, reason, actor) values ($1,$2,$3,$4,$5)`,
      [orderId, from, from, `rejected transition to ${to}${reason ? `: ${reason}` : ''}`, actor]);
    return false;
  }
  await q.query(`update orders set status = $2, updated_at = now() where id = $1`, [orderId, to]);
  await q.query(`insert into order_status_history(order_id, from_status, to_status, reason, actor) values ($1,$2,$3,$4,$5)`, [orderId, from, to, reason ?? null, actor]);
  return true;
}

export function publicCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = Buffer.from(randomToken(8), 'base64url');
  return 'HD-' + [...bytes.subarray(0, 5)].map((b) => alphabet[b % alphabet.length]).join('');
}

export interface OrderView {
  id: string; code: string; status: OrderStatus; createdAt: string; provider: string;
  merchant: { name: string; slug: string; isDemo: boolean; phone: string | null };
  location: { name: string; address: string };
  items: { name: string; variation: string; quantity: number; unitPrice: number; lineTotal: number; modifiers: { name: string; price: number }[] }[];
  merchandiseSubtotal: number; taxTotal: number; discountTotal: number; tipTotal: number; grandTotal: number;
  checkoutUrl: string | null; paymentStatus: string | null; pickup: Record<string, unknown>;
  history: { status: string; at: string; reason: string | null }[];
}

/** Account orders are visible to the account; guest orders only to the browser session that placed them. */
export async function getOrderForShopper(orderId: string, sessionId: string, customerId?: string | null): Promise<OrderView> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new HttpError(404, 'order_not_found', 'Order not found.');
  const d = await db();
  const o = (await d.query(
    `select o.*, m.display_name, m.slug, m.is_demo, m.contact_phone, l.name as location_name, l.address, l.city, l.state,
            (select checkout_url from payments p where p.order_id = o.id order by created_at desc limit 1) as checkout_url,
            (select status from payments p where p.order_id = o.id order by created_at desc limit 1) as payment_status
       from orders o join merchants m on m.id = o.merchant_id join merchant_locations l on l.id = o.merchant_location_id
      where o.id = $1 and ((o.customer_id is null and o.session_id = $2) or o.customer_id = $3::uuid)`, [orderId, sessionId, customerId ?? null])).rows[0];
  if (!o) throw new HttpError(404, 'order_not_found', 'Order not found.');
  return toView(d, o);
}

async function toView(d: Queryable, o: any): Promise<OrderView> {
  const items = (await d.query(`select * from order_items where order_id = $1 order by product_name_snapshot`, [o.id])).rows;
  const hist = (await d.query(`select to_status, reason, created_at from order_status_history where order_id = $1 and to_status <> coalesce(from_status,'') order by created_at`, [o.id])).rows;
  return {
    id: o.id, code: o.public_code, status: o.status, createdAt: new Date(o.created_at).toISOString(), provider: o.provider,
    merchant: { name: o.display_name, slug: o.slug, isDemo: o.is_demo, phone: o.contact_phone },
    location: { name: o.location_name, address: [o.address, o.city, o.state].filter(Boolean).join(', ') },
    items: items.map((i) => ({ name: i.product_name_snapshot, variation: i.variation_name_snapshot, quantity: i.quantity, unitPrice: i.unit_price_snapshot, lineTotal: i.line_total,
      modifiers: (typeof i.modifier_snapshot === 'string' ? JSON.parse(i.modifier_snapshot) : i.modifier_snapshot).map((m: any) => ({ name: m.name, price: m.price })) })),
    merchandiseSubtotal: o.merchandise_subtotal, taxTotal: o.tax_total, discountTotal: o.discount_total, tipTotal: o.tip_total, grandTotal: o.grand_total,
    checkoutUrl: o.status === 'awaiting_payment' ? o.checkout_url : null, paymentStatus: o.payment_status,
    pickup: typeof o.pickup_details === 'string' ? JSON.parse(o.pickup_details) : o.pickup_details,
    history: hist.map((h) => ({ status: h.to_status, at: new Date(h.created_at).toISOString(), reason: h.reason })),
  };
}

export async function listOrdersForShopper(sessionId: string, customerId?: string | null) {
  const d = await db();
  const { rows } = await d.query(
    `select o.id, o.public_code, o.status, o.grand_total, o.created_at, m.display_name, m.is_demo,
            (select count(*)::int from order_items i where i.order_id = o.id) as item_count
       from orders o join merchants m on m.id = o.merchant_id
      where (o.customer_id is null and o.session_id = $1) or o.customer_id = $2::uuid
      order by o.created_at desc limit 50`, [sessionId, customerId ?? null]);
  return rows.map((r) => ({ id: r.id, code: r.public_code, status: r.status as OrderStatus, total: r.grand_total, createdAt: new Date(r.created_at).toISOString(), merchant: r.display_name, isDemo: r.is_demo, itemCount: r.item_count }));
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Waiting for payment', payment_not_configured: SHOW_DEMO_LABELS ? 'Demo order, not charged' : 'Order received', paid: 'Paid, sent to shop', accepted: 'Shop is preparing it',
  ready: 'Ready for pickup', completed: 'Picked up', canceled: 'Canceled', payment_failed: 'Payment failed', expired: 'Checkout expired',
  refunded: 'Refunded', partially_refunded: 'Partly refunded', needs_reconciliation: 'Payment received, confirming with shop',
};
