import { z } from 'zod';
import { body, handler, HttpError, ok } from '@/lib/http';
import { isDemoMode } from '@/lib/env';
import { db } from '@/lib/db';
import { setMerchantSession } from '@/server/merchant-auth';

const B = z.object({ slug: z.string().max(80) });

/** Demo-only sign-in to explore the dashboard as a demonstration shop. Disabled when DEMO_MODE=false. */
export const POST = handler(async (req: Request) => {
  if (!isDemoMode()) throw new HttpError(404, 'not_found', 'Not found.');
  const { slug } = await body(req, B);
  const d = await db();
  const m = (await d.query(`select id from merchants where slug = $1 and is_demo`, [slug])).rows[0];
  if (!m) throw new HttpError(404, 'merchant_not_found', 'Demo shop not found.');
  const sub = `demo:${slug}`;
  await d.query(`insert into merchant_members(merchant_id, user_ref, role) values ($1,$2,'owner') on conflict do nothing`, [m.id, sub]);
  await setMerchantSession(m.id, sub);
  return ok({ data: { merchantId: m.id } });
});
