import { ogMeta } from '@/lib/seo';
import { CategoryRow } from '@/components/category-row';
import { DemoNotice, MerchantCard } from '@/components/cards';
import { merchantsFor } from '@/server/browse';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Local shops',
  description: 'Independent shops near you on honeydoo: coffee, bakeries, flowers, groceries, gifts and more. Order ahead and pick up in store.',
  alternates: { canonical: '/shops' },
  openGraph: ogMeta({ title: 'Local shops on honeydoo', description: 'Independent shops near you on honeydoo: coffee, bakeries, flowers, groceries, gifts and more. Order ahead and pick up in store.', url: '/shops' }),
};

export default async function Shops(props: { searchParams: Promise<{ category?: string }> }) {
  const searchParams = await props.searchParams;
  const c = searchParams.category && searchParams.category !== 'all' ? searchParams.category : undefined;
  const merchants = await merchantsFor(c);
  return (
    <>
      {merchants.some((m) => m.isDemo) && <DemoNotice />}
      <div className="page pt-10">
        <h1 className="text-3xl font-bold sm:text-4xl">Shops near you</h1>
        <p className="mt-2 text-charcoal">{merchants.length} independent {merchants.length === 1 ? 'business' : 'businesses'} you can order from for pickup.</p>
        <div className="mt-6"><CategoryRow active={searchParams.category ?? 'all'} base="/shops" /></div>
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {merchants.map((m) => <MerchantCard key={m.id} m={m} />)}
        </div>
      </div>
    </>
  );
}
