'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CartView } from '@/server/cart';

interface CartCtx {
  cart: CartView | null; loading: boolean; error: string | null;
  add(variationId: string, quantity: number, modifierIds: string[]): Promise<boolean>;
  setQuantity(itemId: string, quantity: number): Promise<void>;
  remove(itemId: string): Promise<void>;
  refresh(): Promise<void>;
  toast: string | null;
}
const Ctx = createContext<CartCtx | null>(null);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message ?? 'Something went wrong. Please try again.');
  return j.data as T;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = (m: string) => { setToast(m); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 2600); };
  const refresh = useCallback(async () => {
    try { setCart(await api<CartView>('/api/v1/cart', { method: 'POST' })); setError(null); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<CartCtx>(() => ({
    cart, loading, error, toast, refresh,
    async add(variationId, quantity, modifierIds) {
      try {
        const id = cart?.id ?? (await api<CartView>('/api/v1/cart', { method: 'POST' })).id;
        setCart(await api<CartView>(`/api/v1/cart/${id}/items`, { method: 'POST', body: JSON.stringify({ variationId, quantity, modifierIds }) }));
        flash('Added to your bag'); return true;
      } catch (e) { flash((e as Error).message); return false; }
    },
    async setQuantity(itemId, quantity) {
      if (!cart) return;
      try { setCart(await api<CartView>(`/api/v1/cart/${cart.id}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) })); }
      catch (e) { flash((e as Error).message); }
    },
    async remove(itemId) {
      if (!cart) return;
      try { setCart(await api<CartView>(`/api/v1/cart/${cart.id}/items/${itemId}`, { method: 'DELETE' })); } catch (e) { flash((e as Error).message); }
    },
  }), [cart, loading, error, toast, refresh]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 md:bottom-8 z-50 flex justify-center px-4">
        {toast && <div className="pointer-events-auto rounded-full bg-ink px-5 py-3 text-sm font-medium text-white shadow-lg">{toast}</div>}
      </div>
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}
export { api };
