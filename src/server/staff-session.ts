import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { revokeStaffSession, staffFromToken, STAFF_SESSION_HOURS, type Staff } from './staff';

const COOKIE = 'hd_staff';

export async function setStaffCookie(token: string) {
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: env().APP_URL.startsWith('https'), path: '/', maxAge: STAFF_SESSION_HOURS * 3600 });
}
export async function signOutStaff() {
  const jar = await cookies();
  await revokeStaffSession(jar.get(COOKIE)?.value);
  jar.delete(COOKIE);
}
export async function currentStaff(): Promise<Staff | null> { return staffFromToken((await cookies()).get(COOKIE)?.value); }

/** For API routes. */
export async function requireStaff(role?: 'owner'): Promise<Staff> {
  const s = await currentStaff();
  if (!s) throw new HttpError(401, 'unauthorized', 'Sign in to continue.');
  if (role && s.role !== role) throw new HttpError(403, 'forbidden', 'Only owners can do that.');
  return s;
}
/** For admin pages: sends signed-out visitors to the staff sign-in. */
export async function staffPage(): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect('/admin/login');
  return s;
}
