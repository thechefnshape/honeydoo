import { z } from 'zod';
import { cookies } from 'next/headers';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { shopper } from '@/server/customer-session';
import { assertCartOwner } from '@/server/cart';
import { createCheckout } from '@/server/checkout';

const B = z.object({
  cartId: z.string().uuid(), merchantId: z.string().uuid(), quoteHash: z.string().min(16).max(64),
  contact: z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(200) }),
  pickupNote: z.string().max(300).optional(), tipMinor: z.number().int().min(0).max(10000).optional(),
  authorize: z.literal(true, { errorMap: () => ({ message: 'Confirm the order total to continue.' }) }),
});

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`checkout:${clientKey(req)}`, 20, 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many attempts. Wait a minute and try again.');
  const { sessionId: sid, customerId } = await shopper();
  const b = await body(req, B);
  await assertCartOwner(b.cartId, sid, customerId);
  const out = await createCheckout({ sessionId: sid, customerId, cartId: b.cartId, merchantId: b.merchantId, quoteHash: b.quoteHash, contact: b.contact,
    pickupNote: b.pickupNote, tipMinor: b.tipMinor, referralSource: (await cookies()).get('hd_ref')?.value });
  return ok({ data: out }, out.reused ? 200 : 201);
});
