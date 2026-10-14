'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BeeMark } from './brand';

/** Brief branded confirmation right after an order is placed. */
export function PlacedMoment({ title, detail }: { title: string; detail: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 2200); return () => clearTimeout(t); }, []);
  if (!on || typeof document === 'undefined') return null;
  // Portal to <body> so the page-enter animation cannot trap this fixed overlay.
  return createPortal(
    <div className="placed-moment fixed inset-0 z-[90] flex items-center justify-center bg-ink/95 px-6 backdrop-blur-sm" onClick={() => setOn(false)} role="status">
      <div className="text-center text-white">
        <div className="relative mx-auto h-28 w-28">
          <span className="placed-ring absolute inset-0 rounded-full bg-honey/30" />
          <span className="absolute inset-3 flex items-center justify-center rounded-full bg-honey"><BeeMark tone="mono" thinking className="h-12 w-auto text-ink" /></span>
        </div>
        <p className="mt-6 text-2xl font-semibold tracking-[-0.02em]">{title}</p>
        <p className="mt-1 text-white/70">{detail}</p>
      </div>
    </div>,
    document.body,
  );
}
