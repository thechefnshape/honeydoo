// Client versions of the app's server-rendered pages. Markup mirrors src/app/*.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SearchBox } from '@/components/search-box';
import { CategoryRow } from '@/components/category-row';
import { DemoNotice, DemoTag, MerchantCard, ProductCard } from '@/components/cards';
import { ProductImage } from '@/components/product-image';
import { ProductOptions } from '@/components/add-to-bag';
import { Wordmark, BeeMark } from '@/components/brand';
import { BagButton } from '@/components/bag-button';
import { LocationPicker } from '@/components/location-picker';
import { CheckIcon, ChevronLeft, ChevronRight, ClockIcon, PhoneIcon, PinIcon } from '@/components/icons';
import { StoreCatalog } from '@/app/shop/[slug]/store-catalog';
import { ProductsTable } from '@/app/merchant/products-table';
import { BrandBand } from '@/components/brand-band';
import { HeroTown } from '@/components/hero-town';
import { HeaderLogo } from '@/components/bee-nav';
import { PlacedMoment } from '@/components/placed-moment';
import { formatMoney } from '@/lib/money';
import { hoursTable } from '@/lib/hours';
import { getMerchant, getProduct, listMerchants, listProducts, allMerchants } from './catalog';
import { db, save, resetAll, me, visibleOrders } from './store';
import { AccountPanel } from '@/components/account/account-panel';
import { navigate, useLocation } from './shims/router';
import type { MerchantCard as M, ProductCard as P, ProductDetail } from '../src/server/catalog';

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [v, setV] = useState<T>();
  useEffect(() => { let live = true; fn().then((x) => live && setV(x)); return () => { live = false; }; }, deps); // eslint-disable-line
  return v;
}
const MORE = ['plants', 'books'];
async function merchantsFor(c?: string) {
  if (c === 'more') return (await Promise.all(MORE.map((x) => listMerchants({ category: x })))).flat().filter((m, i, a) => a.findIndex((y) => y.id === m.id) === i);
  return listMerchants({ category: c });
}
async function productsFor(c?: string, featured = false) {
  if (c === 'more') return (await Promise.all(MORE.map((x) => listProducts({ category: x })))).flat();
  return listProducts({ category: c, featured, limit: 12 });
}

export function PreviewBar() {
  return (
    <div className="bg-ink text-white">
      <div className="page flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[12px]">
        <span className="font-semibold text-honey">Interactive preview</span>
        <span className="text-white/75">Runs in your browser with the demo shops. Square, real payments and the AI model are not connected here.</span>
        <button onClick={() => { resetAll(); location.hash = '/'; location.reload(); }} className="ml-auto underline text-white/80 hover:text-white">Reset preview</button>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-line/70 bg-white/90 backdrop-blur">
      <div className="page flex h-16 items-center gap-3">
        <HeaderLogo />
        <nav className="ml-6 hidden items-center gap-6 text-[15px] font-medium text-charcoal md:flex">
          <Link href="/shops" className="hover:text-ink">Shops</Link>
          <Link href="/search" className="hover:text-ink">Search</Link>
          <Link href="/orders" className="hover:text-ink">Orders</Link>
          <Link href="/merchant" className="hover:text-ink">For businesses</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocationPicker markets={[{ slug: 'lakewood-oh', name: 'Lakewood', state: 'OH' }]} current={{ slug: 'lakewood-oh', label: 'Lakewood, OH' }} />
          <BagButton />
          <AccountChip />
        </div>
      </div>
    </header>
  );
}


