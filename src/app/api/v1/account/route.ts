import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { updateProfile } from '@/server/accounts';
import { currentCustomer, requireCustomer } from '@/server/customer-session';

export const GET = handler(async () => ok({ data: { customer: await currentCustomer() } }));

const B = z.object({ name: z.string().optional(), phone: z.string().nullable().optional() });
export const PATCH = handler(async (req: Request) => {
  const c = await requireCustomer();
  return ok({ data: { customer: await updateProfile(c.id, await body(req, B)) } });
});
