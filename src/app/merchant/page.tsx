import Link from 'next/link';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { currentMerchant } from '@/server/merchant-auth';
import { merchantOrders, merchantOverview, readiness, MERCHANT_TERMS_VERSION } from '@/server/merchant';
import { env } from '@/lib/env';
import { formatMoney } from '@/lib/money';
import { STATUS_LABEL, type OrderStatus } from '@/server/orders';
import { DemoTag } from '@/components/cards';
import { CheckIcon } from '@/components/icons';
import { LaunchActions, SignOut, SyncButton } from './actions';
import { ProductsTable } from './products-table';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Merchant dashboard' };

const TABS = [['overview', 'Overview'], ['products', 'Products'], ['orders', 'Orders'], ['settings', 'Settings']] as const;
const STATUS: Record<string, [string, string]> = {
  active: ['Live on honeydoo', 'bg-ok/10 text-ok'], onboarding: ['Not live yet', 'bg-honey-soft text-warn'], pending_review: ['In review', 'bg-honey-soft text-warn'],
  paused: ['Paused', 'bg-stone text-charcoal'], disconnected: ['Disconnected', 'bg-bad/10 text-bad'],
};

function ago(d: string | Date | null) {
  if (!d) return 'Never';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 90) return 'Just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function MerchantDashboard(props: { searchParams: Promise<{ tab?: string; connected?: string }> }) {
  const sp = await props.searchParams;
  const s = await currentMerchant();
  if (!s) redirect('/merchant/connect');
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'overview';
  const [o, ready, orders] = await Promise.all([merchantOverview(s.merchantId), readiness(s.merchantId), merchantOrders(s.merchantId, 50)]);
  const [label, cls] = STATUS[o.merchant.status] ?? STATUS.onboarding;
  const storeUrl = `${env().APP_URL}/shop/${o.merchant.slug}?ref=${o.merchant.referral_code ?? o.merchant.slug}`;
  const integ = o.integration;
  const health = !integ ? ['Not connected', 'text-bad'] : integ.connection_status === 'connected' ? (integ.last_error ? ['Connected, with warnings', 'text-warn'] : ['Healthy', 'text-ok']) : [integ.connection_status === 'needs_reauth' ? 'Reconnect needed' : 'Disconnected', 'text-bad'];

  return (
    <div className="page pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{o.merchant.display_name}</h1>
        {o.merchant.is_demo && <DemoTag />}
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${cls}`}>{label}</span>
        <div className="ml-auto flex items-center gap-2">
          {o.merchant.status === 'active' && <Link href={`/shop/${o.merchant.slug}`} className="btn-ghost h-10">View storefront</Link>}
          <SignOut />
        </div>
      </div>
      {sp.connected && <p className="mt-4 rounded-xl bg-ok/10 p-3 text-[15px] text-ok">Square is connected. We imported your locations and products. Review them below before going live.</p>}

      <nav className="no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-stone-line" aria-label="Dashboard sections">
        {TABS.map(([k, l]) => <Link key={k} href={`/merchant?tab=${k}`} className={`-mb-px border-b-2 px-4 py-3 text-[15px] font-medium ${tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`} aria-current={tab === k ? 'page' : undefined}>{l}</Link>)}
      </nav>

      {tab === 'overview' && (
        <div className="mt-8 space-y-8">
          {o.merchant.status !== 'active' && (
            <section className="card p-6">
              <h2 className="text-lg font-semibold">Go live checklist</h2>
              <p className="mt-1 text-sm text-charcoal">Customers can only order once every step is done and you activate your storefront.</p>
              <ul className="mt-4 space-y-2">
                {ready.checks.map((c) => (
                  <li key={c.key} className="flex items-center gap-3 text-[15px]">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${c.ok ? 'bg-ok text-white' : 'ring-1 ring-stone-line'}`}>{c.ok && <CheckIcon className="h-3.5 w-3.5" />}</span>
                    <span className={c.ok ? 'text-charcoal' : 'font-medium'}>{c.label}</span>
                  </li>
                ))}
              </ul>
              <LaunchActions termsVersion={MERCHANT_TERMS_VERSION} termsDone={ready.checks.find((c) => c.key === 'terms')!.ok} ready={ready.ready} status={o.merchant.status} />
            </section>
          )}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Today's honeydoo orders" value={String(o.stats.today_orders)} />
            <Tile label="Sales through honeydoo" value={formatMoney(o.stats.sales)} sub="Item sales on paid orders" />
            <Tile label="Completed orders" value={String(o.stats.completed)} />
            <Tile label="Integration health" value={health[0]} valueClass={health[1]} sub={`${integ?.provider === 'demo' ? 'Demo catalog' : 'Square'} · last sync ${ago(integ?.last_sync_at ?? null)}`} />
          </section>
          {integ?.last_error && <p className="rounded-xl bg-honey-soft p-4 text-sm">{integ.last_error}</p>}
          <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="card min-w-0 p-6">
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Recent orders</h2><Link href="/merchant?tab=orders" className="text-sm font-medium text-charcoal hover:text-ink">All orders</Link></div>
              <OrdersList orders={orders.slice(0, 5)} />
            </div>
            <div className="card p-6">
              <h2 className="text-lg font-semibold">Share your storefront</h2>
              <p className="mt-1 text-sm text-charcoal">Put this QR code at your register or link it from your website. Orders from it are credited to your shop.</p>
              <div className="mx-auto mt-4 w-40 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: await QRCode.toString(storeUrl, { type: 'svg', margin: 1, color: { dark: '#0B0B0B', light: '#FFFFFF' } }) }} />
              <p className="mt-3 break-all rounded-lg bg-stone-soft p-2 text-[12px] text-charcoal select-all">{storeUrl}</p>
            </div>
          </section>
        </div>
      )}

      {tab === 'products' && (
        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-charcoal">{o.products.imported} imported · {o.products.published} published · {o.products.hidden} hidden{o.products.removed ? ` · ${o.products.removed} removed in Square` : ''} · last sync {ago(integ?.last_sync_at ?? null)}</p>
            {integ?.provider === 'square' && <div className="ml-auto"><SyncButton /></div>}
          </div>
          <p className="mt-2 text-sm text-muted">Hiding a product only affects honeydoo. Your Square item library is never changed.</p>
          <ProductsTable />
        </div>
      )}

      {tab === 'orders' && <div className="card mt-8 p-6"><OrdersList orders={orders} detailed /></div>}

      {tab === 'settings' && (
        <SettingsForm
          merchant={{ displayName: o.merchant.display_name, description: o.merchant.description, contactEmail: o.merchant.contact_email ?? '', contactPhone: o.merchant.contact_phone ?? '', serviceFeeEnabled: o.merchant.service_fee_enabled, status: o.merchant.status, isDemo: o.merchant.is_demo }}
          locations={o.locations.map((l) => ({ id: l.id, name: l.name, address: l.address, active: l.active, pickupEnabled: l.pickupEnabled, prepMinutes: l.prepMinutes }))}
          integration={integ ? { provider: integ.provider, environment: integ.environment, status: integ.connection_status, authorizedAt: integ.authorized_at ? new Date(integ.authorized_at).toISOString() : null, scopes: integ.granted_scopes ?? [] } : null}
        />
      )}
    </div>
  );
}

