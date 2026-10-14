import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { shopper } from '@/server/customer-session';
import { track } from '@/lib/analytics';
import { addItem, assertCartOwner, getCartView } from '@/server/cart';

const B = z.object({ variationId: z.string().uuid(), quantity: z.number().int().min(1).max(50).default(1), modifierIds: z.array(z.string().uuid()).max(20).default([]) });

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  if (!rateLimit(`cart:${clientKey(req)}`, 120, 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many changes. Wait a moment.');
  const { sessionId: sid, customerId } = await shopper();
  await assertCartOwner(params.id, sid, customerId);
  const b = await body(req, B);
  const sel = await addItem(params.id, b);
  await track('product_added_to_bag', { sessionId: sid, customerId, merchantId: sel.merchantId, productId: sel.productId, properties: { quantity: b.quantity } });
  return ok({ data: await getCartView(params.id) }, 201);
});
