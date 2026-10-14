import { useEffect, useState } from 'react';
const listeners = new Set<() => void>();
export let routeParams: Record<string, string> = {};
export function setRouteParams(p: Record<string, string>) { routeParams = p; }
export function current() {
  const h = decodeURI(location.hash.slice(1)) || '/';
  const [path, qs = ''] = h.split('?');
  return { path: path || '/', search: new URLSearchParams(qs) };
}
export function emit() { listeners.forEach((f) => f()); }
window.addEventListener('hashchange', () => { emit(); window.scrollTo(0, 0); });
export function navigate(to: string) { if (('#' + to) === location.hash) emit(); else location.hash = to; }
export function useLocation() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return current();
}
