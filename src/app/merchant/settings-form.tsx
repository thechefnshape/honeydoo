'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Loc = { id: string; name: string; address: string; active: boolean; pickupEnabled: boolean; prepMinutes: number };
type Props = {
  merchant: { displayName: string; description: string; contactEmail: string; contactPhone: string; serviceFeeEnabled: boolean; status: string; isDemo: boolean };
  locations: Loc[];
  integration: { provider: string; environment: string; status: string; authorizedAt: string | null; scopes: string[] } | null;
};

async function call(url: string, body: unknown, method = 'POST') {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? 'Something went wrong.');
  return j.data;
}

export function SettingsForm({ merchant, locations, integration }: Props) {
  const router = useRouter();
  const [m, setM] = useState(merchant);
  const [locs, setLocs] = useState(locations);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await call('/api/v1/merchant/profile', { displayName: m.displayName, description: m.description, contactEmail: m.contactEmail || undefined, contactPhone: m.contactPhone, locations: locs.map((l) => ({ id: l.id, active: l.active, pickupEnabled: l.pickupEnabled, prepMinutes: l.prepMinutes })) }, 'PATCH');
      setMsg('Saved'); router.refresh();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const setLoc = (id: string, patch: Partial<Loc>) => setLocs((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <form onSubmit={save} className="mt-8 grid max-w-3xl gap-6">
      <section className="card p-6">
        <h2 className="text-lg font-semibold">Store profile</h2>
        <div className="mt-4 grid gap-4">
          <div><label htmlFor="s-name" className="label">Business name shown to customers</label><input id="s-name" className="field mt-1.5" value={m.displayName} onChange={(e) => setM({ ...m, displayName: e.target.value })} required minLength={2} maxLength={80} /></div>
          <div><label htmlFor="s-desc" className="label">Description</label><textarea id="s-desc" className="field mt-1.5 h-24 py-3" value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} maxLength={600} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="s-email" className="label">Contact email</label><input id="s-email" type="email" className="field mt-1.5" value={m.contactEmail} onChange={(e) => setM({ ...m, contactEmail: e.target.value })} /></div>
            <div><label htmlFor="s-phone" className="label">Contact phone</label><input id="s-phone" className="field mt-1.5" value={m.contactPhone} onChange={(e) => setM({ ...m, contactPhone: e.target.value })} /></div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Locations and pickup</h2>
        <p className="mt-1 text-sm text-charcoal">Only locations you turn on appear on honeydoo. Hours come from Square.</p>
        <ul className="mt-4 divide-y divide-stone-line">
          {locs.map((l) => (
            <li key={l.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
              <div><p className="font-medium">{l.name}</p><p className="text-sm text-muted">{l.address}</p></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={l.active} onChange={(e) => setLoc(l.id, { active: e.target.checked })} />Show on honeydoo</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-ink" checked={l.pickupEnabled} onChange={(e) => setLoc(l.id, { pickupEnabled: e.target.checked })} />Pickup</label>
              <label className="flex items-center gap-2 text-sm">Prep<input type="number" min={0} max={240} className="field h-9 w-20 px-2" value={l.prepMinutes} onChange={(e) => setLoc(l.id, { prepMinutes: Number(e.target.value) })} aria-label={`Prep minutes for ${l.name}`} />min</label>
            </li>
          ))}
          {!locs.length && <li className="py-4 text-sm text-charcoal">No locations imported yet.</li>}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">honeydoo fee</h2>
        <p className="mt-2 text-[15px] text-charcoal">$1 per completed order{m.serviceFeeEnabled ? '' : ' (currently waived)'}, deducted automatically from the order payment by Square. Customers pay your regular prices with no added fees.</p>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn-dark">{busy ? 'Saving' : 'Save changes'}</button>
        {msg && <span className="text-sm text-charcoal" role="status">{msg}</span>}
      </div>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Connection</h2>
        {integration ? (
          <div className="mt-2 text-[15px] text-charcoal">
            <p>{integration.provider === 'demo' ? 'Demonstration catalog (not connected to a real POS).' : `Square ${integration.environment}, ${integration.status}.`}</p>
            {integration.authorizedAt && <p className="text-sm text-muted">Authorized {new Date(integration.authorizedAt).toLocaleDateString()}</p>}
            {integration.scopes.length > 0 && <p className="mt-2 text-sm text-muted">Permissions: {integration.scopes.join(', ')}</p>}
          </div>
        ) : <p className="mt-2 text-[15px]">Not connected.</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {m.status === 'active' && <button type="button" onClick={async () => { await call('/api/v1/merchant/publish', { action: 'pause' }); router.refresh(); }} className="btn-ghost h-10">Pause storefront</button>}
          {integration?.provider === 'square' && integration.status !== 'disconnected' && (confirmDisconnect ? (
            <>
              <span className="self-center text-sm">Disconnecting removes your shop from honeydoo immediately.</span>
              <button type="button" onClick={async () => { await call('/api/v1/integrations/square/disconnect', {}); router.refresh(); }} className="btn h-10 bg-bad text-white">Disconnect Square</button>
              <button type="button" onClick={() => setConfirmDisconnect(false)} className="btn-ghost h-10">Keep connected</button>
            </>
          ) : <button type="button" onClick={() => setConfirmDisconnect(true)} className="btn-ghost h-10 text-bad">Disconnect Square</button>)}
          {integration?.provider !== 'square' && !m.isDemo && <a href="/api/v1/integrations/square/connect" className="btn-dark h-10">Connect Square</a>}
        </div>
      </section>
    </form>
  );
}
