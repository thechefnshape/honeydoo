import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { requestPasswordReset } from '@/server/accounts';

const B = z.object({ email: z.string() });

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`forgot:${clientKey(req)}`, 5, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many requests. Wait 15 minutes and try again.');
  const b = await body(req, B);
  if (!rateLimit(`forgot:email:${b.email.trim().toLowerCase()}`, 3, 60 * 60_000).ok) return ok({ data: { sent: true } });
  await requestPasswordReset(b.email);
  return ok({ data: { sent: true } });
});
