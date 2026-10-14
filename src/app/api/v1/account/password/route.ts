import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { changePassword } from '@/server/accounts';
import { customerToken, requireCustomer } from '@/server/customer-session';

const B = z.object({ current: z.string().max(200), next: z.string() });

export const POST = handler(async (req: Request) => {
  const c = await requireCustomer();
  if (!rateLimit(`pw:${c.id}`, 10, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');
  const b = await body(req, B);
  await changePassword(c.id, b.current, b.next, await customerToken());
  return ok({ data: { changed: true } });
});
