import Link from 'next/link';
import { BeeMark } from '@/components/brand';
import { ChevronRight } from '@/components/icons';
import { AccountPanel } from '@/components/account/account-panel';
import { currentCustomer } from '@/server/customer-session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile' };

const initial = (s: string) => s.trim().charAt(0).toUpperCase();

export default async function Profile() {
  const c = await currentCustomer();
  const rows = [['/orders', 'Your orders'], ['/shops', 'Browse shops'], ['/merchant/connect', 'Sell on honeydoo'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];
  return (
    <div className="page max-w-2xl pt-8">
      {c ? (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-xl font-semibold text-honey">{initial(c.name || c.email)}</div>
            <div className="min-w-0"><h1 className="truncate text-2xl font-bold">{c.name || 'Your account'}</h1><p className="truncate text-sm text-muted">{c.email}</p></div>
          </div>
          <AccountPanel customer={{ name: c.name, email: c.email, phone: c.phone }} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-soft"><BeeMark className="h-8 w-auto" /></div>
            <div><h1 className="text-2xl font-bold">Shopping as a guest</h1><p className="text-sm text-muted">Your bag and orders are saved in this browser.</p></div>
          </div>
          <div className="mt-6 rounded-2xl bg-stone-soft p-5">
            <p className="font-semibold">Create an account</p>
            <p className="mt-1 text-[15px] text-charcoal">See your orders and bag on every device, and check out faster. Orders you placed here as a guest move into your account.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-dark h-11">Create account</Link>
              <Link href="/signin" className="btn-ghost h-11 bg-white">Sign in</Link>
            </div>
          </div>
        </>
      )}
      <ul className="mt-6 divide-y divide-stone-line rounded-2xl ring-1 ring-stone-line">
        {rows.map(([href, label]) => <li key={href}><Link href={href} className="flex items-center justify-between px-5 py-4 hover:bg-stone-soft">{label}<ChevronRight className="h-4 w-4 text-muted" /></Link></li>)}
      </ul>
    </div>
  );
}
