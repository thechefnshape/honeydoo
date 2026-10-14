import { current, emit, navigate, routeParams, useLocation } from './router';
export function useRouter() { return { push: (to: string) => navigate(to), replace: (to: string) => navigate(to), refresh: () => emit(), back: () => history.back() }; }
export function useSearchParams() { return useLocation().search; }
export function usePathname() { return useLocation().path; }
export function useParams<T>() { useLocation(); return routeParams as T; }
export function notFound(): never { throw new Error('not found'); }
export function redirect(to: string): never { navigate(to); throw new Error('redirect'); }
export { current };
