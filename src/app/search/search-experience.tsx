'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { ProductCard as P } from '@/server/catalog';
import type { AssistantResult } from '@/server/ai/assistant';
import { formatMoney } from '@/lib/money';
import { SearchBox } from '@/components/search-box';
import { BeeMark } from '@/components/brand';
import { ProductCard } from '@/components/cards';
import { ProductImage } from '@/components/product-image';
import { QuickAdd } from '@/components/add-to-bag';

const CATS = [['', 'Any category'], ['food', 'Food'], ['coffee', 'Coffee'], ['flowers', 'Flowers'], ['groceries', 'Groceries'], ['gifts', 'Gifts'], ['home', 'Home'], ['plants', 'Plants'], ['books', 'Books']];
const PRICES = [['', 'Any price'], ['1000', 'Under $10'], ['2000', 'Under $20'], ['4000', 'Under $40'], ['7500', 'Under $75']];

/** Natural-language requests go to the assistant; short keyword searches go straight to the catalog. */
export function looksNatural(q: string) {
  const t = q.toLowerCase();
  return t.split(/\s+/).length >= 4 || /\?|\$|\b(under|need|want|find|looking|for a|for my|gift|today|recommend|something|where|show me|help)\b/.test(t);
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? 'Search is unavailable right now. Please try again.');
  return j.data;
}

export function SearchExperience() {
  const sp = useSearchParams();
  const router = useRouter();
  const q = sp.get('q') ?? '';
  const [mode, setMode] = useState<'ask' | 'keyword'>(q && looksNatural(q) ? 'ask' : 'keyword');
  const [category, setCategory] = useState(sp.get('category') ?? '');
  const [maxPrice, setMaxPrice] = useState('');
  const [today, setToday] = useState(false);
  const [ai, setAi] = useState<AssistantResult | null>(null);
  const [results, setResults] = useState<P[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMode(q && looksNatural(q) ? 'ask' : 'keyword'); }, [q]);

  useEffect(() => {
    let live = true;
    setError(null); setLoading(true);
    const run = mode === 'ask' && q
      ? post<AssistantResult>('/api/v1/ai/search', { message: q }).then((r) => { if (live) { setAi(r); setResults(null); } })
      : post<P[]>('/api/v1/search', { query: q, category: category || undefined, maxPriceMinor: maxPrice ? Number(maxPrice) : undefined, pickupToday: today || undefined })
          .then((r) => { if (live) { setResults(r); setAi(null); } });
    run.catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [q, mode, category, maxPrice, today]);

  return (
    <div className="page pt-6 sm:pt-10">
      <div className="mx-auto max-w-3xl">
        <SearchBox key={q} initial={q} size="md" autoFocus={!q} onSubmit={(v) => router.push(`/search?q=${encodeURIComponent(v)}`)} />
        {q && (
          <div className="mt-4 flex gap-1 rounded-full bg-stone-soft p-1 text-sm font-medium w-fit" role="tablist" aria-label="Search mode">
            <button role="tab" aria-selected={mode === 'ask'} onClick={() => setMode('ask')} className={`rounded-full px-4 py-2 ${mode === 'ask' ? 'bg-white shadow-sm' : 'text-charcoal'}`}>Ask honeydoo</button>
            <button role="tab" aria-selected={mode === 'keyword'} onClick={() => setMode('keyword')} className={`rounded-full px-4 py-2 ${mode === 'keyword' ? 'bg-white shadow-sm' : 'text-charcoal'}`}>All results</button>
          </div>
        )}
      </div>

      {mode === 'ask' && q ? (
        <section className="mx-auto mt-8 max-w-3xl" aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="flex items-center gap-4 py-10">
              <BeeMark thinking className="h-12 w-auto" label="Honeydoo is thinking" />
              <div><p className="font-medium">Looking through local shops</p><p className="text-sm text-muted">Checking prices and what is available for pickup.</p></div>
            </div>
          ) : error ? <ErrorState message={error} /> : ai && (
            <div>
              <div className="flex items-start gap-3">
                <BeeMark className="mt-0.5 h-7 w-auto shrink-0" />
                <div>
                  <p className="text-[17px] leading-relaxed">{ai.message}</p>
                  {ai.clarifyingQuestion && <p className="mt-1 text-charcoal">{ai.clarifyingQuestion}</p>}
                  <p className="mt-1 text-[12px] text-muted">{ai.mode === 'ai' ? 'Picked by honeydoo from live shop listings.' : 'Matched from live shop listings.'} Prices and availability are confirmed at checkout.</p>
                </div>
              </div>
              <ul className="mt-6 space-y-3">
                {ai.recommendations.map(({ product: p, reason }) => (
                  <li key={p.id} className="card flex gap-4 p-3 sm:p-4">
                    <Link href={`/product/${p.id}`} className="shrink-0"><ProductImage src={p.image} alt={p.name} category={p.category} className="h-24 w-24 rounded-xl sm:h-28 sm:w-28" /></Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/product/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                      <Link href={`/shop/${p.merchant.slug}`} className="text-sm text-muted hover:text-ink">{p.merchant.name}{p.merchant.neighborhood ? `, ${p.merchant.neighborhood}` : ''}</Link>
                      <p className="mt-1.5 text-sm text-charcoal">{reason}</p>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <span className="tabular font-semibold">{p.multiplePrices ? `From ${formatMoney(p.minPrice)}` : formatMoney(p.minPrice)}<span className="ml-2 text-[12px] font-normal text-ok">{p.pickup.pickupToday ? 'Pickup today' : p.pickup.label}</span></span>
                        <QuickAdd product={p} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {!ai.recommendations.length && <p className="mt-6 text-charcoal">Try <button className="underline" onClick={() => setMode('keyword')}>all results</button> or browse <Link className="underline" href="/shops">shops</Link>.</p>}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-8">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="f-cat">Category</label>
            <select id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="chip appearance-none pr-8">{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <label className="sr-only" htmlFor="f-price">Price</label>
            <select id="f-price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="chip appearance-none pr-8">{PRICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button onClick={() => setToday((t) => !t)} aria-pressed={today} className={`chip ${today ? 'chip-active' : ''}`}>Pickup today</button>
            {results && <span className="ml-auto text-sm text-muted">{results.length} {results.length === 1 ? 'result' : 'results'}</span>}
          </div>
          {error ? <ErrorState message={error} /> : loading && !results ? (
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton aspect-square rounded-2xl" />)}</div>
          ) : (
            <div className={`mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
              {results?.map((p) => <ProductCard key={p.id} p={p} />)}
              {results && !results.length && <p className="col-span-full py-10 text-center text-muted">No matches. Try a different word or remove a filter.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <p role="alert" className="mt-8 rounded-xl bg-stone-soft p-4 text-charcoal">{message}</p>;
}
