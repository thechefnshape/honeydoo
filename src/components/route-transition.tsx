'use client';
import { usePathname } from 'next/navigation';

/** Every screen enters with the same short rise and fade, keyed by route. */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <div key={path} className="route-enter">{children}</div>;
}
