'use client';
import { hardNavigate } from '@/lib/hard-nav';
import { useState } from 'react';
import Link from 'next/link';
import { BeeMark } from '@/components/brand';

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? 'Something went wrong. Please try again.');
  return j.data;
}

export function AuthForm({ mode, next }: { mode: 'signin' | 'signup'; next: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  const q = next !== '/profile' ? `?next=${encodeURIComponent(next)}` : '';

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await post(signup ? '/api/v1/account/signup' : '/api/v1/account/signin', signup ? { name, email, password } : { email, password });
      // Full navigation so the header, bag and orders all pick up the account.
      hardNavigate(next);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="page max-w-md pt-10 sm:pt-16">
      <BeeMark className="h-10 w-auto" />
      <h1 className="mt-6 text-3xl font-bold">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-2 text-charcoal">{signup ? 'Keep your bag and orders on every device. Anything in your bag now comes with you.' : 'Sign in to see your orders and bag on any device.'}</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate={false}>
        {signup && (
          <div><label htmlFor="a-name" className="label">Name</label>
            <input id="a-name" required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="field mt-1.5" /></div>
        )}
        <div><label htmlFor="a-email" className="label">Email</label>
          <input id="a-email" type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1.5" /></div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="a-pw" className="label">Password</label>
            {!signup && <Link href="/account/forgot" className="text-sm text-charcoal underline">Forgot password?</Link>}
          </div>
          <div className="relative mt-1.5">
            <input id="a-pw" type={show ? 'text' : 'password'} required minLength={signup ? 8 : 1} maxLength={200} autoComplete={signup ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} className="field pr-16" aria-describedby={signup ? 'a-pw-hint' : undefined} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-3 text-sm font-medium text-charcoal" aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </div>
          {signup && <p id="a-pw-hint" className="mt-1.5 text-[13px] text-muted">At least 8 characters.</p>}
        </div>
        {error && <p role="alert" className="rounded-xl bg-stone-soft p-3 text-sm text-bad">{error}</p>}
        <button type="submit" disabled={busy} className="btn-dark h-12 w-full">
          {busy ? <><BeeMark thinking className="h-5 w-auto" />{signup ? 'Creating account' : 'Signing in'}</> : signup ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-[15px] text-charcoal">
        {signup ? <>Already have an account? <Link href={`/signin${q}`} className="font-medium text-ink underline">Sign in</Link></>
          : <>New to honeydoo? <Link href={`/signup${q}`} className="font-medium text-ink underline">Create an account</Link></>}
      </p>
      {signup && <p className="mt-4 text-center text-[13px] text-muted">By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>. You never need an account to browse or check out.</p>}
    </div>
  );
}
