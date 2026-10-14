'use client';
import { useMemo, useState } from 'react';
import type { ProductCard as P } from '@/server/catalog';
import { formatMoney } from '@/lib/money';
import { ProductImage } from '@/components/product-image';
import { QuickAdd } from '@/components/add-to-bag';
import { SearchIcon } from '@/components/icons';
import Link from 'next/link';

const LABEL: Record<string, string> = { food: 'Food', coffee: 'Coffee', flowers: 'Flowers', groceries: 'Groceries', gifts: 'Gifts', home: 'Home', plants: 'Plants', books: 'Books' };

export function StoreCatalog({ products }: { products: P[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const cats = useMemo(() => [...new Set(products.map((p) => p.category ?? 'other'))], [products]);
  const shown = products.filter((p) => (cat === 'all' || p.category === cat) && (!q || `${p.name} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
          <label htmlFor="store-q" className="sr-only">Search this shop</label>
          <input id="store-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this shop" className="field pl-11" />
        </div>
        {cats.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {['all', ...cats].map((c) => <button key={c} onClick={() => setCat(c)} className={`chip ${cat === c ? 'chip-active' : ''}`}>{c === 'all' ? 'All' : LABEL[c] ?? c}</button>)}
          </div>
        )}
      </div>
      <ul className="mt-6 divide-y divide-stone-line">
        {shown.map((p) => (
          <li key={p.id} className="flex gap-4 py-4">
            <Link href={`/product/${p.id}`} className="shrink-0"><ProductImage src={p.image} alt={p.name} category={p.category} className={`h-24 w-24 rounded-xl sm:h-28 sm:w-28 ${p.availability === 'sold_out' ? 'opacity-60' : ''}`} /></Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={`/product/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
              <p className="mt-0.5 line-clamp-2 text-sm text-charcoal">{p.description}</p>
              <p className="mt-1 text-[13px] text-muted">{p.variations.length > 1 ? p.variations.map((v) => `${v.name} ${formatMoney(v.price)}`).join(' · ') : ''}</p>
              <div className="mt-auto flex items-center justify-between pt-2">
                <span className="tabular font-semibold">{p.multiplePrices ? `From ${formatMoney(p.minPrice)}` : formatMoney(p.minPrice)}
                  {p.availability === 'low_stock' && <span className="ml-2 text-[13px] font-normal text-warn">Only a few left</span>}
                </span>
                <QuickAdd product={p} />
              </div>
            </div>
          </li>
        ))}
        {!shown.length && <li className="py-10 text-center text-muted">Nothing here matches. Try another word.</li>}
      </ul>
    </div>
  );
}