export function Home() {
  const { search } = useLocation();
  const raw = search.get('category') ?? 'all';
  const category = raw !== 'all' ? raw : undefined;
  const merchants = useLoad(() => merchantsFor(category), [category]);
  const products = useLoad(() => productsFor(category, !category), [category]);
  return (
    <>
      <DemoNotice />
      <section className="page relative overflow-hidden pb-40 pt-12 sm:aspect-[2/1] sm:max-h-[640px] sm:pb-0 sm:pt-[7%]">
        <HeroTown />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h1 className="text-[44px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[72px]">Anything local.<br />Just ask.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-charcoal">Shop the independent businesses around you. Order ahead, pick up today.</p>
          <div className="mx-auto mt-8 max-w-xl"><SearchBox /></div>
        </div>
      </section>
      <section className="page"><CategoryRow active={raw} /></section>
      <section className="page mt-10">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Local shops</h2>
          <Link href="/shops" className="inline-flex items-center gap-1 text-sm font-medium text-charcoal hover:text-ink">See all<ChevronRight className="h-4 w-4" /></Link>
        </div>
        <div className="no-scrollbar -mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {(merchants ?? []).slice(0, 8).map((m) => <div key={m.id} className="w-[72vw] shrink-0 snap-start sm:w-auto"><MerchantCard m={m} /></div>)}
        </div>
      </section>
      <section className="page mt-14">
        <h2 className="text-2xl font-semibold">{category ? 'Available now' : 'Featured near you'}</h2>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">{(products ?? []).map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </section>
      <BrandBand />
      <section className="page mt-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-honey-soft px-6 py-10 text-ink sm:flex-row sm:items-center sm:px-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold sm:text-3xl">Own a local shop?</h2>
            <p className="mt-2 text-charcoal">Connect the Square account you already use. Your products sync automatically and paid orders arrive in Square. Free to join. $1 per completed order, and customers pay your regular prices.</p>
          </div>
          <Link href="/merchant" className="btn-dark shrink-0">Sell on honeydoo</Link>
        </div>
      </section>
    </>
  );
}

export function Shops() {
  const { search } = useLocation();
  const raw = search.get('category') ?? 'all';
  const merchants = useLoad(() => merchantsFor(raw !== 'all' ? raw : undefined), [raw]) ?? [];
  return (
    <>
      <DemoNotice />
      <div className="page pt-10">
        <h1 className="text-3xl font-bold sm:text-4xl">Shops near you</h1>
        <p className="mt-2 text-charcoal">{merchants.length} independent businesses you can order from for pickup.</p>
        <div className="mt-6"><CategoryRow active={raw} base="/shops" /></div>
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">{merchants.map((m) => <MerchantCard key={m.id} m={m} />)}</div>
      </div>
    </>
  );
}

export function Storefront({ slug }: { slug: string }) {
  const m = useLoad(() => getMerchant(slug), [slug]);
  const products = useLoad(() => listProducts({ merchantSlug: slug }), [slug]);
  if (m === null) return <NotFoundPage />;
  if (!m || !products) return <div className="page pt-6"><div className="skeleton aspect-[3/1] rounded-3xl" /></div>;
  return (
    <div>
      <div className="page pt-4 sm:pt-6"><ProductImage src={m.cover} alt={m.name} category={m.category} eager className="aspect-[16/9] w-full rounded-3xl sm:aspect-[3/1]" /></div>
      <div className="page mt-6 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold sm:text-4xl">{m.name}</h1><DemoTag /></div>
          <p className="mt-1 capitalize text-charcoal">{m.category} · {m.neighborhood}</p>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-charcoal">{m.description}</p>
          <div className="mt-8"><StoreCatalog products={products} /></div>
        </div>
        <MerchantAside m={m} />
      </div>
    </div>
  );
}

function MerchantAside({ m }: { m: M }) {
  return (
    <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
      <div className="card p-5">
        <p className={`flex items-center gap-2 font-medium ${m.pickup.openNow ? 'text-ok' : 'text-ink'}`}><ClockIcon className="h-4 w-4" />{m.pickup.label}</p>
        <p className="mt-3 flex items-start gap-2 text-sm text-charcoal"><PinIcon className="mt-0.5 h-4 w-4 shrink-0" />{m.address}, {m.city}, {m.state} {m.postalCode}</p>
        {m.phone && <p className="mt-2 flex items-center gap-2 text-sm text-charcoal"><PhoneIcon className="h-4 w-4" /><span className="select-all">{m.phone}</span></p>}
        <div className="mt-5 border-t border-stone-line pt-4">
          <p className="eyebrow">Hours</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">{hoursTable(m.hours).map((h) => <div key={h.day} className="contents"><dt className="text-muted">{h.day}</dt><dd className="tabular text-right">{h.text}</dd></div>)}</dl>
        </div>
      </div>
      <p className="px-1 text-[13px] text-muted">Prices are set by {m.name}. You pay the same prices as in store. No service fees.</p>
    </aside>
  );
}

