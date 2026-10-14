import { db } from './db';

export const EVENTS = [
  'marketplace_visit', 'search_performed', 'ai_search_performed', 'merchant_viewed', 'product_viewed',
  'product_added_to_bag', 'checkout_started', 'checkout_completed', 'checkout_failed', 'order_fulfilled',
  'repeat_purchase', 'merchant_signup_started', 'merchant_connected', 'merchant_published', 'merchant_first_order',
  'account_created',
] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];

/** First-party, aggregate product analytics. No third-party trackers, no ad identifiers. */
export async function track(event: AnalyticsEvent, f: { sessionId?: string | null; merchantId?: string | null; productId?: string | null; orderId?: string | null; customerId?: string | null; properties?: Record<string, unknown> } = {}) {
  try {
    const d = await db();
    await d.query(
      `insert into analytics_events(event, session_id, customer_id, merchant_id, product_id, order_id, properties) values ($1,$2,$3,$4,$5,$6,$7)`,
      [event, f.sessionId ?? null, f.customerId ?? null, f.merchantId ?? null, f.productId ?? null, f.orderId ?? null, JSON.stringify(f.properties ?? {})]);
  } catch { /* analytics must never break commerce */ }
}

export async function audit(actor: string, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  const d = await db();
  await d.query(`insert into audit_log(actor, action, entity, entity_id, details) values ($1,$2,$3,$4,$5)`, [actor, action, entity, entityId, JSON.stringify(details)]);
}
