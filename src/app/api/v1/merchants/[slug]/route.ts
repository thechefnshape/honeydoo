import { handler, HttpError, ok } from '@/lib/http';
import { getMerchant, listProducts } from '@/server/catalog';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const params = await ctx.params;
  const m = await getMerchant(params.slug);
  if (!m) throw new HttpError(404, 'merchant_not_found', 'Shop not found.');
  return ok({ data: { ...m, products: await listProducts({ merchantSlug: m.slug }) } });
});
