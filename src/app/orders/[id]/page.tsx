import Link from 'next/link';
import { notFound } from 'next/navigation';
import { maybeShopper } from '@/server/customer-session';
import { getOrderForShopper, STATUS_LABEL, type OrderStatus } from '@/server/orders';
import { formatMoney } from '@/lib/money';
import { DemoTag } from '@/components/cards';
import { BeeMark } from '@/components/brand';
import { PaymentPoller } from './poller';
import { PlacedMoment } from '@/components/placed-moment';
import { SHOW_DEMO_LABELS } from '@/lib/flags';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order' };

const STEPS: { key: OrderStatus[]; label: string }[] = [
  { key: ['paid', 'accepted', 'ready', 'completed'], label: 'Paid' },
  { key: ['accepted', 'ready', 'completed'], label: 'Preparing' },
  { key: ['ready', 'completed'], label: 'Ready' },
  { key: ['completed'], label: 'Picked up' },
];

export default async function OrderPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ returned?: string; placed?: string }> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const { sessionId, customerId } = await maybeShopper();
  if (!sessionId && !customerId) notFound();
  let o;
  try { o = await getOrderForShopper(params.id, sessionId ?? '', customerId); } catch { notFound(); }
  const progress = ['paid', 'accepted', 'ready', 'completed'].includes(o.status);

  return (
    <div className="page max-w-2xl pt-8">
      {searchParams.placed && <PlacedMoment title="Order placed" detail={o.status === 'payment_not_configured' && SHOW_DEMO_LABELS ? `${o.merchant.name} · demo, not charged` : o.merchant.name} />}
      <p className="eyebrow">Order {o.code}</p>
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-bold">{STATUS_LABEL[o.status]}{o.merchant.isDemo && <DemoTag />}</h1>
      <p className="mt-1 text-charcoal">From <Link href={`/shop/${o.merchant.slug}`} className="underline">{o.merchant.name}</Link>, {o.location.address}</p>

      {o.status === 'payment_not_configured' && SHOW_DEMO_LABELS && (
        <div className="mt-6 rounded-2xl bg-honey-soft p-5">
          <p className="font-semibold">Recorded as a demo order. You were not charged.</p>
          <p className="mt-1 text-[15px] text-charcoal">This shop is a demonstration, so payment is not enabled and nothing is sent to a real business. When a shop connects Square, this step opens a secure Square checkout and the paid order appears in the shop&apos;s Square orders.</p>
        </div>
      )}
      {o.status === 'awaiting_payment' && (
        <div className="mt-6 rounded-2xl bg-stone-soft p-5">
          {searchParams.returned ? (
            <div className="flex items-center gap-3"><BeeMark thinking className="h-8 w-auto" /><div><p className="font-semibold">Confirming your payment with the shop</p><p className="text-sm text-charcoal">This page updates by itself. It only shows paid once Square confirms it.</p></div></div>
          ) : <p className="font-semibold">Payment has not been completed.</p>}
          {o.checkoutUrl && <a href={o.checkoutUrl} className="btn-dark mt-4">Complete payment on Square</a>}
          <PaymentPoller active={Boolean(searchParams.returned)} />
        </div>
      )}
      {['payment_failed', 'expired'].includes(o.status) && <p className="mt-6 rounded-2xl bg-stone-soft p-5">{o.status === 'expired' ? 'The checkout link expired before payment.' : 'The payment did not go through.'} You were not charged. Your items are still in your <Link href="/bag" className="underline">bag</Link>.</p>}
      {o.status === 'needs_reconciliation' && <p className="mt-6 rounded-2xl bg-honey-soft p-5">We received your payment and are confirming the order with the shop. Nothing is lost; we will update this page and email you.</p>}

      {progress && (
        <ol className="mt-8 grid grid-cols-4 gap-2">
          {STEPS.map((s) => {
            const on = s.key.includes(o.status);
            return <li key={s.label}><div className={`h-1.5 rounded-full ${on ? 'bg-honey' : 'bg-stone'}`} /><p className={`mt-2 text-[13px] ${on ? 'font-medium text-ink' : 'text-muted'}`}>{s.label}</p></li>;
          })}
        </ol>
      )}

      <section className="card mt-8 p-5">
        <ul className="space-y-2">
          {o.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-4 text-[15px]">
              <span><span className="tabular">{i.quantity}</span> × {i.name}<span className="block text-sm text-muted">{[i.variation, ...i.modifiers.map((m) => m.name)].join(' · ')}</span></span>
              <span className="tabular">{formatMoney(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-stone-line pt-4 text-[15px]">
          <div className="flex justify-between"><dt>Items</dt><dd className="tabular">{formatMoney(o.merchandiseSubtotal)}</dd></div>
          <div className="flex justify-between"><dt>Sales tax</dt><dd className="tabular">{formatMoney(o.taxTotal)}</dd></div>
          {o.tipTotal > 0 && <div className="flex justify-between"><dt>Tip</dt><dd className="tabular">{formatMoney(o.tipTotal)}</dd></div>}
          <div className="flex justify-between border-t border-stone-line pt-3 font-semibold"><dt>Total</dt><dd className="tabular">{formatMoney(o.grandTotal)}</dd></div>
        </dl>
      </section>
      <p className="mt-4 text-sm text-muted">{String(o.pickup.estimate ?? '')}{o.merchant.phone ? `. Questions? Call the shop at ${o.merchant.phone}.` : ''}</p>
      {!customerId && (
        <div className="mt-8 flex flex-col gap-3 rounded-2xl bg-stone-soft p-5 sm:flex-row sm:items-center">
          <div className="flex-1"><p className="font-semibold">Keep this order with you</p><p className="mt-0.5 text-[15px] text-charcoal">Create an account to see this order and future ones on any device.</p></div>
          <Link href={`/signup?next=/orders/${o.id}`} className="btn-dark h-11 shrink-0">Create account</Link>
        </div>
      )}
    </div>
  );
}
