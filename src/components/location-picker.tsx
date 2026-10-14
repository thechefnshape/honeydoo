'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloseIcon, PinIcon } from './icons';

type M = { slug: string; name: string; state: string };
const SERVED = { lat: 41.4819, lng: -81.7982 };

export function LocationPicker({ markets, current }: { markets: M[]; current: { slug: string; label: string } | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);

  async function choose(slug: string) {
    const r = await fetch('/api/v1/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ market: slug }) });
    if (r.ok) { setOpen(false); router.refresh(); } else setNote('That city is not available yet.');
  }

  function locateDevice() {
    // Opt-in only. The position is used once in the browser to pick the nearest market and is never sent or stored.
    if (!navigator.geolocation) { setNote('Your browser does not share location. Choose a city instead.'); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const km = haversine(p.coords.latitude, p.coords.longitude, SERVED.lat, SERVED.lng);
      if (km < 40) { setNote(`You are about ${Math.max(1, Math.round(km * 0.621))} miles from Lakewood. Showing Lakewood shops.`); choose('lakewood-oh'); }
      else setNote('Honeydoo is not in your area yet. Choose a city from the list.');
    }, () => setNote('Location permission was not granted. Choose a city instead.'), { maximumAge: 600000, timeout: 8000 });
  }

  const matches = markets.filter((m) => `${m.name} ${m.state}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <button onClick={() => { setNote(null); setOpen(true); }} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-charcoal hover:bg-stone-soft" aria-haspopup="dialog">
        <PinIcon className="h-[18px] w-[18px]" />
        <span className="max-w-[9rem] truncate">{current?.label ?? 'Choose city'}</span>
      </button>
      <dialog ref={dialog} onClose={() => setOpen(false)} className="w-[min(92vw,420px)] rounded-2xl p-0 backdrop:bg-ink/40">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Where are you shopping?</h2>
            <button onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-stone-soft" aria-label="Close"><CloseIcon /></button>
          </div>
          <p className="mt-1 text-sm text-muted">Honeydoo is launching neighborhood by neighborhood.</p>
          <label htmlFor="city-q" className="sr-only">City</label>
          <input id="city-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cities" className="field mt-4" />
          <ul className="mt-3 divide-y divide-stone-line">
            {matches.map((m) => (
              <li key={m.slug}>
                <button onClick={() => choose(m.slug)} className="flex w-full items-center justify-between py-3 text-left">
                  <span className="font-medium">{m.name}, {m.state}</span>
                  {current?.slug === m.slug && <span className="text-sm text-muted">Current</span>}
                </button>
              </li>
            ))}
            {!matches.length && <li className="py-3 text-sm text-muted">Not available yet. Greater Cleveland is next.</li>}
          </ul>
          <button onClick={locateDevice} className="btn-ghost mt-4 w-full"><PinIcon className="h-4 w-4" />Use my current location</button>
          {note && <p className="mt-3 text-sm text-charcoal">{note}</p>}
        </div>
      </dialog>
    </>
  );
}

function haversine(a: number, b: number, c: number, d: number) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
