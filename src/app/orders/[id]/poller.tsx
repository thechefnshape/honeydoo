'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-reads the order from the server while payment confirmation is pending. Never assumes success. */
export function PaymentPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let n = 0;
    const t = setInterval(() => { n++; router.refresh(); if (n > 40) clearInterval(t); }, 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
