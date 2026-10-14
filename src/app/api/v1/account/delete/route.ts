import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { deleteAccount } from '@/server/accounts';
import { requireCustomer, signOutBrowser } from '@/server/customer-session';

const B = z.object({ password: z.string().max(200) });

export const POST = handler(async (req: Request) => {
  const c = await requireCustomer();
  if (!rateLimit(`delete:${c.id}`, 5, 15 * 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait 15 minutes and try again.');
  await deleteAccount(c.id, (await body(req, B)).password);
  await signOutBrowser();
  return ok({ data: { deleted: true } });
});
