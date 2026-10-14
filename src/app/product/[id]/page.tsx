import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMerchant, getProduct } from '@/server/catalog';
import { breadcrumbJsonLd, clip, NOINDEX, ogMeta, productJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/json-ld';
import { ProductImage } from '@/components/product-image';
import { ProductOptions } from '@/components/add-to-bag';
import { DemoTag } from '@/components/cards';
import { ChevronLeft } from '@/components/icons';
import { formatMoney } from '@/lib/money';
import { track } from '@/lib/analytics';
import { maybeSessionId } from '@/lib/session';

export const dynamic = 'force-dynamic';
export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const p = await getProduct((await props.params).id);
  if (!p) return { title: 'Product not found', robots: NOINDEX };
  const price = p.multiplePrices ? `${formatMoney(p.minPrice)} to ${formatMoney(p.maxPrice)}` : formatMoney(p.minPrice);
  const description = clip(`${price} at ${p.merchant.name}. ${p.description || ''} Order ahead and pick up in store.`);
  return {
    title: `${p.name} at ${p.merchant.name}`, description,
    alternates: { canonical: `/product/${p.id}` },
    openGraph: ogMeta({ title: `${p.name} at ${p.merchant.name}`, description, url: `/product/${p.id}` }),
    ...(p.merchant.isDemo ? { robots: NOINDEX } : {}),
  };
}

export default async function ProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const p = await getProduct(params.id);
  if (!p) notFound();
  await track('product_viewed', { sessionId: await maybeSessionId(), productId: p.id, merchantId: p.merchant.id });
  const shop = p.merchant.isDemo ? null : await getMerchant(p.merchant.slug);
  return (
    <div className="page pt-6">
      {shop && <JsonLd data={[productJsonLd(p, shop), breadcrumbJsonLd([['Shops', '/shops'], [shop.name, `/shop/${shop.slug}`], [p.name, `/product/${p.id}`]])]} />}
      <Link href={`/shop/${p.merchant.slug}`} className="inline-flex items-center gap-1 text-sm font-medium text-charcoal hover:text-ink"><ChevronLeft className="h-4 w-4" />{p.merchant.name}</Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-12">
        <ProductImage src={p.image} alt={p.name} category={p.category} eager className="aspect-square w-full rounded-3xl" />
        <div>
          <div className="flex items-center gap-2"><Link href={`/shop/${p.merchant.slug}`} className="text-sm text-muted hover:text-ink">{p.merchant.name}</Link>{p.merchant.isDemo && <DemoTag />}</div>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{p.name}</h1>
          <p className="tabular mt-2 text-xl font-semibold">{p.multiplePrices ? `${formatMoney(p.minPrice)} to ${formatMoney(p.maxPrice)}` : formatMoney(p.minPrice)}</p>
          <p className="mt-4 text-[16px] leading-relaxed text-charcoal">{p.description}</p>
          <div className="-mx-5 sm:-mx-6"><ProductOptions product={p} showImage={false} /></div>
        </div>
      </div>
    </div>
  );
}
