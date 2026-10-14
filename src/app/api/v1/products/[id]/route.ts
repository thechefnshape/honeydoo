import { handler, HttpError, ok } from '@/lib/http';
import { getProduct } from '@/server/catalog';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const p = await getProduct(params.id);
  if (!p) throw new HttpError(404, 'product_not_found', 'Product not found.');
  return ok({ data: p });
});
