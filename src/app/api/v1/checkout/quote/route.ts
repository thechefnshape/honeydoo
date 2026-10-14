import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { owner } from '@/server/customer-session';
import { db } from '@/lib/db';
import { assertCartOwner } from '@/server/cart';
import { quoteMerchant } from '@/server/pricing';

const B = z.object({ cartId: z.string().uuid(), merchantId: z.string().uuid(), tipMinor: z.number().int().min(0).max(10000).optional() });

export const POST = handler(async (req: Request) => {
  const b = await body(req, B);
  await assertCartOwner(b.cartId, ...(await owner()));
  const d = await db();
  return ok({ data: await quoteMerchant(d, b) });
});
