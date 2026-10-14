import Link from 'next/link';
import { SignOutStaff } from './sign-out';

export function AdminBar({ staff, active }: { staff: { name: string; role: string }; active: 'network' | 'staff' }) {
  const tab = (href: string, label: string, on: boolean) =>
    <Link href={href} className={`rounded-full px-3 py-1.5 ${on ? 'bg-ink text-white' : 'text-charcoal hover:text-ink'}`}>{label}</Link>;
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3 border-b border-stone-line pb-4 text-sm">
      <span className="font-semibold">Admin</span>
      <nav className="flex gap-1">{tab('/admin', 'Network', active === 'network')}{tab('/admin/staff', 'Staff', active === 'staff')}</nav>
      <span className="ml-auto text-muted">{staff.name} · {staff.role === 'owner' ? 'Owner' : 'Analyst'}</span>
      <SignOutStaff />
    </div>
  );
}
