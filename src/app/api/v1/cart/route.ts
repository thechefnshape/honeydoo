import { handler, ok } from '@/lib/http';
import { shopper } from '@/server/customer-session';
import { getCartView, getOrCreateCart } from '@/server/cart';

/** Returns the shopper's open bag, creating it if needed. */
export const POST = handler(async () => {
  const s = await shopper();
  const cart = await getOrCreateCart(s.sessionId, s.customerId);
  return ok({ data: await getCartView(cart.id) }, 201);
});
