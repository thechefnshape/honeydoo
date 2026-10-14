import { cookies } from 'next/headers';
import { HttpError } from './http';

export const SESSION_COOKIE = 'hd_sid';

/** Anonymous shopper session (set by middleware). Opaque, random, httpOnly. */
export async function sessionId(): Promise<string> {
  const v = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!v || v.length < 20) throw new HttpError(401, 'no_session', 'Your session expired. Refresh the page and try again.');
  return v;
}

export async function maybeSessionId(): Promise<string | null> {
  const v = (await cookies()).get(SESSION_COOKIE)?.value;
  return v && v.length >= 20 ? v : null;
}
