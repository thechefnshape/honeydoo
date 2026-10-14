import { db } from '@/lib/db';
import { EVENTS } from '@/lib/analytics';

/** Strategic and operational metrics. `includeDemo=false` keeps demonstration data out of business numbers. */
export async function adminMetrics(includeDemo: boolean) {
  const d = await db();
  const demo = includeDemo ? '' : 'and not m.is_demo';
  const one = async (sql: string, p: unknown[] = []) => (await d.query(sql, p)).rows[0];
  const PAID = `('paid','accepted','ready','completed','partially_refunded')`;

  const merchants = await one(`select
      count(*) filter (where exists (select 1 from merchant_integrations i where i.merchant_id = m.id and i.connection_status = 'connected'))::int as connected,
      count(*) filter (where m.status = 'active')::int as active,
      count(*) filter (where exists (select 1 from orders o where o.merchant_id = m.id and o.status in ${PAID} and o.created_at > now() - interval '30 days'))::int as monthly_active,
      count(*) filter (where m.status = 'disconnected')::int as churned,
      coalesce(avg(extract(epoch from (m.activated_at - m.created_at)) / 3600) filter (where m.activated_at is not null and not m.is_demo), 0)::float as onboarding_hours
    from merchants m where true ${demo}`);
  const catalog = await one(`select count(distinct l.id)::int as locations, count(distinct p.id)::int as products, count(distinct p.category_id)::int as categories
    from merchants m join merchant_locations l on l.merchant_id = m.id and l.active
    left join products p on p.merchant_id = m.id and p.publication_status = 'published'
    where m.status = 'active' ${demo}`);
  const orders = await one(`select
      count(*) filter (where o.status in ${PAID})::int as paid_orders,
      count(*) filter (where o.status = 'completed')::int as completed,
      count(*)::int as created,
      coalesce(sum(o.grand_total) filter (where o.status in ${PAID}),0)::int as gmv,
      count(*) filter (where o.status = 'needs_reconciliation')::int as reconciliation
    from orders o join merchants m on m.id = o.merchant_id where true ${demo}`);
  const money = await one(`select coalesce(sum(t.honeydoo_revenue),0)::int as revenue, coalesce(avg(t.honeydoo_revenue),0)::float as rev_per_txn,
      coalesce(avg(t.estimated_contribution_margin),0)::float as margin_per_order, coalesce(sum(t.refunds),0)::int as refunds
    from transactions t join merchants m on m.id = t.merchant_id where true ${demo}`);
  const repeat = await one(`select count(*) filter (where n >= 2)::int as repeaters, count(*)::int as buyers from (
      select coalesce(o.customer_id::text, o.session_id) as who, count(*) as n from orders o join merchants m on m.id = o.merchant_id
      where o.status in ${PAID} ${demo} group by 1) x`);
  const reliability = await one(`select
      count(*) filter (where status = 'succeeded')::int as sync_ok, count(*) filter (where status = 'failed')::int as sync_failed,
      (select count(*)::int from webhook_events where status = 'processed' and received_at > now() - interval '30 days') as wh_ok,
      (select count(*)::int from webhook_events where status = 'failed' and received_at > now() - interval '30 days') as wh_failed,
      (select count(*)::int from audit_log where action in ('unmatched_payment','unmatched_refund')) as unmatched
    from sync_jobs where created_at > now() - interval '30 days'`);
  const ai = await one(`select count(*)::int as requests, count(*) filter (where used_fallback)::int as fallback, coalesce(sum(rejected_ids),0)::int as rejected,
      coalesce(avg(latency_ms),0)::int as latency from ai_requests where created_at > now() - interval '30 days'`);
  const funnelRows = (await d.query(`select event, count(*)::int as n, count(distinct session_id)::int as sessions from analytics_events
      where created_at > now() - interval '30 days' group by event`)).rows;
  const funnel = EVENTS.map((e) => { const r = funnelRows.find((x) => x.event === e); return { event: e, n: (r?.n ?? 0) as number, sessions: (r?.sessions ?? 0) as number }; });
  const geo = (await d.query(`select coalesce(l.neighborhood, l.city) as area, count(*)::int as orders, coalesce(sum(o.grand_total),0)::int as gmv
      from orders o join merchant_locations l on l.id = o.merchant_location_id join merchants m on m.id = o.merchant_id
      where o.status in ${PAID} ${demo} group by 1 order by 2 desc limit 10`)).rows;
  const started = funnel.find((f) => f.event === 'checkout_started')!.n;
  return {
    merchants, catalog, orders, money, reliability, ai, funnel, geo,
    repeatRate: repeat.buyers ? repeat.repeaters / repeat.buyers : null,
    completionRate: started ? orders.paid_orders / started : null,
  };
}
