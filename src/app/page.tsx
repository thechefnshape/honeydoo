import Link from 'next/link';
import { SearchBox } from '@/components/search-box';
import { CategoryRow } from '@/components/category-row';
import { DemoNotice, MerchantCard, ProductCard } from '@/components/cards';
import { ChevronRight } from '@/components/icons';
import { BrandBand } from '@/components/brand-band';
import { HeroTown } from '@/components/hero-town';
import { merchantsFor, productsFor } from '@/server/browse';
import { track } from '@/lib/analytics';
import { maybeSessionId } from '@/lib/session';
import { JsonLd } from '@/components/json-ld';
import { siteJsonLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';


export const metadata = { alternates: { canonical: '/' } };

export default async function Home(props: { searchParams: Promise<{ category?: string }> }) {
  const searchParams = await props.searchParams;
  const category = searchParams.category && searchParams.category !== 'all' ? searchParams.category : undefined;
  const [merchants, products] = await Promise.all([merchantsFor(category), productsFor(category, { featured: !category, limit: 12 })]);
  await track('marketplace_visit', { sessionId: await maybeSessionId(), properties: { category: category ?? 'all' } });
  const demo = merchants.some((m) => m.isDemo);

  return (
    <>
      <JsonLd data={siteJsonLd()} />
      {demo && <DemoNotice />}
      <section className="page relative overflow-hidden pb-40 pt-12 sm:aspect-[2/1] sm:max-h-[640px] sm:pb-0 sm:pt-[7%]">
        <HeroTown />
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <h1 className="text-[44px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[72px]">Anything local.<br />Just ask.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[17px] text-charcoal">Shop the independent businesses around you. Order ahead, pick up today.</p>
          <div className="mx-auto mt-8 max-w-xl"><SearchBox /></div>
        </div>
      </section>

      <section className="page"><CategoryRow active={searchParams.category ?? 'all'} /></section>

      <section className="page mt-10">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Local shops</h2>
          <Link href="/shops" className="inline-flex items-center gap-1 text-sm font-medium text-charcoal hover:text-ink">See all<ChevronRight className="h-4 w-4" /></Link>
        </div>
        {merchants.length ? (
          <div className="no-scrollbar -mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {merchants.slice(0, 8).map((m) => <div key={m.id} className="w-[72vw] shrink-0 snap-start sm:w-auto"><MerchantCard m={m} /></div>)}
          </div>
        ) : <p className="mt-4 text-muted">No shops in this category yet.</p>}
      </section>

      <section className="page mt-14">
        <h2 className="text-2xl font-semibold">{category ? 'Available now' : 'Featured near you'}</h2>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>

      <BrandBand />

      <section className="page mt-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-honey-soft px-6 py-10 text-ink sm:flex-row sm:items-center sm:px-10">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold sm:text-3xl">Own a local shop?</h2>
            <p className="mt-2 text-charcoal">Connect the Square account you already use. Your products sync automatically and paid orders arrive in Square. Free to join. $1 per completed order, and customers pay your regular prices.</p>
          </div>
          <Link href="/merchant/connect" className="btn-dark shrink-0">Sell on honeydoo</Link>
        </div>
      </section>
    </>
  );
}