export function ProductPage({ id }: { id: string }) {
  const p = useLoad<ProductDetail | null>(() => getProduct(id), [id]);
  if (p === null) return <NotFoundPage />;
  if (!p) return <div className="page pt-6"><div className="skeleton aspect-square max-w-lg rounded-3xl" /></div>;
  return (
    <div className="page pt-6">
      <Link href={`/shop/${p.merchant.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-charcoal hover:text-ink"><ChevronLeft className="h-4 w-4" />{p.merchant.name}</Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-12">
        <ProductImage src={p.image} alt={p.name} category={p.category} eager className="aspect-square w-full rounded-3xl" />
        <div>
          <div className="flex items-center gap-2"><Link href={`/shop/${p.merchant.slug}`} className="text-sm text-muted hover:text-ink">{p.merchant.name}</Link><DemoTag /></div>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{p.name}</h1>
          <p className="tabular mt-2 text-xl font-semibold">{p.multiplePrices ? `${formatMoney(p.minPrice)} to ${formatMoney(p.maxPrice)}` : formatMoney(p.minPrice)}</p>
          <p className="mt-4 text-[16px] leading-relaxed text-charcoal">{p.description}</p>
          <div className="-mx-5 sm:-mx-6"><ProductOptions key={p.id} product={p} showImage={false} /></div>
        </div>
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = { payment_not_configured: 'Order received', awaiting_payment: 'Waiting for payment', paid: 'Paid, sent to shop' };

function AccountChip() {
  useLocation();
  const a = me();
  return a
    ? <Link href="/profile" aria-label="Your account" className="hidden h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-honey md:flex">{(a.name || a.email).trim().charAt(0).toUpperCase()}</Link>
    : <Link href="/signin" className="hidden h-9 items-center rounded-full px-3 text-[15px] font-medium text-charcoal hover:text-ink md:flex">Sign in</Link>;
}

export function ProfilePage() {
  useLocation();
  const c = me();
  const rows = [['/orders', 'Your orders'], ['/shops', 'Browse shops'], ['/merchant', 'Sell on honeydoo'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];
  return (
    <div className="page max-w-2xl pt-8">
      {c ? (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-xl font-semibold text-honey">{(c.name || c.email).trim().charAt(0).toUpperCase()}</div>
            <div className="min-w-0"><h1 className="truncate text-2xl font-bold">{c.name || 'Your account'}</h1><p className="truncate text-sm text-muted">{c.email}</p></div>
          </div>
          <AccountPanel key={c.id} customer={{ name: c.name, email: c.email, phone: c.phone }} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-soft"><BeeMark className="h-8 w-auto" /></div>
            <div><h1 className="text-2xl font-bold">Shopping as a guest</h1><p className="text-sm text-muted">Your bag and orders are saved in this browser.</p></div>
          </div>
          <div className="mt-6 rounded-2xl bg-stone-soft p-5">
            <p className="font-semibold">Create an account</p>
            <p className="mt-1 text-[15px] text-charcoal">See your orders and bag on every device, and check out faster. Orders you placed here as a guest move into your account.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-dark h-11">Create account</Link>
              <Link href="/signin" className="btn-ghost h-11 bg-white">Sign in</Link>
            </div>
          </div>
        </>
      )}
      <ul className="mt-6 divide-y divide-stone-line rounded-2xl ring-1 ring-stone-line">
        {rows.map(([href, label]) => <li key={href}><Link href={href} className="flex items-center justify-between px-5 py-4 hover:bg-stone-soft">{label}<ChevronRight className="h-4 w-4 text-muted" /></Link></li>)}
      </ul>
    </div>
  );
}

export function Orders() {
  useLocation();
  const orders = visibleOrders();
  const signedIn = !!me();
  const name = (id: string) => allMerchants().find((m) => m.id === id)?.name ?? 'Shop';
  return (
    <div className="page max-w-3xl pt-8">
      <h1 className="text-3xl font-bold">Orders</h1>
      {signedIn
        ? <p className="mt-1 text-sm text-muted">Every order on your account, from any device.</p>
        : <p className="mt-1 text-sm text-muted">Orders placed in this browser. <Link href="/signin?next=/orders" className="text-ink underline">Sign in</Link> or <Link href="/signup?next=/orders" className="text-ink underline">create an account</Link> to see them on every device.</p>}
      {orders.length ? (
        <ul className="mt-6 divide-y divide-stone-line rounded-2xl ring-1 ring-stone-line">
          {orders.map((o) => (
            <li key={o.id}><Link href={`/orders/${o.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-stone-soft">
              <div className="min-w-0 flex-1"><p className="flex items-center gap-2 font-medium">{name(o.merchantId)}<DemoTag /></p>
                <p className="text-sm text-muted">{new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {((n) => `${n} ${n === 1 ? 'item' : 'items'}`)(o.items.reduce((n, i) => n + i.quantity, 0))} · {o.code}</p></div>
              <div className="text-right"><p className="tabular font-medium">{formatMoney(o.grandTotal)}</p><p className="text-[13px] text-charcoal">{LABEL[o.status] ?? o.status}</p></div>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link></li>
          ))}
        </ul>
      ) : <div className="mt-10 text-center"><p className="text-charcoal">No orders yet.</p><Link href="/" className="btn-dark mt-4">Find something local</Link></div>}
    </div>
  );
}

