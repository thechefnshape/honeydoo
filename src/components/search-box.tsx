'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BeeMark } from './brand';
import { SearchIcon } from './icons';

export function SearchBox({ initial = '', size = 'lg', autoFocus = false, onSubmit }: { initial?: string; size?: 'lg' | 'md'; autoFocus?: boolean; onSubmit?: (q: string) => void }) {
  const [q, setQ] = useState(initial);
  const router = useRouter();
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim(); if (!v) return;
    if (onSubmit) onSubmit(v); else router.push(`/search?q=${encodeURIComponent(v)}`);
  };
  return (
    <form onSubmit={go} role="search" className="relative w-full">
      <label htmlFor="hd-search" className="sr-only">Search Honeydoo or ask for something</label>
      <SearchIcon className={`pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted ${size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]'}`} />
      <input
        id="hd-search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} autoComplete="off" enterKeyHint="search"
        placeholder="Find food, gifts, flowers, coffee... or just ask"
        className={`w-full rounded-full bg-white pl-14 pr-16 text-ink ring-1 ring-stone-line shadow-[0_1px_2px_rgba(11,11,11,0.04),0_8px_24px_-12px_rgba(11,11,11,0.12)] placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink ${size === 'lg' ? 'h-16 text-[17px]' : 'h-12 text-[15px]'}`}
      />
      <button type="submit" aria-label="Ask Honeydoo" className={`absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-honey-soft hover:bg-honey ${size === 'lg' ? 'h-12 w-12' : 'h-9 w-9'}`}>
        <BeeMark className={size === 'lg' ? 'h-7 w-auto' : 'h-5 w-auto'} />
      </button>
    </form>
  );
}
