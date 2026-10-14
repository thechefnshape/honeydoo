'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Quote } from '@/server/pricing';
import { useCart } from '@/components/cart-context';
import { formatMoney } from '@/lib/money';
import { BeeMark } from '@/components/brand';
import { ChevronLeft } from '@/components/icons';
import { SHOW_DEMO_LABELS } from '@/lib/flags';

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string; details?: any } }> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, data: j.data } : { ok: false, error: j.error ?? { code: 'error', message: 'Something went wrong.' } };
}

export default function CheckoutPage() {
  const params = useParams<{ merchantId: string }>();
  const { cart, loading: cartLoading, refresh } = useCart();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!cart) return;
    const r = await post<Quote>('/api/v1/checkout/quote', { cartId: cart.id, merchantId: params.merchantId });
    if (r.ok) { setQuote(r.data!); setError(null); setAuthorized(false); }
    else setError(r.error!.message);
  }, [cart, params.merchantId]);
  useEffect(() => { load(); }, [load]);
  const [account, setAccount] = useState<{ name: string | null; email: string } | null | undefined>(undefined);
  useEffect(() => {
    fetch('/api/v1/account').then((r) => r.json()).then((j) => {
      const c = j?.data?.customer ?? null;
      setAccount(c);
      if (c) { setName((v) => v || c.name || ''); setEmail((v) => v || c.email); }
    }).catch(() => setAccount(null));
  }, []);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!quote || !cart) return;
    setSubmitting(true); setError(null);
    const r = await post<{ orderId: string; checkoutUrl: string | null; status: string }>('/api/v1/checkout/create', {
      cartId: cart.id, merchantId: params.merchantId, quoteHash: quote.quoteHash, contact: { name, email }, pickupNote: note || undefined, authorize: true,
    });
    if (!r.ok) {
      setSubmitting(false);
      if (r.error!.code === 'quote_changed' && r.error!.details?.quote) { setQuote(r.error!.details.quote); setAuthorized(false); }
      setError(r.error!.message); return;
    }
    if (r.data!.checkoutUrl) { window.location.assign(r.data!.checkoutUrl); return; }
    await refresh();
    router.push(`/orders/${r.data!.orderId}?placed=1`);
  }

  if (cartLoading || (!quote && !error)) return <div className="page max-w-2xl pt-10"><div className="skeleton h-72 rounded-2xl" /></div>;
  if (!quote) return <div className="page max-w-2xl pt-10"><p role="alert" className="rounded-xl bg-stone-soft p-4">{error}</p><Link href="/bag" className="btn-ghost mt-4">Back to bag</Link></div>;

  return (
    <div className="page max-w-2xl pt-6">
      <Link href="/bag" className="inline-flex items-center gap-1 text-sm font-medium text-charcoal hover:text-ink"><ChevronLeft className="h-4 w-4" />Bag</Link>
      <h1 className="mt-3 text-3xl font-bold">Check out</h1>
      <p className="mt-1 text-charcoal">Pickup order from <strong>{quote.merchant.name}</strong></p>

      {!quote.paymentsEnabled && SHOW_DEMO_LABELS && (
        <div className="mt-5 rounded-2xl bg-honey-soft p-4 text-[15px]">
          <p className="font-semibold">This is a demonstration shop</p>
          <p className="mt-1 text-charcoal">Payments are not enabled, so you will not be charged. Placing the order records it as a demo so you can see the full flow.</p>
        </div>
      )}

      <form onSubmit={pay} className="mt-6 space-y-6">
        <section className="card p-5">
          <h2 className="font-semibold">Pickup</h2>
          <p className="mt-1 text-sm text-charcoal">{quote.location.name}, {quote.location.address}</p>
          <p className="mt-1 text-sm text-ok">{quote.location.pickupLabel}</p>
          <label htmlFor="note" className="label mt-4 block">Note for the shop <span className="font-normal text-muted">(optional)</span></label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="field mt-1.5" placeholder="Anything they should know" />
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Your details</h2>
          <p className="mt-1 text-sm text-muted">Used only for this order: your receipt and a pickup message from the shop.</p>
          {account === null && <p className="mt-2 text-sm text-charcoal">Have an account? <Link href={`/signin?next=/checkout/${params.merchantId}`} className="font-medium text-ink underline">Sign in</Link> to save this order to it, or continue as a guest.</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="name" className="label">Name</label><input id="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field mt-1.5" /></div>
            <div><label htmlFor="email" className="label">Email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field mt-1.5" /></div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold">Order</h2>
          <ul className="mt-3 space-y-2 text-[15px]">
            {quote.lines.map((l) => (
              <li key={l.cartItemId} className="flex justify-between gap-4">
                <span><span className="tabular">{l.quantity}</span> × {l.productName}<span className="block text-sm text-muted">{[l.variationName, ...l.modifiers.map((m) => m.name)].join(' · ')}</span></span>
                <span className="tabular">{formatMoney(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {quote.issues.length > 0 && <p className="mt-3 text-sm text-bad">{quote.issues.join('. ')}. These items are not included.</p>}
          <dl className="mt-4 space-y-1.5 border-t border-stone-line pt-4 text-[15px]">
            <Row label="Items" value={quote.merchandiseSubtotal} />
            {quote.discountTotal > 0 && <Row label="Discounts" value={-quote.discountTotal} />}
            <Row label="Sales tax" value={quote.taxTotal} hint={quote.taxNote} />
            {quote.tipTotal > 0 && <Row label="Tip" value={quote.tipTotal} />}
            <div className="flex justify-between border-t border-stone-line pt-3 text-lg font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(quote.grandTotal)}</dd></div>
          </dl>
          <p className="mt-3 text-[13px] text-muted">You pay {quote.merchant.name}&apos;s regular prices. No service fees, no markups.</p>
        </section>

        <label className="flex items-start gap-3 text-[15px]">
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-1 h-4 w-4 accent-ink" required />
          <span>I authorize this pickup order from {quote.merchant.name} for <strong className="tabular">{formatMoney(quote.grandTotal)}</strong>{quote.paymentsEnabled ? ', paid securely on the shop\'s Square checkout.' : SHOW_DEMO_LABELS ? '. Demo orders are not charged.' : '.'}</span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-stone-soft p-3 text-sm text-bad">{error}</p>}
        <button type="submit" disabled={!authorized || submitting} className="btn-primary h-14 w-full text-base">
          {submitting ? <><BeeMark thinking className="h-6 w-auto" />Preparing your order</> : quote.paymentsEnabled ? `Continue to payment, ${formatMoney(quote.grandTotal)}` : SHOW_DEMO_LABELS ? 'Place demo order' : 'Place order'}
        </button>
        {(quote.paymentsEnabled || SHOW_DEMO_LABELS) && <p className="text-center text-[13px] text-muted">{quote.paymentsEnabled ? 'You will pay on Square. Honeydoo never sees or stores your card.' : 'No payment details are collected for demo orders.'}</p>}
      </form>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}{hint && <span className="block text-[12px] text-muted">{hint}</span>}</dt>
      <dd className="tabular">{formatMoney(value)}</dd>
    </div>
  );
}
