'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BeeMark } from '@/components/brand';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState('busy'); setError(null);
    const r = await fetch('/api/v1/account/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setState('sent'); else { setError(j?.error?.message ?? 'Something went wrong.'); setState('idle'); }
  }
  return (
    <div className="page max-w-md pt-10 sm:pt-16">
      <BeeMark className="h-10 w-auto" />
      <h1 className="mt-6 text-3xl font-bold">Reset your password</h1>
      {state === 'sent' ? (
        <>
          <p className="mt-3 text-charcoal">If there is an account for <strong>{email}</strong>, a reset link is on its way. It works once and expires in 30 minutes.</p>
          <Link href="/signin" className="btn-dark mt-8 h-12 w-full">Back to sign in</Link>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-charcoal">Enter the email you signed up with and we will send you a link to choose a new password.</p>
          <div><label htmlFor="f-email" className="label">Email</label>
            <input id="f-email" type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1.5" /></div>
          {error && <p role="alert" className="rounded-xl bg-stone-soft p-3 text-sm text-bad">{error}</p>}
          <button type="submit" disabled={state === 'busy'} className="btn-dark h-12 w-full">{state === 'busy' ? 'Sending' : 'Send reset link'}</button>
          <p className="text-center text-[15px]"><Link href="/signin" className="text-charcoal underline">Back to sign in</Link></p>
        </form>
      )}
    </div>
  );
}
