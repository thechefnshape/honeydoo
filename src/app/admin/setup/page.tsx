import QRCode from 'qrcode';
import { BeeMark } from '@/components/brand';
import { StaffSetup } from '@/components/admin/staff-forms';
import { beginSetup } from '@/server/staff';
import { otpauthUri } from '@/lib/totp';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up staff access', robots: { index: false }, referrer: 'no-referrer' };

export default async function Page(props: { searchParams: Promise<{ token?: string }> }) {
  const token = (await props.searchParams).token ?? '';
  let setup: Awaited<ReturnType<typeof beginSetup>> | null = null; let error = '';
  try { setup = await beginSetup(token); } catch (e) { error = (e as Error).message; }
  return (
    <div className="page max-w-md pt-10 sm:pt-16">
      <BeeMark className="h-10 w-auto" />
      <h1 className="mt-6 text-3xl font-bold">Set up staff access</h1>
      {!setup ? <p className="mt-3 text-charcoal">{error}</p> : (
        <>
          <p className="mt-2 text-charcoal">Welcome, {setup.name}. Scan this with an authenticator app (1Password, Google Authenticator or Authy), then enter the 6-digit code it shows.</p>
          <div className="mx-auto mt-6 w-48 rounded-2xl p-2 ring-1 ring-stone-line [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: await QRCode.toString(otpauthUri(setup.secret, setup.email), { type: 'svg', margin: 1, color: { dark: '#0B0B0B', light: '#FFFFFF' } }) }} />
          <StaffSetup token={token} secret={setup.secret} />
        </>
      )}
    </div>
  );
}
