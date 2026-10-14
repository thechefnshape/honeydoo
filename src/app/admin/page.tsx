import Link from 'next/link';
import { staffPage } from '@/server/staff-session';
import { AdminBar } from '@/components/admin/admin-bar';
import { formatMoney } from '@/lib/money';
import { adminMetrics } from '@/server/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin', robots: { index: false } };

const LABELS: Record<string, string> = {
  marketplace_visit: 'Marketplace visits', search_performed: 'Searches', ai_search_performed: 'AI searches', merchant_viewed: 'Shop views', product_viewed: 'Product views',
  product_added_to_bag: 'Added to bag', checkout_started: 'Checkouts started', checkout_completed: 'Checkouts completed (paid)', checkout_failed: 'Checkouts failed',
  order_fulfilled: 'Orders picked up', repeat_purchase: 'Repeat purchases', merchant_signup_started: 'Merchant signups started', merchant_connected: 'Merchants connected',
  merchant_published: 'Merchants published', merchant_first_order: 'Merchant first orders', account_created: 'Accounts created',
};
const pct = (x: number | null) => (x === null ? 'No data yet' : `${(x * 100).toFixed(1)}%`);

export default async function Admin(props: { searchParams: Promise<{ scope?: string }> }) {
  const staff = await staffPage();
  const { scope } = await props.searchParams;
  const includeDemo = scope === 'all';
  const m = await adminMetrics(includeDemo);
  const maxFunnel = Math.max(1, ...m.funnel.map((f) => f.n));

  const tiles: [string, string, string?][] = [
    ['Connected merchants', String(m.merchants.connected)], ['Live merchants', String(m.merchants.active)], ['Monthly active merchants', String(m.merchants.monthly_active), 'At least one paid order in 30 days'],
    ['Selling locations', String(m.catalog.locations)], ['Published products', String(m.catalog.products), `${m.catalog.categories} categories`],
    ['Gross merchandise value', formatMoney(m.orders.gmv), 'Paid orders, incl. tax and fees'], ['Paid orders', String(m.orders.paid_orders)], ['Completed pickups', String(m.orders.completed)],
    ['Repeat customer rate', pct(m.repeatRate)], ['Order completion rate', pct(m.completionRate), 'Paid orders / checkouts started'],
    ['honeydoo revenue', formatMoney(m.money.revenue)], ['Revenue per transaction', formatMoney(Math.round(m.money.rev_per_txn))],
    ['Contribution margin per order', formatMoney(Math.round(m.money.margin_per_order)), 'Fee minus estimated variable cost'], ['Refunds', formatMoney(m.money.refunds)],
    ['Avg onboarding time', m.merchants.onboarding_hours ? `${m.merchants.onboarding_hours.toFixed(1)} h` : 'No data yet', 'Connect to live'], ['Disconnected merchants', String(m.merchants.churned)],
  ];

  return (
    <div className="page pt-8">
      <AdminBar staff={staff} active="network" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold">honeydoo network</h1><p className="mt-1 text-charcoal">Is honeydoo creating real, incremental local commerce?</p></div>
        <div className="flex gap-1 rounded-full bg-stone-soft p-1 text-sm font-medium">
          <Link href="/admin" className={`rounded-full px-4 py-2 ${!includeDemo ? 'bg-white shadow-sm' : 'text-charcoal'}`}>Real merchants</Link>
          <Link href="/admin?scope=all" className={`rounded-full px-4 py-2 ${includeDemo ? 'bg-white shadow-sm' : 'text-charcoal'}`}>Include demo</Link>
        </div>
      </div>

      <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map(([l, v, s]) => <div key={l} className="card p-5"><p className="text-sm text-muted">{l}</p><p className="tabular mt-2 text-2xl font-semibold">{v}</p>{s && <p className="mt-1 text-[12px] text-muted">{s}</p>}</div>)}
      </section>
      <p className="mt-3 text-[13px] text-muted">Not tracked yet: customer and merchant acquisition cost (needs marketing spend inputs) and satisfaction (needs post-pickup survey).</p>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Funnel, last 30 days</h2>
          <ul className="mt-4 space-y-2.5">
            {m.funnel.map((f) => (
              <li key={f.event} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 text-sm">
                <span>{LABELS[f.event]}</span><span className="tabular font-medium">{f.n}<span className="ml-2 font-normal text-muted">{f.sessions} sessions</span></span>
                <div className="col-span-2 mt-1 h-1.5 rounded-full bg-stone"><div className="h-1.5 rounded-full bg-honey" style={{ width: `${(f.n / maxFunnel) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-muted">Event counts include demo traffic. Merchant counts and money above follow the scope toggle.</p>
        </div>
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold">Reliability, 30 days</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Catalog syncs succeeded / failed</dt><dd className="tabular">{m.reliability.sync_ok} / {m.reliability.sync_failed}</dd></div>
              <div className="flex justify-between"><dt>Webhooks processed / failed</dt><dd className="tabular">{m.reliability.wh_ok} / {m.reliability.wh_failed}</dd></div>
              <div className="flex justify-between"><dt>Orders needing reconciliation</dt><dd className={`tabular ${m.orders.reconciliation ? 'text-bad font-semibold' : ''}`}>{m.orders.reconciliation}</dd></div>
              <div className="flex justify-between"><dt>Unmatched payments or refunds</dt><dd className={`tabular ${m.reliability.unmatched ? 'text-bad font-semibold' : ''}`}>{m.reliability.unmatched}</dd></div>
            </dl>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold">AI search</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Requests</dt><dd className="tabular">{m.ai.requests}</dd></div>
              <div className="flex justify-between"><dt>Served by keyword fallback</dt><dd className="tabular">{m.ai.fallback}</dd></div>
              <div className="flex justify-between"><dt>Invalid product IDs blocked</dt><dd className="tabular">{m.ai.rejected}</dd></div>
              <div className="flex justify-between"><dt>Average latency</dt><dd className="tabular">{m.ai.latency} ms</dd></div>
            </dl>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold">Geographic concentration</h2>
            {m.geo.length ? <ul className="mt-3 space-y-1.5 text-sm">{m.geo.map((g: any) => <li key={g.area} className="flex justify-between"><span>{g.area}</span><span className="tabular">{g.orders} orders · {formatMoney(g.gmv)}</span></li>)}</ul> : <p className="mt-2 text-sm text-charcoal">No paid orders yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
