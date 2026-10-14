import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { owner } from '@/server/customer-session';
import { assertCartOwner, getCartView, removeItem, updateItem } from '@/server/cart';

const B = z.object({ quantity: z.number().int().min(1).max(50) });
type P = { params: Promise<{ id: string; itemId: string }> };

export const PATCH = handler(async (req: Request, ctx: P) => {
  const params = await ctx.params;
  await assertCartOwner(params.id, ...(await owner()));
  const b = await body(req, B);
  await updateItem(params.id, z.string().uuid().parse(params.itemId), b.quantity);
  return ok({ data: await getCartView(params.id) });
});

export const DELETE = handler(async (_req: Request, ctx: P) => {
  const params = await ctx.params;
  await assertCartOwner(params.id, ...(await owner()));
  await removeItem(params.id, z.string().uuid().parse(params.itemId));
  return ok({ data: await getCartView(params.id) });
});
