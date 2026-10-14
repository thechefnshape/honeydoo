'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

async function call(url: string, body: unknown = {}, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? 'Something went wrong.');
  return j.data;
}

export function SignOut() {
  const router = useRouter();
  return <button onClick={async () => { await call('/api/v1/merchant/logout'); router.push('/merchant/connect'); }} className="btn-ghost h-10">Sign out</button>;
}

export function SyncButton() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-sm text-charcoal">{msg}</span>}
      <button disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null);
        try { const d = await call('/api/v1/merchant/sync'); setMsg(d.stats ? `Synced ${d.stats.items} products` : 'Sync failed, retrying automatically'); router.refresh(); }
        catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
      }} className="btn-ghost h-10">{busy ? 'Syncing' : 'Sync now'}</button>
    </div>
  );
}

export function LaunchActions({ termsVersion, termsDone, ready, status }: { termsVersion: string; termsDone: boolean; ready: boolean; status: string }) {
  const [agree, setAgree] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await f(); router.refresh(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="mt-6 space-y-4 border-t border-stone-line pt-5">
      {!termsDone && (
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-[15px]"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-ink" />
            <span>I agree to the <a href="/terms" className="underline" target="_blank">honeydoo merchant terms</a> (version {termsVersion}), including the $1 fee per completed order, paid by the shop and never added to the customer's total.</span></label>
          <button disabled={!agree || busy} onClick={() => run(() => call('/api/v1/merchant/terms', { accept: true, version: termsVersion }))} className="btn-ghost h-10">Accept terms</button>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button disabled={!ready || busy} onClick={() => run(() => call('/api/v1/merchant/publish', { action: 'publish' }))} className="btn-primary">{status === 'paused' ? 'Resume storefront' : 'Activate storefront'}</button>
      </div>
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
    </div>
  );
}
