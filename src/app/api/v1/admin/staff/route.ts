import { z } from 'zod';
import { body, handler, ok } from '@/lib/http';
import { inviteStaff, listStaff } from '@/server/staff';
import { requireStaff } from '@/server/staff-session';

export const GET = handler(async () => { await requireStaff(); return ok({ data: await listStaff() }); });

const B = z.object({ email: z.string(), name: z.string(), role: z.enum(['owner', 'analyst']) });
export const POST = handler(async (req: Request) => {
  const actor = await requireStaff('owner');
  const out = await inviteStaff(await body(req, B), actor);
  // The link is returned once to the inviting owner and never stored or logged.
  return ok({ data: { setupUrl: out.setupUrl } }, 201);
});
