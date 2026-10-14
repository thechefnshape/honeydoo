import { handler, ok } from '@/lib/http';
import { owner } from '@/server/customer-session';
import { assertCartOwner, getCartView } from '@/server/cart';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  await assertCartOwner(params.id, ...(await owner()));
  return ok({ data: await getCartView(params.id) });
});
