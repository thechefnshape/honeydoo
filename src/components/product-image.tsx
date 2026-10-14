'use client';
import { useEffect, useRef, useState } from 'react';
import { CategoryIcon } from './icons';

/** Product or shop photo with a quiet, on-brand fallback when an image is missing or fails to load. */
export function ProductImage({ src, alt, category, className = '', sizes = 'w-full', eager = false }: { src: string | null; alt: string; category?: string | null; className?: string; sizes?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Images can fail before React hydrates and attaches onError; check once on mount.
  useEffect(() => { const i = ref.current; if (i && i.complete && i.naturalWidth === 0) setFailed(true); }, [src]);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-stone-soft text-muted ${className}`} role="img" aria-label={alt}>
        <CategoryIcon slug={category ?? 'more'} className="h-8 w-8 opacity-60" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt={alt} className={`bg-stone-soft object-cover ${sizes} ${className}`} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />;
}
