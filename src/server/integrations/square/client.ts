import { env } from '@/lib/env';
import { squareBase } from './config';

export class SquareApiError extends Error {
  constructor(public status: number, public errors: { category?: string; code?: string; detail?: string; field?: string }[], public path: string) {
    super(`Square ${status} on ${path}: ${errors.map((e) => e.code).join(', ') || 'unknown error'}`);
  }
  get isAuth() { return this.status === 401 || this.errors.some((e) => e.category === 'AUTHENTICATION_ERROR'); }
}

let fetcher: typeof fetch = (...a) => fetch(...a);
/** Tests inject a fake Square here. */
export function setSquareFetch(f: typeof fetch) { fetcher = f; }

export async function squareRequest<T = any>(path: string, opts: { token?: string; method?: string; body?: unknown; authHeader?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Square-Version': env().SQUARE_API_VERSION, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (opts.authHeader) headers.Authorization = opts.authHeader;
  else if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetcher(`${squareBase()}${path}`, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new SquareApiError(res.status, json.errors ?? [], path);
  return json as T;
}

/** Square money is { amount, currency } with integer minor units. */
export const money = (amount: number, currency = 'USD') => ({ amount, currency });
export const amountOf = (m?: { amount?: number | string | null } | null) => (m?.amount === undefined || m?.amount === null ? 0 : Number(m.amount));
