import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { resetPassword } from '@/server/accounts';
import { setCustomerCookie } from '@/server/customer-session';

const B = z.object({ token: z.string().max(100), password: z.string() });

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`reset:${clientKey(req)}`, 10, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');
  const b = await body(req, B);
  const { token } = await resetPassword(b.token, b.password);
  await setCustomerCookie(token);
  return ok({ data: { reset: true } });
});
