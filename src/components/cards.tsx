import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import type { MerchantCard as M, ProductCard as P } from '@/server/catalog';
import { ProductImage } from './product-image';
import { QuickAdd } from './add-to-bag';
import { ClockIcon } from './icons';
import { SHOW_DEMO_LABELS } from '@/lib/flags';

export function DemoTag({ className = '' }: { className?: string }) {
  if (!SHOW_DEMO_LABELS) return null;
  return <span className={`inline-flex items-center rounded-full bg-stone px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-charcoal ${className}`} title="Demonstration shop, not a real participating business">Demo</span>;
}

export function MerchantCard({ m }: { m: M }) {
  return (
    <Link href={`/shop/${m.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl">
        <ProductImage src={m.cover} alt={m.name} category={m.category} className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        {m.isDemo && <DemoTag className="absolute left-3 top-3 bg-white/95" />}
      </div>
      <div className="mt-3">
        <h3 className="font-semibold leading-tight">{m.name}</h3>
        <p className="mt-0.5 text-sm text-muted capitalize">{m.category} · {m.neighborhood}</p>
        {m.pickupEnabled && <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[13px] ${m.pickup.openNow ? 'text-ok' : 'text-charcoal'}`}><ClockIcon className="h-3.5 w-3.5" />{m.pickup.label}</p>}
      </div>
    </Link>
  );
}

export function ProductCard({ p, showMerchant = true }: { p: P; showMerchant?: boolean }) {
  return (
    <div className="group flex flex-col">
      <Link href={`/product/${p.id}`} className="relative block overflow-hidden rounded-2xl">
        <ProductImage src={p.image} alt={p.name} category={p.category} className={`aspect-square w-full transition-transform duration-500 group-hover:scale-[1.03] ${p.availability === 'sold_out' ? 'opacity-60' : ''}`} />
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <Link href={`/product/${p.id}`} className="font-semibold leading-snug hover:underline">{p.name}</Link>
        {showMerchant && <Link href={`/shop/${p.merchant.slug}`} className="mt-0.5 text-sm text-muted hover:text-ink">{p.merchant.name}</Link>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <div>
            <p className="tabular font-semibold">{p.multiplePrices ? `From ${formatMoney(p.minPrice)}` : formatMoney(p.minPrice)}</p>
            <p className={`text-[12px] ${p.availability === 'sold_out' ? 'text-muted' : p.availability === 'low_stock' ? 'text-warn' : 'text-ok'}`}>
              {p.availability === 'sold_out' ? 'Sold out' : p.availability === 'low_stock' ? 'Only a few left' : p.pickup.pickupToday ? 'Pickup today' : 'Available'}
            </p>
          </div>
          <QuickAdd product={p} />
        </div>
      </div>
    </div>
  );
}

export function DemoNotice() {
  if (!SHOW_DEMO_LABELS) return null;
  return (
    <div className="border-b border-stone-line bg-honey-soft">
      <p className="page py-2 text-center text-[13px] text-charcoal">
        Preview marketplace. Shops marked <strong>Demo</strong> are fictional examples, not participating businesses. Demo orders are never charged.
      </p>
    </div>
  );
}
