import { ogMeta } from '@/lib/seo';
import Link from 'next/link';
import { isDemoMode, squareConfigured, env } from '@/lib/env';
import { db } from '@/lib/db';
import { BeeMark } from '@/components/brand';
import { CheckIcon } from '@/components/icons';
import { DemoLogin } from './demo-login';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Sell on honeydoo',
  description: 'Connect the Square account you already use. Your products sync automatically, paid orders arrive in Square, and customers pay your regular prices. $1 per completed order.',
  alternates: { canonical: '/merchant/connect' },
  openGraph: ogMeta({ title: 'Sell on honeydoo', description: 'Connect the Square account you already use. Your products sync automatically, paid orders arrive in Square, and customers pay your regular prices. $1 per completed order.', url: '/merchant/connect' }),
};

const ERRORS: Record<string, string> = {
  access_denied: 'Square access was not granted. You can try again whenever you are ready.',
  scopes: 'Some required permissions were not granted. Please approve all requested permissions.',
  connect_failed: 'We could not finish connecting to Square. Nothing was changed. Please try again.',
  session: 'Your browser session expired during the connection. Please start again.',
  missing_code: 'Square did not return an authorization code. Please try again.',
};

const PERMISSIONS = [
  ['Read your business profile and locations', 'So your storefront shows the right name, address and hours.'],
  ['Read your items, prices and inventory', 'So your products appear on honeydoo exactly as they are in Square. You never maintain two catalogs.'],
  ['Create and read orders', 'So paid honeydoo orders arrive in your Square orders like any other pickup order.'],
  ['Take payments for those orders', 'Customers pay on your Square checkout. Money settles to your Square account.'],
];

export default async function Connect(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const configured = squareConfigured();
  const demos = isDemoMode() ? (await (await db()).query(`select slug, display_name, category from merchants where is_demo order by display_name`)).rows : [];
  return (
    <div className="page max-w-3xl pt-10">
      <BeeMark className="h-12 w-auto" />
      <h1 className="mt-6 text-4xl font-bold">Connect your Square account</h1>
      <p className="mt-3 text-lg text-charcoal">Keep running your shop the way you do today. Honeydoo syncs your products from Square, sends paid pickup orders back to Square, and helps neighbors find you.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {['Free to join', '$1 per completed order, paid by the shop', 'No tablet, no second menu'].map((t) => (
          <li key={t} className="flex items-start gap-2 rounded-2xl bg-stone-soft p-4 text-[15px] font-medium"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />{t}</li>
        ))}
      </ul>

      {error && <p role="alert" className="mt-6 rounded-xl bg-honey-soft p-4">{ERRORS[error] ?? ERRORS.connect_failed}</p>}

      <section className="card mt-8 p-6">
        <h2 className="text-lg font-semibold">What honeydoo asks Square for</h2>
        <ul className="mt-4 space-y-4">
          {PERMISSIONS.map(([t, d]) => <li key={t}><p className="font-medium">{t}</p><p className="text-sm text-charcoal">{d}</p></li>)}
        </ul>
        <p className="mt-4 text-sm text-muted">Honeydoo never edits your Square item library. You choose which locations and products appear, and you can disconnect at any time.</p>
        {configured ? (
          <a href="/api/v1/integrations/square/connect" className="btn-dark mt-6 h-12 w-full sm:w-auto">Connect with Square{env().SQUARE_ENVIRONMENT === 'sandbox' ? ' (Sandbox)' : ''}</a>
        ) : (
          <p className="mt-6 rounded-xl bg-stone-soft p-4 text-[15px] text-charcoal">Square is not configured in this environment yet, so the connect button is turned off. Add the Square application credentials (see <code>docs/SQUARE_SETUP.md</code>) to enable it.</p>
        )}
      </section>

      {demos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Explore the merchant dashboard</h2>
          <p className="mt-1 text-sm text-charcoal">Preview the dashboard as one of the demonstration shops. Demo shops are fictional.</p>
          <DemoLogin shops={demos.map((d) => ({ slug: d.slug, name: d.display_name }))} />
        </section>
      )}
      <p className="mt-10 text-sm text-muted">Already connected? <Link href="/merchant" className="underline">Open your dashboard</Link>.</p>
    </div>
  );
}
