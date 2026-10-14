import Link from 'next/link';
import { cookies } from 'next/headers';
import { HeaderLogo } from './bee-nav';
import { BagButton } from './bag-button';
import { LocationPicker } from './location-picker';
import { listMarkets } from '@/server/catalog';
import { currentCustomer } from '@/server/customer-session';
import { ShopperOnly } from './shopper-only';

export async function Header() {
  const [markets, customer] = await Promise.all([listMarkets(), currentCustomer()]);
  const chosen = (await cookies()).get('hd_market')?.value;
  const current = markets.find((m) => m.slug === chosen) ?? markets[0];
  return (
    <header className="sticky top-0 z-40 border-b border-stone-line/70 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="page flex h-16 items-center gap-3">
        <HeaderLogo />
        <nav className="ml-6 hidden items-center gap-6 text-[15px] font-medium text-charcoal md:flex">
          <Link href="/shops" className="hover:text-ink">Shops</Link>
          <Link href="/search" className="hover:text-ink">Search</Link>
          <Link href="/orders" className="hover:text-ink">Orders</Link>
          <Link href="/merchant/connect" className="hover:text-ink">For businesses</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocationPicker markets={markets} current={current ? { slug: current.slug, label: `${current.name}, ${current.state}` } : null} />
          <ShopperOnly>
          <BagButton />
          {customer ? (
            <Link href="/profile" aria-label="Your account" className="hidden h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold text-honey md:flex">
              {(customer.name || customer.email).trim().charAt(0).toUpperCase()}
            </Link>
          ) : (
            <Link href="/signin" className="hidden h-9 items-center rounded-full px-3 text-[15px] font-medium text-charcoal hover:text-ink md:flex">Sign in</Link>
          )}
          </ShopperOnly>
        </div>
      </div>
    </header>
  );
}
