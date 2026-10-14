import { handler, ok } from '@/lib/http';
import { owner } from '@/server/customer-session';
import { getOrderForShopper } from '@/server/orders';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return ok({ data: await getOrderForShopper(id, ...(await owner())) });
});
