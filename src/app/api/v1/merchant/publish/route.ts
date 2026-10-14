import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { requireMerchant } from '@/server/merchant-auth';
import { pauseStorefront, publishStorefront, readiness } from '@/server/merchant';

const B = z.object({ action: z.enum(['publish', 'pause']).default('publish') });
export const POST = handler(async (req: Request) => {
  const s = await requireMerchant();
  const b = await body(req, B);
  if (b.action === 'pause') await pauseStorefront(s.merchantId, s.sub); else await publishStorefront(s.merchantId, s.sub);
  return ok({ data: await readiness(s.merchantId) });
});