function Tile({ label, value, sub, valueClass = '' }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return <div className="card p-5"><p className="text-sm text-muted">{label}</p><p className={`tabular mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>{sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}</div>;
}

function OrdersList({ orders, detailed = false }: { orders: any[]; detailed?: boolean }) {
  if (!orders.length) return <p className="mt-4 text-[15px] text-charcoal">No honeydoo orders yet. When a customer pays, the order appears here and in your Square orders.</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[14px]">
        <thead className="text-[12px] uppercase tracking-wide text-muted"><tr><th className="py-2 font-medium">Order</th><th className="font-medium">Customer</th>{detailed && <th className="font-medium">Items</th>}<th className="font-medium">Payment</th><th className="font-medium">Status</th><th className="text-right font-medium">Total</th></tr></thead>
        <tbody className="divide-y divide-stone-line">
          {orders.map((r) => (
            <tr key={r.id}>
              <td className="py-3 font-medium">{r.public_code}<span className="block text-[12px] font-normal text-muted">{new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></td>
              <td>{r.contact_name ?? 'Guest'}</td>
              {detailed && <td className="max-w-[240px] text-charcoal">{r.items.map((i: any) => `${i.qty} × ${i.name}`).join(', ')}</td>}
              <td className="capitalize">{(r.payment_status ?? 'none').replace('_', ' ')}</td>
              <td>{STATUS_LABEL[r.status as OrderStatus] ?? r.status}</td>
              <td className="tabular text-right">{formatMoney(r.grand_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
