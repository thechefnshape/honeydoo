import { handler, ok } from '@/lib/http';
import { listMerchants } from '@/server/catalog';

export const GET = handler(async (req: Request) => {
  const u = new URL(req.url);
  const merchants = await listMerchants({ category: u.searchParams.get('category') ?? undefined, market: u.searchParams.get('market') ?? undefined });
  return ok({ data: merchants.map(({ email, ...m }) => m) });
});
