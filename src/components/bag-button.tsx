'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BagIcon } from './icons';
import { useCart } from './cart-context';
import { BeeMark } from './brand';

export function BagButton() {
  const { cart } = useCart();
  const n = cart?.itemCount ?? 0;
  const prev = useRef(n); const [bump, setBump] = useState(false);
  useEffect(() => { if (n > prev.current) { setBump(true); const t = setTimeout(() => setBump(false), 950); prev.current = n; return () => clearTimeout(t); } prev.current = n; }, [n]);
  return (
    <Link href="/bag" className={`${bump ? 'bag-bump ' : ''}relative inline-flex h-10 items-center gap-2 rounded-full bg-ink pl-3.5 pr-4 text-sm font-semibold text-white hover:bg-charcoal`} aria-label={`Shopping bag, ${n} items`}>
      {bump ? <span className="bag-bee flex h-[18px] w-[18px] items-center justify-center"><BeeMark tone="dark" className="h-[20px] w-auto" /></span> : <BagIcon className="h-[18px] w-[18px]" />}
      <span className="tabular">{n}</span>
    </Link>
  );
}
