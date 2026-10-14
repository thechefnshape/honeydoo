'use client';
import { hardNavigate } from '@/lib/hard-nav';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BeeMark } from '@/components/brand';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const r = await fetch('/api/v1/account/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) hardNavigate('/profile'); else { setError(j?.error?.message ?? 'Something went wrong.'); setBusy(false); }
  }
  if (!token) return <p className="mt-4 text-charcoal">This link is incomplete. <Link href="/account/forgot" className="underline">Request a new one</Link>.</p>;
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div><label htmlFor="r-pw" className="label">New password</label>
        <input id="r-pw" type="password" required minLength={8} maxLength={200} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1.5" />
        <p className="mt-1.5 text-[13px] text-muted">At least 8 characters. You will be signed out on other devices.</p></div>
      {error && <p role="alert" className="rounded-xl bg-stone-soft p-3 text-sm text-bad">{error}</p>}
      <button type="submit" disabled={busy} className="btn-dark h-12 w-full">{busy ? 'Saving' : 'Save new password'}</button>
    </form>
  );
}

export default function Reset() {
  return (
    <div className="page max-w-md pt-10 sm:pt-16">
      <BeeMark className="h-10 w-auto" />
      <h1 className="mt-6 text-3xl font-bold">Choose a new password</h1>
      <Suspense><ResetForm /></Suspense>
    </div>
  );
}
