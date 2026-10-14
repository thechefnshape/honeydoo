import { redirect } from 'next/navigation';
import { BeeMark } from '@/components/brand';
import { StaffLogin } from '@/components/admin/staff-forms';
import { currentStaff } from '@/server/staff-session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff sign in', robots: { index: false } };

export default async function Page() {
  if (await currentStaff()) redirect('/admin');
  return (
    <div className="page max-w-md pt-10 sm:pt-16">
      <BeeMark className="h-10 w-auto" />
      <h1 className="mt-6 text-3xl font-bold">honeydoo staff</h1>
      <p className="mt-2 text-charcoal">Sign in with your password and the code from your authenticator app.</p>
      <StaffLogin />
      <p className="mt-6 text-center text-[13px] text-muted">Locked out or lost your phone? Ask an owner to send you a new setup link.</p>
    </div>
  );
}
