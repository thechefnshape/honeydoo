'use client';
import Link from 'next/link';
import { useCart } from '@/components/cart-context';
import { formatMoney } from '@/lib/money';
import { ProductImage } from '@/components/product-image';
import { DemoTag } from '@/components/cards';
import { MinusIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { BeeMark } from '@/components/brand';

export default function BagPage() {
  const { cart, loading, setQuantity, remove } = useCart();
  if (loading) return <div className="page pt-10"><div className="skeleton h-40 rounded-2xl" /></div>;
  if (!cart || !cart.groups.length) {
    return (
      <div className="page flex flex-col items-center pt-20 text-center">
        <BeeMark className="h-14 w-auto" />
        <h1 className="mt-6 text-2xl font-semibold">Your bag is empty</h1>
        <p className="mt-2 text-charcoal">Add something from a local shop to get started.</p>
        <Link href="/" className="btn-dark mt-6">Start shopping</Link>
      </div>
    );
  }
  return (
    <div className="page max-w-3xl pt-8">
      <h1 className="text-3xl font-bold">Your bag</h1>
      {cart.groups.length > 1 && <p className="mt-2 text-charcoal">Each shop is checked out separately, so every order goes straight to the business that makes it.</p>}
      <div className="mt-8 space-y-8">
        {cart.groups.map((g) => (
          <section key={g.merchant.id} className="card overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-stone-line px-5 py-4">
              <div className="flex items-center gap-2"><Link href={`/shop/${g.merchant.slug}`} className="font-semibold hover:underline">{g.merchant.name}</Link>{g.merchant.isDemo && <DemoTag />}</div>
              <span className="text-sm text-muted">Pickup</span>
            </header>
            <ul className="divide-y divide-stone-line">
              {g.lines.map((l) => (
                <li key={l.id} className="flex gap-4 px-5 py-4">
                  <ProductImage src={l.image} alt={l.productName} className="h-20 w-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{l.productName}</p>
                        <p className="text-sm text-muted">{[l.variationName, ...l.modifiers.map((m) => m.name)].join(' · ')}</p>
                        {l.availabilityNote && <p className="mt-1 text-sm font-medium text-bad">{l.availabilityNote}</p>}
                      </div>
                      <p className="tabular font-medium">{formatMoney(l.lineTotal)}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex h-9 items-center rounded-full ring-1 ring-stone-line">
                        <button onClick={() => l.quantity > 1 ? setQuantity(l.id, l.quantity - 1) : remove(l.id)} className="h-9 w-9 rounded-full hover:bg-stone-soft" aria-label={`Decrease ${l.productName}`}><MinusIcon className="mx-auto h-4 w-4" /></button>
                        <span className="tabular w-6 text-center text-sm font-semibold">{l.quantity}</span>
                        <button onClick={() => setQuantity(l.id, l.quantity + 1)} className="h-9 w-9 rounded-full hover:bg-stone-soft" aria-label={`Increase ${l.productName}`}><PlusIcon className="mx-auto h-4 w-4" /></button>
                      </div>
                      <button onClick={() => remove(l.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-charcoal hover:bg-stone-soft"><TrashIcon className="h-4 w-4" />Remove</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="flex items-center justify-between gap-4 bg-stone-soft px-5 py-4">
              <div><p className="text-sm text-muted">Items subtotal</p><p className="tabular text-lg font-semibold">{formatMoney(g.subtotal)}</p></div>
              {g.subtotal > 0 ? <Link href={`/checkout/${g.merchant.id}`} className="btn-primary">Check out</Link> : <span className="text-sm text-muted">Nothing available to check out</span>}
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
