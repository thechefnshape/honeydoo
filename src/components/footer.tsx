import Link from 'next/link';
import { Wordmark } from './brand';

export function Footer() {
  return (
    <footer className="mt-16 hidden border-t border-stone-line bg-stone-soft md:block">
      <div className="page flex flex-wrap items-start justify-between gap-8 py-10 text-sm text-charcoal">
        <div className="max-w-xs">
          <Wordmark className="h-6 w-auto" />
          <p className="mt-3 text-muted">Your city. Everything in it. Order ahead and pick up from the independent shops near you.</p>
        </div>
        <div className="flex gap-12">
          <ul className="space-y-2"><li className="eyebrow mb-1">Shop</li><li><Link href="/shops">All shops</Link></li><li><Link href="/search">Search</Link></li><li><Link href="/orders">Your orders</Link></li></ul>
          <ul className="space-y-2"><li className="eyebrow mb-1">Businesses</li><li><Link href="/merchant/connect">Sell on honeydoo</Link></li><li><Link href="/merchant">Merchant dashboard</Link></li></ul>
          <ul className="space-y-2"><li className="eyebrow mb-1">Company</li><li><Link href="/privacy">Privacy</Link></li><li><Link href="/terms">Terms</Link></li></ul>
        </div>
      </div>
    </footer>
  );
}
