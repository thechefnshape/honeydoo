import { z } from 'zod';
import { handler, ok } from '@/lib/http';
import { listProducts } from '@/server/catalog';

const Q = z.object({ category: z.string().max(40).optional(), merchant: z.string().max(80).optional(), featured: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40), offset: z.coerce.number().int().min(0).default(0) });

export const GET = handler(async (req: Request) => {
  const q = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const data = await listProducts({ category: q.category, merchantSlug: q.merchant, featured: q.featured === 'true', limit: q.limit, offset: q.offset });
  return ok({ data, pagination: { limit: q.limit, offset: q.offset, next: data.length === q.limit ? q.offset + q.limit : null } });
});
