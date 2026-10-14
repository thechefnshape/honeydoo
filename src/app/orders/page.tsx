import Link from 'next/link';
import { maybeShopper } from '@/server/customer-session';
import { listOrdersForShopper, STATUS_LABEL } from '@/server/orders';
import { formatMoney } from '@/lib/money';
import { DemoTag } from '@/components/cards';
import { ChevronRight } from '@/components/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders' };

export default async function Orders() {
  const { sessionId, customerId } = await maybeShopper();
  const orders = sessionId || customerId ? await listOrdersForShopper(sessionId ?? '', customerId) : [];
  return (
    <div className="page max-w-3xl pt-8">
      <h1 className="text-3xl font-bold">Orders</h1>
      {customerId
        ? <p className="mt-1 text-sm text-muted">Every order on your account, from any device.</p>
        : <p className="mt-1 text-sm text-muted">Orders placed in this browser. <Link href="/signin?next=/orders" className="text-ink underline">Sign in</Link> or <Link href="/signup?next=/orders" className="text-ink underline">create an account</Link> to see them on every device.</p>}
      {orders.length ? (
        <ul className="mt-6 divide-y divide-stone-line rounded-2xl ring-1 ring-stone-line">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-stone-soft">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">{o.merchant}{o.isDemo && <DemoTag />}</p>
                  <p className="text-sm text-muted">{new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'} · {o.code}</p>
                </div>
                <div className="text-right"><p className="tabular font-medium">{formatMoney(o.total)}</p><p className="text-[13px] text-charcoal">{STATUS_LABEL[o.status]}</p></div>
                <ChevronRight className="h-4 w-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10 text-center"><p className="text-charcoal">No orders yet.</p><Link href="/" className="btn-dark mt-4">Find something local</Link></div>
      )}
    </div>
  );
}
