'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function DemoLogin({ shops }: { shops: { slug: string; name: string }[] }) {
  const [slug, setSlug] = useState(shops[0]?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  async function go() {
    setBusy(true); setErr(null);
    const r = await fetch('/api/v1/merchant/demo-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug }) });
    if (r.ok) router.push('/merchant'); else { setBusy(false); setErr('Could not open the demo dashboard.'); }
  }
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
      <label htmlFor="demo-shop" className="sr-only">Demo shop</label>
      <select id="demo-shop" value={slug} onChange={(e) => setSlug(e.target.value)} className="field sm:max-w-xs">{shops.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
      <button onClick={go} disabled={busy} className="btn-ghost h-12">Open demo dashboard</button>
      {err && <p className="text-sm text-bad">{err}</p>}
    </div>
  );
}
