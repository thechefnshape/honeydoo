import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { requireMerchant } from '@/server/merchant-auth';
import { setProductVisibility } from '@/server/merchant';

const B = z.object({ visible: z.boolean() });
export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const params = await ctx.params;
  const s = await requireMerchant();
  const b = await body(req, B);
  await setProductVisibility(s.merchantId, z.string().uuid().parse(params.id), b.visible, s.sub);
  return ok({ data: { id: params.id, visible: b.visible } });
});
