'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/lib/money';
import { ProductImage } from '@/components/product-image';

type Row = { id: string; name: string; publication_status: string; visible: boolean; min_price: number | null; variations: number; availability: string | null; primary_image_url: string | null };
const FILTERS = [['all', 'All'], ['published', 'Published'], ['hidden', 'Hidden'], ['removed', 'Removed in Square']] as const;
const SOURCE: Record<string, string> = { published: 'Active', hidden: 'Hidden by rule', archived: 'Archived in Square', deleted_at_source: 'Deleted in Square', draft: 'Draft' };

export function ProductsTable() {
  const [status, setStatus] = useState<string>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/merchant/products?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const j = await r.json(); if (r.ok) setRows(j.data); else setErr(j.error?.message);
  }, [status, q]);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  async function toggle(row: Row) {
    setRows((rs) => rs?.map((x) => (x.id === row.id ? { ...x, visible: !row.visible } : x)) ?? null);
    const r = await fetch(`/api/v1/merchant/products/${row.id}/visibility`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visible: !row.visible }) });
    if (!r.ok) { setErr('Could not update visibility.'); load(); }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={`chip ${status === k ? 'chip-active' : ''}`}>{l}</button>)}</div>
        <label htmlFor="pq" className="sr-only">Search products</label>
        <input id="pq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="field h-10 sm:ml-auto sm:max-w-xs" />
      </div>
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      <ul className="mt-4 divide-y divide-stone-line rounded-2xl ring-1 ring-stone-line">
        {rows === null && <li className="p-5"><div className="skeleton h-10 rounded" /></li>}
        {rows?.map((r) => {
          const removable = ['archived', 'deleted_at_source'].includes(r.publication_status);
          const shown = r.visible && r.publication_status === 'published';
          return (
            <li key={r.id} className="flex items-center gap-4 px-4 py-3">
              <ProductImage src={r.primary_image_url} alt={r.name} className="h-12 w-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-[13px] text-muted">{r.min_price !== null ? formatMoney(r.min_price) : 'No price'} · {r.variations} {r.variations === 1 ? 'option' : 'options'} · {SOURCE[r.publication_status] ?? r.publication_status}{r.availability?.includes('out_of_stock') ? ' · some sold out' : ''}</p>
              </div>
              {removable ? <span className="text-[13px] text-muted">Not orderable</span> : (
                <button role="switch" aria-checked={shown} aria-label={`Show ${r.name} on honeydoo`} onClick={() => toggle(r)} disabled={r.publication_status !== 'published'}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${shown ? 'bg-ink' : 'bg-stone'}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${shown ? 'left-6' : 'left-1'}`} />
                </button>
              )}
            </li>
          );
        })}
        {rows && !rows.length && <li className="p-6 text-center text-charcoal">No products here.</li>}
      </ul>
    </div>
  );
}
