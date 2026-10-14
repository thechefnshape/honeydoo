import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/account/auth-form';
import { currentCustomer } from '@/server/customer-session';
import { safeNext } from '@/lib/safe-next';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function Page(props: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await props.searchParams).next);
  if (await currentCustomer()) redirect(next);
  return <AuthForm mode="signin" next={next} />;
}
