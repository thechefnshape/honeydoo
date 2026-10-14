import { notFound } from 'next/navigation';
import { getMerchant, listProducts } from '@/server/catalog';
import { hoursTable } from '@/lib/hours';
import { DemoTag } from '@/components/cards';
import { ProductImage } from '@/components/product-image';
import { ClockIcon, PhoneIcon, PinIcon } from '@/components/icons';
import { StoreCatalog } from './store-catalog';
import { track } from '@/lib/analytics';
import { maybeSessionId } from '@/lib/session';
import { breadcrumbJsonLd, clip, NOINDEX, ogMeta, storeJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const m = await getMerchant(params.slug);
  if (!m) return { title: 'Shop not found', robots: NOINDEX };
  const description = clip(m.description || `${m.name} in ${m.city}, ${m.state}. Order ahead on honeydoo and pick up in store.`);
  return {
    title: `${m.name}, ${m.city}`, description,
    alternates: { canonical: `/shop/${m.slug}` },
    openGraph: ogMeta({ title: m.name, description, url: `/shop/${m.slug}` }),
    // Demo shops are fictional and must never appear in search as real businesses.
    ...(m.isDemo ? { robots: NOINDEX } : {}),
  };
}

export default async function Storefront(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const m = await getMerchant(params.slug);
  if (!m) notFound();
  const products = await listProducts({ merchantSlug: m.slug });
  await track('merchant_viewed', { sessionId: await maybeSessionId(), merchantId: m.id });
  const hours = hoursTable(m.hours);

  return (
    <div>
      {!m.isDemo && <JsonLd data={[storeJsonLd(m), breadcrumbJsonLd([['Shops', '/shops'], [m.name, `/shop/${m.slug}`]])]} />}
      <div className="page pt-4 sm:pt-6">
        <ProductImage src={m.cover} alt={m.name} category={m.category} eager className="aspect-[16/9] w-full rounded-3xl sm:aspect-[3/1]" />
      </div>
      <div className="page mt-6 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold sm:text-4xl">{m.name}</h1>
            {m.isDemo && <DemoTag />}
          </div>
          <p className="mt-1 text-charcoal capitalize">{m.category} · {m.neighborhood}</p>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-charcoal">{m.description}</p>
          {m.isDemo && <p className="mt-3 max-w-2xl text-sm text-muted">This is a fictional demonstration shop. It is not a real participating business, and orders placed here are not charged or fulfilled.</p>}
          <div className="mt-8"><StoreCatalog products={products} /></div>
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <p className={`flex items-center gap-2 font-medium ${m.pickup.openNow ? 'text-ok' : 'text-ink'}`}><ClockIcon className="h-4 w-4" />{m.pickupEnabled ? m.pickup.label : 'Pickup not available'}</p>
            <p className="mt-3 flex items-start gap-2 text-sm text-charcoal"><PinIcon className="mt-0.5 h-4 w-4 shrink-0" />{m.address}, {m.city}, {m.state} {m.postalCode}</p>
            {m.phone && <p className="mt-2 flex items-center gap-2 text-sm text-charcoal"><PhoneIcon className="h-4 w-4" /><span className="select-all">{m.phone}</span></p>}
            <div className="mt-5 border-t border-stone-line pt-4">
              <p className="eyebrow">Hours</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {hours.map((h) => <div key={h.day} className="contents"><dt className="text-muted">{h.day}</dt><dd className="tabular text-right">{h.text}</dd></div>)}
              </dl>
            </div>
          </div>
          <p className="px-1 text-[13px] text-muted">Prices are set by {m.name}. You pay the same prices as in store. No service fees.</p>
        </aside>
      </div>
    </div>
  );
}
