import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { maybeSessionId, sessionId as requireSessionId, SESSION_COOKIE } from '@/lib/session';
import { randomToken } from '@/lib/crypto';
import { customerFromToken, revokeSession, SESSION_TTL_DAYS, type Customer } from './accounts';

export const CUSTOMER_COOKIE = 'hd_c';

export async function setCustomerCookie(token: string) {
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env().APP_URL.startsWith('https'), path: '/', maxAge: SESSION_TTL_DAYS * 86400,
  });
}

/** Ends the account session and gives this browser a fresh guest session, so nothing from the account stays visible here. */
export async function signOutBrowser() {
  const jar = await cookies();
  await revokeSession(jar.get(CUSTOMER_COOKIE)?.value);
  jar.delete(CUSTOMER_COOKIE);
  jar.set(SESSION_COOKIE, randomToken(24), { httpOnly: true, sameSite: 'lax', secure: env().APP_URL.startsWith('https'), path: '/', maxAge: 60 * 60 * 24 * 180 });
}

export async function currentCustomer(): Promise<Customer | null> {
  return customerFromToken((await cookies()).get(CUSTOMER_COOKIE)?.value);
}

export async function customerToken() { return (await cookies()).get(CUSTOMER_COOKIE)?.value ?? null; }

export async function requireCustomer(): Promise<Customer> {
  const c = await currentCustomer();
  if (!c) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
  return c;
}

/** Who is shopping: always a browser session, plus the account when signed in. */
export async function shopper(): Promise<{ sessionId: string; customerId: string | null }> {
  const [sid, c] = await Promise.all([requireSessionId(), currentCustomer()]);
  return { sessionId: sid, customerId: c?.id ?? null };
}
export async function maybeShopper(): Promise<{ sessionId: string | null; customerId: string | null }> {
  const [sid, c] = await Promise.all([maybeSessionId(), currentCustomer()]);
  return { sessionId: sid, customerId: c?.id ?? null };
}

/** [sessionId, customerId] for ownership checks. */
export async function owner(): Promise<[string, string | null]> {
  const s = await shopper();
  return [s.sessionId, s.customerId];
}