export function OrderPage({ id }: { id: string }) {
  const placed = useLocation().search.get('placed');
  const o = visibleOrders().find((x) => x.id === id);
  if (!o) return <NotFoundPage />;
  const m = allMerchants().find((x) => x.id === o.merchantId)!;
  return (
    <div className="page max-w-2xl pt-8">
      {placed && <PlacedMoment title="Order placed" detail={`${m.name} · ${o.pickupEstimate}`} />}
      <p className="eyebrow">Order {o.code}</p>
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-bold">{LABEL[o.status]}<DemoTag /></h1>
      <p className="mt-1 text-charcoal">From <Link href={`/shop/${m.slug}`} className="underline">{m.name}</Link>, {m.address}, Lakewood, OH</p>
      <div className="mt-6 rounded-2xl bg-stone-soft p-5">
        <p className="font-semibold">{o.pickupEstimate}</p>
        <p className="mt-1 text-[15px] text-charcoal">We sent your order to {m.name}. Show order {o.code} at the counter.</p>
      </div>
      <section className="card mt-8 p-5">
        <ul className="space-y-2">{o.items.map((i, n) => (
          <li key={n} className="flex justify-between gap-4 text-[15px]"><span><span className="tabular">{i.quantity}</span> × {i.name}<span className="block text-sm text-muted">{[i.variation, ...i.modifiers.map((x) => x.name)].join(' · ')}</span></span><span className="tabular">{formatMoney(i.lineTotal)}</span></li>
        ))}</ul>
        <dl className="mt-4 space-y-1.5 border-t border-stone-line pt-4 text-[15px]">
          <div className="flex justify-between"><dt>Items</dt><dd className="tabular">{formatMoney(o.merchandiseSubtotal)}</dd></div>
          <div className="flex justify-between"><dt>Sales tax</dt><dd className="tabular">{formatMoney(o.taxTotal)}</dd></div>
          <div className="flex justify-between border-t border-stone-line pt-3 font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(o.grandTotal)}</dd></div>
        </dl>
      </section>
      <p className="mt-4 text-sm text-muted">{o.pickupEstimate}. Questions? Call the shop at {m.phone}.</p>
      {!me() && (
        <div className="mt-8 flex flex-col gap-3 rounded-2xl bg-stone-soft p-5 sm:flex-row sm:items-center">
          <div className="flex-1"><p className="font-semibold">Keep this order with you</p><p className="mt-0.5 text-[15px] text-charcoal">Create an account to see this order and future ones on any device.</p></div>
          <Link href={`/signup?next=/orders/${o.id}`} className="btn-dark h-11 shrink-0">Create account</Link>
        </div>
      )}
    </div>
  );
}

