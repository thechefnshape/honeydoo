import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { requireMerchant } from '@/server/merchant-auth';
import { merchantOverview, readiness, updateSettings } from '@/server/merchant';

export const GET = handler(async () => {
  const s = await requireMerchant();
  const o = await merchantOverview(s.merchantId);
  // Credentials never leave the server.
  return ok({ data: { ...o, integration: o.integration && { ...o.integration }, readiness: await readiness(s.merchantId) } });
});

const Hours = z.record(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), z.array(z.tuple([z.string().regex(/^\d\d:\d\d$/), z.string().regex(/^\d\d:\d\d$/)])).max(3));
const B = z.object({
  displayName: z.string().trim().min(2).max(80).optional(), description: z.string().max(600).optional(),
  contactEmail: z.string().email().max(200).optional(), contactPhone: z.string().max(40).optional(),
  locations: z.array(z.object({ id: z.string().uuid(), active: z.boolean(), pickupEnabled: z.boolean(), prepMinutes: z.number().int().min(0).max(240), pickupHours: Hours.nullable().optional() })).max(50).optional(),
});

export const PATCH = handler(async (req: Request) => {
  const s = await requireMerchant();
  await updateSettings(s.merchantId, await body(req, B), s.sub);
  return ok({ data: await merchantOverview(s.merchantId) });
});
