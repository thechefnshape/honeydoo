import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { completeSetup } from '@/server/staff';
import { setStaffCookie } from '@/server/staff-session';

const B = z.object({ token: z.string().max(100), password: z.string().max(200), code: z.string().max(12) });

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`staff-setup:${clientKey(req)}`, 15, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');
  const b = await body(req, B);
  const { token } = await completeSetup(b.token, b.password, b.code);
  await setStaffCookie(token);
  return ok({ data: { done: true } });
});
