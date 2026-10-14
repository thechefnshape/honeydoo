import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { maybeSessionId } from '@/lib/session';
import { track } from '@/lib/analytics';
import { signUp } from '@/server/accounts';
import { setCustomerCookie } from '@/server/customer-session';

const B = z.object({ name: z.string(), email: z.string(), password: z.string() });

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`signup:${clientKey(req)}`, 10, 60 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many sign-up attempts. Try again later.');
  const b = await body(req, B);
  const sid = await maybeSessionId();
  const { customer, token } = await signUp(b, sid);
  await setCustomerCookie(token);
  await track('account_created', { sessionId: sid, customerId: customer.id });
  return ok({ data: { customer } }, 201);
});
