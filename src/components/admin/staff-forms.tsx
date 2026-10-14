'use client';
import { useState } from 'react';

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? 'Something went wrong.');
  return j.data;
}
const Alert = ({ msg }: { msg: string | null }) => msg ? <p role="alert" className="rounded-xl bg-stone-soft p-3 text-sm text-bad">{msg}</p> : null;
const Code = ({ value, set }: { value: string; set: (v: string) => void }) => (
  <input id="s-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} value={value}
    onChange={(e) => set(e.target.value)} className="field mt-1.5 tabular tracking-[0.3em]" placeholder="000000" />
);

export function StaffLogin() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <form className="mt-8 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null);
      try { await post('/api/v1/admin/login', { email, password, code }); window.location.assign('/admin'); } catch (x) { setErr((x as Error).message); setCode(''); setBusy(false); } }}>
      <div><label htmlFor="s-email" className="label">Work email</label><input id="s-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1.5" /></div>
      <div><label htmlFor="s-pw" className="label">Password</label><input id="s-pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1.5" /></div>
      <div><label htmlFor="s-code" className="label">Authenticator code</label><Code value={code} set={setCode} /></div>
      <Alert msg={err} />
      <button type="submit" disabled={busy} className="btn-dark h-12 w-full">{busy ? 'Checking' : 'Sign in'}</button>
    </form>
  );
}

export function StaffSetup({ token, secret }: { token: string; secret: string }) {
  const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  return (
    <form className="mt-6 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null);
      try { await post('/api/v1/admin/setup', { token, password, code }); window.location.assign('/admin'); } catch (x) { setErr((x as Error).message); setBusy(false); } }}>
      <p className="text-sm text-muted">Can&apos;t scan? Enter this key manually: <code className="select-all break-all rounded bg-stone-soft px-1.5 py-0.5 text-ink">{secret.match(/.{1,4}/g)!.join(' ')}</code></p>
      <div><label htmlFor="s-code" className="label">Code from your authenticator app</label><Code value={code} set={setCode} /></div>
      <div><label htmlFor="s-pw" className="label">Choose a password</label>
        <input id="s-pw" type="password" required minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1.5" />
        <p className="mt-1.5 text-[13px] text-muted">At least 12 characters. A password manager is best.</p></div>
      <Alert msg={err} />
      <button type="submit" disabled={busy} className="btn-dark h-12 w-full">{busy ? 'Saving' : 'Finish setup'}</button>
    </form>
  );
}

type Row = { id: string; email: string; name: string; role: string; active: boolean; disabled: boolean; lastLoginAt: string | null };
export function StaffManager({ rows, meId, owner }: { rows: Row[]; meId: string; owner: boolean }) {
  const [list, setList] = useState(rows);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [role, setRole] = useState<'analyst' | 'owner'>('analyst');
  const [link, setLink] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const reload = async () => setList((await (await fetch('/api/v1/admin/staff')).json()).data);
  return (
    <div className="space-y-8">
      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-soft text-muted"><tr><th className="px-5 py-3 font-medium">Name</th><th className="px-5 py-3 font-medium">Role</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Last sign-in</th><th /></tr></thead>
          <tbody className="divide-y divide-stone-line">
            {list.map((r) => (
              <tr key={r.id} className={r.disabled ? 'text-muted' : ''}>
                <td className="px-5 py-3"><p className="font-medium">{r.name}</p><p className="text-muted">{r.email}</p></td>
                <td className="px-5 py-3">{r.role === 'owner' ? 'Owner' : 'Analyst'}</td>
                <td className="px-5 py-3">{r.disabled ? 'Removed' : r.active ? 'Active' : 'Invited'}</td>
                <td className="tabular px-5 py-3">{r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}</td>
                <td className="px-5 py-3 text-right">{owner && !r.disabled && r.id !== meId && (
                  <button type="button" className="font-medium text-bad" onClick={async () => {
                    if (!confirm(`Remove ${r.name}'s access? They are signed out everywhere immediately.`)) return;
                    try { await post(`/api/v1/admin/staff/${r.id}/disable`, {}); await reload(); } catch (x) { setErr((x as Error).message); }
                  }}>Remove</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {owner && (
        <form className="card max-w-2xl p-6" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); setLink(null);
          try { setLink((await post('/api/v1/admin/staff', { email, name, role })).setupUrl); setEmail(''); setName(''); await reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
          <h2 className="text-lg font-semibold">Invite someone</h2>
          <p className="mt-1 text-sm text-muted">You get a one-time setup link to send them. It expires in 72 hours. Analysts can view the dashboard; owners can also manage staff.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <div><label htmlFor="i-name" className="label">Name</label><input id="i-name" required value={name} onChange={(e) => setName(e.target.value)} className="field mt-1.5" /></div>
            <div><label htmlFor="i-email" className="label">Work email</label><input id="i-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1.5" /></div>
            <div><label htmlFor="i-role" className="label">Role</label><select id="i-role" value={role} onChange={(e) => setRole(e.target.value as 'analyst' | 'owner')} className="field mt-1.5"><option value="analyst">Analyst</option><option value="owner">Owner</option></select></div>
          </div>
          <button type="submit" disabled={busy} className="btn-dark mt-4 h-10">{busy ? 'Creating' : 'Create invite'}</button>
          {link && <div className="mt-4 rounded-xl bg-honey-soft p-4 text-sm"><p className="font-semibold">Send this link privately. It is shown only once.</p><p className="mt-2 select-all break-all font-mono text-[13px]">{link}</p></div>}
        </form>
      )}
      <Alert msg={err} />
    </div>
  );
}
