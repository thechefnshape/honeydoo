import { z } from 'zod';
import { handler, ok } from '@/lib/http';
import { requireMerchant } from '@/server/merchant-auth';
import { merchantProducts } from '@/server/merchant';

const Q = z.object({ status: z.enum(['all', 'published', 'hidden', 'removed']).default('all'), q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100), offset: z.coerce.number().int().min(0).default(0) });

export const GET = handler(async (req: Request) => {
  const s = await requireMerchant();
  const q = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok({ data: await merchantProducts(s.merchantId, q) });
});
