import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { maybeSessionId } from '@/lib/session';
import { signIn } from '@/server/accounts';
import { setCustomerCookie } from '@/server/customer-session';

const B = z.object({ email: z.string().max(200), password: z.string().max(200) });

export const POST = handler(async (req: Request) => {
  const b = await body(req, B);
  // Per address and per account, so one IP cannot guess passwords and one account cannot be hammered from many IPs.
  const slow = 'Too many sign-in attempts. Wait 15 minutes and try again.';
  if (!rateLimit(`signin:ip:${clientKey(req)}`, 30, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', slow);
  if (!rateLimit(`signin:email:${b.email.trim().toLowerCase()}`, 10, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', slow);
  const { customer, token } = await signIn(b, await maybeSessionId());
  await setCustomerCookie(token);
  return ok({ data: { customer } });
});
