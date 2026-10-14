'use client';
import { hardNavigate } from '@/lib/hard-nav';
import { useState } from 'react';

async function call(url: string, body: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? 'Something went wrong.');
  return j.data;
}

type Customer = { name: string | null; email: string; phone: string | null };

export function AccountPanel({ customer }: { customer: Customer }) {
  const [name, setName] = useState(customer.name ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<'password' | 'delete' | null>(null);
  const [cur, setCur] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) { setBusy(true); setErr(null); setMsg(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }
  const toggle = (k: 'password' | 'delete') => { setOpen(open === k ? null : k); setCur(''); setNextPw(''); setErr(null); };

  return (
    <div className="mt-8 space-y-6">
      <form className="card p-5" onSubmit={(e) => { e.preventDefault(); run(async () => { await call('/api/v1/account', { name, phone: phone || null }, 'PATCH'); setMsg('Saved'); }); }}>
        <h2 className="font-semibold">Details</h2>
        <p className="mt-1 text-sm text-muted">Filled in for you at checkout. Shops only see them on orders you place.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="p-name" className="label">Name</label><input id="p-name" required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="field mt-1.5" /></div>
          <div><label htmlFor="p-phone" className="label">Phone <span className="font-normal text-muted">(optional)</span></label><input id="p-phone" type="tel" maxLength={30} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-1.5" /></div>
          <div className="sm:col-span-2"><span className="label">Email</span><p className="mt-1.5 text-[15px]">{customer.email}</p></div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={busy} className="btn-dark h-10">Save</button>
          {msg && <span role="status" className="text-sm text-charcoal">{msg}</span>}
        </div>
      </form>

      <section className="card divide-y divide-stone-line">
        <div className="p-5">
          <button type="button" onClick={() => toggle('password')} className="flex w-full items-center justify-between font-semibold" aria-expanded={open === 'password'}>Change password<span className="text-sm font-normal text-muted">{open === 'password' ? 'Close' : ''}</span></button>
          {open === 'password' && (
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await call('/api/v1/account/password', { current: cur, next: nextPw }); setOpen(null); setMsg('Password changed. Other devices were signed out.'); }); }}>
              <div><label htmlFor="pw-cur" className="label">Current password</label><input id="pw-cur" type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="field mt-1.5" /></div>
              <div><label htmlFor="pw-new" className="label">New password</label><input id="pw-new" type="password" required minLength={8} maxLength={200} autoComplete="new-password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} className="field mt-1.5" /></div>
              <div className="sm:col-span-2"><button type="submit" disabled={busy} className="btn-dark h-10">Update password</button></div>
            </form>
          )}
        </div>
        <div className="p-5">
          <button type="button" disabled={busy} onClick={() => run(async () => { await call('/api/v1/account/signout', {}); hardNavigate('/'); })} className="font-semibold">Sign out</button>
        </div>
        <div className="p-5">
          <button type="button" onClick={() => toggle('delete')} className="font-semibold text-bad" aria-expanded={open === 'delete'}>Delete account</button>
          {open === 'delete' && (
            <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await call('/api/v1/account/delete', { password: cur }); hardNavigate('/'); }); }}>
              <p className="text-[15px] text-charcoal">This erases your name, email and phone and signs you out everywhere. Shops keep their own records of orders you placed, which they need for refunds and taxes.</p>
              <div className="max-w-sm"><label htmlFor="del-pw" className="label">Enter your password to confirm</label><input id="del-pw" type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className="field mt-1.5" /></div>
              <button type="submit" disabled={busy} className="btn h-10 bg-bad text-white">Delete my account</button>
            </form>
          )}
        </div>
      </section>
      {err && <p role="alert" className="rounded-xl bg-stone-soft p-3 text-sm text-bad">{err}</p>}
    </div>
  );
}
