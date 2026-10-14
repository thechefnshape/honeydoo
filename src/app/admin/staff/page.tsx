import { AdminBar } from '@/components/admin/admin-bar';
import { StaffManager } from '@/components/admin/staff-forms';
import { listStaff } from '@/server/staff';
import { staffPage } from '@/server/staff-session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff', robots: { index: false } };

export default async function Page() {
  const me = await staffPage();
  return (
    <div className="page pt-8">
      <AdminBar staff={me} active="staff" />
      <h1 className="text-3xl font-bold">Staff</h1>
      <p className="mt-1 mb-6 text-charcoal">Everyone who can open the admin dashboard. Every sign-in needs a password and an authenticator code.</p>
      <StaffManager rows={await listStaff()} meId={me.id} owner={me.role === 'owner'} />
    </div>
  );
}
