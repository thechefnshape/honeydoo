'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from './brand';

/** Header wordmark: the bee hops on each new page. Tapping it on the home page replays the launch intro. */
export function HeaderLogo() {
  const path = usePathname();
  const first = useRef(true);
  const [n, setN] = useState(0);
  useEffect(() => { if (first.current) { first.current = false; return; } setN((x) => x + 1); }, [path]);
  return (
    <Link href="/" aria-label="honeydoo home" title={path === '/' ? 'Replay intro' : undefined} className="shrink-0" onMouseEnter={() => setN((x) => x + 1)}
      onClick={() => { if (path === '/') window.dispatchEvent(new Event('hd:splash')); }}>
      <span key={n} className={n ? 'bee-hop block' : 'block'}><Wordmark className="h-7 w-auto sm:h-8" /></span>
    </Link>
  );
}
