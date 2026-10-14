'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/money';
import type { ProductCard, ProductDetail } from '@/server/catalog';
import { useCart, api } from './cart-context';
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon } from './icons';
import { ProductImage } from './product-image';

/** Quick add: adds directly when there is one option, otherwise opens the options sheet. */
export function QuickAdd({ product, compact = false }: { product: ProductCard; compact?: boolean }) {
  const { add } = useCart();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const sellable = product.variations.filter((v) => v.sellable);
  if (product.availability === 'sold_out') return <span className="inline-flex h-9 items-center rounded-full bg-stone px-3 text-[13px] font-medium text-muted">Sold out</span>;

  async function quick() {
    if (sellable.length === 1) {
      // Fetch detail once to know whether options are required.
      const d = await api<ProductDetail>(`/api/v1/products/${product.id}`);
      if (d.modifierLists.some((l) => l.min > 0) || d.modifierLists.length) { setOpen(true); return; }
      setBusy(true);
      const ok = await add(sellable[0].id, 1, []);
      setBusy(false);
      if (ok) { setDone(true); setTimeout(() => setDone(false), 1500); }
    } else setOpen(true);
  }
  return (
    <>
      <button onClick={quick} disabled={busy} className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-ink font-semibold text-white hover:bg-charcoal disabled:opacity-60 ${compact ? 'h-9 w-9' : 'h-9 px-3.5 text-[13px]'}`} aria-label={`Add ${product.name} to bag`}>
        {done ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}{!compact && (done ? 'Added' : 'Add')}
      </button>
      {open && <OptionsSheet productId={product.id} onClose={() => setOpen(false)} />}
    </>
  );
}

export function OptionsSheet({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [p, setP] = useState<ProductDetail | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); api<ProductDetail>(`/api/v1/products/${productId}`).then(setP).catch(() => onClose()); }, [productId, onClose]);
  return (
    <dialog ref={ref} onClose={onClose} className="m-0 mt-auto w-full max-w-none rounded-t-3xl p-0 backdrop:bg-ink/40 sm:m-auto sm:w-[min(92vw,520px)] sm:rounded-3xl">
      <div className="relative max-h-[86vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 shadow-sm" aria-label="Close"><CloseIcon /></button>
        {p ? <ProductOptions product={p} onAdded={onClose} /> : <div className="h-72 skeleton" />}
      </div>
    </dialog>
  );
}

export function ProductOptions({ product, onAdded, showImage = true }: { product: ProductDetail; onAdded?: () => void; showImage?: boolean }) {
  const { add } = useCart();
  const sellable = product.variations.filter((v) => v.sellable);
  const [variationId, setVariationId] = useState(sellable[0]?.id ?? '');
  const [mods, setMods] = useState<string[]>(() => product.modifierLists.flatMap((l) => l.options.filter((o) => o.isDefault).map((o) => o.id)));
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = product.variations.find((x) => x.id === variationId);
  const unit = useMemo(() => (v?.price ?? 0) + product.modifierLists.flatMap((l) => l.options).filter((o) => mods.includes(o.id)).reduce((s, o) => s + o.price, 0), [v, mods, product]);
  const maxQty = Math.min(50, v?.quantity ?? 50);

  function toggle(listId: string, optId: string) {
    const list = product.modifierLists.find((l) => l.id === listId)!;
    const inList = new Set(list.options.map((o) => o.id));
    setMods((cur) => {
      if (list.selection === 'single' || list.max === 1) return [...cur.filter((id) => !inList.has(id)), ...(cur.includes(optId) && list.min === 0 ? [] : [optId])];
      if (cur.includes(optId)) return cur.filter((id) => id !== optId);
      const count = cur.filter((id) => inList.has(id)).length;
      return list.max !== null && count >= list.max ? cur : [...cur, optId];
    });
  }
  const missing = product.modifierLists.find((l) => mods.filter((id) => l.options.some((o) => o.id === id)).length < l.min);

  async function submit() {
    if (!v) return;
    if (missing) { setErr(`Choose ${missing.name.toLowerCase()}.`); return; }
    setBusy(true); setErr(null);
    const ok = await add(v.id, qty, mods);
    setBusy(false);
    if (ok) onAdded?.();
  }

  return (
    <div>
      {showImage && <ProductImage src={product.image} alt={product.name} category={product.category} className="aspect-[16/10] w-full" />}
      <div className="space-y-6 p-5 sm:p-6">
        {showImage && (
          <div>
            <p className="text-sm text-muted">{product.merchant.name}</p>
            <h2 className="mt-0.5 text-2xl font-semibold">{product.name}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-charcoal">{product.description}</p>
          </div>
        )}
        {product.variations.length > 1 && (
          <fieldset>
            <legend className="label mb-2">Choose an option</legend>
            <div className="grid gap-2">
              {product.variations.map((x) => (
                <label key={x.id} className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 ring-1 ${variationId === x.id ? 'ring-2 ring-ink' : 'ring-stone-line'} ${!x.sellable ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="variation" className="accent-ink" checked={variationId === x.id} disabled={!x.sellable} onChange={() => { setVariationId(x.id); setQty(1); }} />
                    <span className="font-medium">{x.name}</span>
                    {!x.sellable && <span className="text-sm text-muted">Sold out</span>}
                    {x.availability === 'low_stock' && <span className="text-sm text-warn">{x.quantity ? `Only ${x.quantity} left` : 'Only a few left'}</span>}
                  </span>
                  <span className="tabular">{formatMoney(x.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {product.modifierLists.map((l) => (
          <fieldset key={l.id}>
            <legend className="label mb-2">{l.name} <span className="font-normal text-muted">{l.min > 0 ? 'Required' : l.max ? `Optional, up to ${l.max}` : 'Optional'}</span></legend>
            <div className="flex flex-wrap gap-2">
              {l.options.map((o) => {
                const on = mods.includes(o.id);
                return (
                  <button key={o.id} type="button" onClick={() => toggle(l.id, o.id)} aria-pressed={on} className={`chip ${on ? 'chip-active' : ''}`}>
                    {o.name}{o.price > 0 && <span className={on ? 'text-white/70' : 'text-muted'}>+{formatMoney(o.price)}</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className="flex items-center gap-3">
          <div className="flex h-12 items-center rounded-full ring-1 ring-stone-line">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-12 w-12 rounded-full hover:bg-stone-soft disabled:opacity-40" disabled={qty <= 1} aria-label="Decrease quantity"><MinusIcon className="mx-auto h-4 w-4" /></button>
            <span className="tabular w-6 text-center font-semibold" aria-live="polite">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="h-12 w-12 rounded-full hover:bg-stone-soft disabled:opacity-40" disabled={qty >= maxQty} aria-label="Increase quantity"><PlusIcon className="mx-auto h-4 w-4" /></button>
          </div>
          <button onClick={submit} disabled={busy || !v?.sellable} className="btn-primary h-12 flex-1">
            {v?.sellable ? <>Add to bag <span className="tabular">{formatMoney(unit * qty)}</span></> : 'Sold out'}
          </button>
        </div>
        {err && <p className="text-sm text-bad" role="alert">{err}</p>}
        <p className="text-[13px] text-muted">{product.pickup.label}. Pickup at {product.merchant.name}{product.merchant.neighborhood ? `, ${product.merchant.neighborhood}` : ''}.</p>
      </div>
    </div>
  );
}