export function MerchantPage() {
  const { search } = useLocation();
  const slug = db().merchantSession;
  const tab = search.get('tab') ?? 'overview';
  const [pick, setPick] = useState(allMerchants()[0].slug);
  if (!slug) {
    return (
      <div className="page max-w-3xl pt-10">
        <BeeMark className="h-12 w-auto" />
        <h1 className="mt-6 text-4xl font-bold">Connect your Square account</h1>
        <p className="mt-3 text-lg text-charcoal">Keep running your shop the way you do today. Honeydoo syncs your products from Square, sends paid pickup orders back to Square, and helps neighbors find you.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">{['Free to join', '$1 per completed order, paid by the shop', 'No tablet, no second menu'].map((t) => <li key={t} className="flex items-start gap-2 rounded-2xl bg-stone-soft p-4 text-[15px] font-medium"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />{t}</li>)}</ul>
        <p className="mt-8 text-[15px] font-medium">Already on honeydoo? Open your dashboard.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="demo-shop" className="sr-only">Your shop</label>
          <select id="demo-shop" value={pick} onChange={(e) => setPick(e.target.value)} className="field sm:max-w-xs">{allMerchants().map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}</select>
          <button onClick={() => { db().merchantSession = pick; save(); navigate('/merchant'); }} className="btn-dark h-12">Open dashboard</button>
        </div>
      </div>
    );
  }
  const m = allMerchants().find((x) => x.slug === slug)!;
  const orders = db().orders.filter((o) => o.merchantId === m.id);
  const hidden = m.products.filter((p) => db().hidden.includes(p.id)).length;
  const TABS = [['overview', 'Overview'], ['products', 'Products'], ['orders', 'Orders']] as const;
  return (
    <div className="page pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold">{m.name}</h1><DemoTag />
        <span className="rounded-full bg-ok/10 px-3 py-1 text-[13px] font-semibold text-ok">Live on honeydoo</span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/shop/${m.slug}`} className="btn-ghost h-10">View storefront</Link>
          <button onClick={() => { db().merchantSession = null; save(); navigate('/merchant'); }} className="btn-ghost h-10">Sign out</button>
        </div>
      </div>
      <nav className="no-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-stone-line">
        {TABS.map(([k, l]) => <Link key={k} href={`/merchant?tab=${k}`} className={`-mb-px border-b-2 px-4 py-3 text-[15px] font-medium ${tab === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{l}</Link>)}
      </nav>
      {tab === 'overview' && (
        <div className="mt-8 space-y-8">
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Today's honeydoo orders" value={String(orders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString()).length)} sub="Pickup orders" />
            <Tile label="Sales through honeydoo" value={formatMoney(orders.reduce((n, o) => n + o.merchandiseSubtotal, 0))} sub="Item sales" />
            <Tile label="Products" value={`${m.products.length - hidden} of ${m.products.length}`} sub="Shown on honeydoo" />
            <Tile label="Integration health" value="Healthy" valueClass="text-ok" sub="Square · synced just now" />
          </section>
          <section className="card p-6"><h2 className="text-lg font-semibold">Recent orders</h2><OrdersTable orders={orders.slice(0, 5)} /></section>
        </div>
      )}
      {tab === 'products' && (<div className="mt-8"><p className="text-sm text-muted">Hiding a product only affects honeydoo. Your Square item library is never changed. Try hiding one, then search for it.</p><ProductsTable /></div>)}
      {tab === 'orders' && <div className="card mt-8 p-6"><OrdersTable orders={orders} /></div>}
    </div>
  );
}

function Tile({ label, value, sub, valueClass = '' }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return <div className="card p-5"><p className="text-sm text-muted">{label}</p><p className={`tabular mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>{sub && <p className="mt-1 text-[12px] text-muted">{sub}</p>}</div>;
}
function OrdersTable({ orders }: { orders: ReturnType<typeof db>['orders'] }) {
  if (!orders.length) return <p className="mt-4 text-[15px] text-charcoal">No honeydoo orders yet. When a customer orders, it appears here and in your Square orders.</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[14px]">
        <thead className="text-[12px] uppercase tracking-wide text-muted"><tr><th className="py-2 font-medium">Order</th><th className="font-medium">Customer</th><th className="font-medium">Items</th><th className="font-medium">Status</th><th className="text-right font-medium">Total</th></tr></thead>
        <tbody className="divide-y divide-stone-line">{orders.map((o) => (
          <tr key={o.id}><td className="py-3 font-medium">{o.code}</td><td>{o.contactName}</td><td className="text-charcoal">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</td><td>{LABEL[o.status]}</td><td className="tabular text-right">{formatMoney(o.grandTotal)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="page flex flex-col items-center pt-24 text-center">
      <BeeMark className="h-14 w-auto" />
      <h1 className="mt-6 text-2xl font-semibold">We could not find that</h1>
      <p className="mt-2 text-charcoal">The page may have moved, or the item is no longer listed.</p>
      <Link href="/" className="btn-dark mt-6">Back to honeydoo</Link>
    </div>
  );
}
export type { P };
