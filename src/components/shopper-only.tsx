'use client';
import { usePathname } from 'next/navigation';

/** Hides shopper controls (bag, customer sign-in) on staff pages. */
export function ShopperOnly({ children }: { children: React.ReactNode }) {
  return usePathname().startsWith('/admin') ? null : <>{children}</>;
}
