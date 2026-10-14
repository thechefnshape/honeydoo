import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { hmac, safeEqual } from '@/lib/crypto';
import { HttpError } from '@/lib/http';
import { db } from '@/lib/db';

const COOKIE = 'hd_m';
const TTL_S = 60 * 60 * 12;

export interface MerchantSession { merchantId: string; sub: string; exp: number }

export function signSession(s: MerchantSession) {
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${payload}.${hmac(env().SESSION_SECRET, payload)}`;
}
export function verifySession(token: string | undefined): MerchantSession | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(hmac(env().SESSION_SECRET, payload), sig)) return null;
  const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as MerchantSession;
  return s.exp > Date.now() / 1000 ? s : null;
}

export async function setMerchantSession(merchantId: string, sub: string) {
  (await cookies()).set(COOKIE, signSession({ merchantId, sub, exp: Math.floor(Date.now() / 1000) + TTL_S }), {
    httpOnly: true, sameSite: 'lax', secure: env().APP_URL.startsWith('https'), path: '/', maxAge: TTL_S,
  });
}
export async function clearMerchantSession() { (await cookies()).delete(COOKIE); }

/** Every merchant API checks membership on each request, so a forged or stale merchant id gets nothing. */
export async function requireMerchant(): Promise<MerchantSession & { name: string; slug: string; isDemo: boolean }> {
  const s = verifySession((await cookies()).get(COOKIE)?.value);
  if (!s) throw new HttpError(401, 'unauthorized', 'Sign in to manage your shop.');
  const d = await db();
  const r = (await d.query(`select m.display_name, m.slug, m.is_demo from merchant_members mm join merchants m on m.id = mm.merchant_id where mm.merchant_id = $1 and mm.user_ref = $2`, [s.merchantId, s.sub])).rows[0];
  if (!r) throw new HttpError(403, 'forbidden', 'You do not have access to this shop.');
  return { ...s, name: r.display_name, slug: r.slug, isDemo: r.is_demo };
}

export async function currentMerchant() { try { return await requireMerchant(); } catch { return null; } }
