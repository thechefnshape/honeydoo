import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { clientKey } from '@/lib/ratelimit';
import { requireMerchant } from '@/server/merchant-auth';
import { acceptTerms, MERCHANT_TERMS_VERSION } from '@/server/merchant';

const B = z.object({ accept: z.literal(true), version: z.literal(MERCHANT_TERMS_VERSION) });
export const POST = handler(async (req: Request) => {
  const s = await requireMerchant();
  await body(req, B);
  await acceptTerms(s.merchantId, s.sub, clientKey(req));
  return ok({ data: { accepted: true, version: MERCHANT_TERMS_VERSION } });
});
