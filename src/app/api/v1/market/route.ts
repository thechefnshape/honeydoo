import { z } from 'zod';
import { cookies } from 'next/headers';
import { body, handler, HttpError, ok } from '@/lib/http';
import { listMarkets } from '@/server/catalog';

const B = z.object({ market: z.string().max(60) });

/** Saves the shopper's chosen market. Precise device location is never stored. */
export const POST = handler(async (req: Request) => {
  const { market } = await body(req, B);
  const markets = await listMarkets();
  if (!markets.some((m) => m.slug === market)) throw new HttpError(404, 'market_not_found', 'Honeydoo is not in that city yet.');
  (await cookies()).set('hd_market', market, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return ok({ data: { market } });
});
