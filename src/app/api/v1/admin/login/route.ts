import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { signInStaff } from '@/server/staff';
import { setStaffCookie } from '@/server/staff-session';

const B = z.object({ email: z.string().max(200), password: z.string().max(200), code: z.string().max(12) });

export const POST = handler(async (req: Request) => {
  const ip = clientKey(req);
  if (!rateLimit(`staff-login:${ip}`, 20, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');
  const { staff, token } = await signInStaff(await body(req, B), ip);
  await setStaffCookie(token);
  return ok({ data: { name: staff.name } });
});
