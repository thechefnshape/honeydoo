import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { maybeSessionId } from '@/lib/session';
import { track } from '@/lib/analytics';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { assist, fallbackAssist } from '@/server/ai/assistant';

const B = z.object({ message: z.string().trim().min(2).max(500) });

export const POST = handler(async (req: Request) => {
  const key = clientKey(req);
  if (!rateLimit(`ai:${key}`, 15, 60_000).ok) throw new HttpError(429, 'rate_limited', 'You are asking quickly. Wait a few seconds and try again.');
  const { message } = await body(req, B);
  const sid = await maybeSessionId();
  // Global daily budget: past it, keep serving deterministic results instead of failing.
  const d = await db();
  const used = (await d.query(`select count(*)::int as n from ai_requests where created_at > now() - interval '1 day' and not used_fallback`)).rows[0].n;
  const result = used >= env().AI_DAILY_REQUEST_LIMIT ? await fallbackAssist(message) : await assist(message, { sessionId: sid ?? undefined });
  await track('ai_search_performed', { sessionId: sid, properties: { mode: result.mode, results: result.recommendations.length } });
  return ok({ data: result });
});
