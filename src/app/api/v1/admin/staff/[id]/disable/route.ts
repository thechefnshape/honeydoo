import { z } from 'zod';
import { handler, ok } from '@/lib/http';
import { disableStaff } from '@/server/staff';
import { requireStaff } from '@/server/staff-session';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireStaff('owner');
  await disableStaff(actor, z.string().uuid().parse((await ctx.params).id));
  return ok({ data: { disabled: true } });
});
