import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { maybeSessionId } from '@/lib/session';
import { track } from '@/lib/analytics';
import { searchCatalog } from '@/server/search';

const B = z.object({ query: z.string().max(300).default(''), category: z.string().max(40).optional(), maxPriceMinor: z.number().int().positive().optional(),
  pickupToday: z.boolean().optional(), availableOnly: z.boolean().optional(), limit: z.number().int().min(1).max(60).default(40) });

export const POST = handler(async (req: Request) => {
  if (!rateLimit(`search:${clientKey(req)}`, 60, 60_000).ok) throw new HttpError(429, 'rate_limited', 'Too many searches. Wait a moment and try again.');
  const b = await body(req, B);
  const results = await searchCatalog(b);
  await track('search_performed', { sessionId: await maybeSessionId(), properties: { q: b.query.slice(0, 80), results: results.length, category: b.category } });
  return ok({ data: results.map((r) => r.product) });
});
