'use client';
export function SignOutStaff() {
  return <button type="button" className="font-medium text-charcoal underline hover:text-ink" onClick={async () => { await fetch('/api/v1/admin/logout', { method: 'POST' }); window.location.assign('/admin/login'); }}>Sign out</button>;
}
