import { handler, ok } from '@/lib/http';
import { signOutStaff } from '@/server/staff-session';

export const POST = handler(async () => { await signOutStaff(); return ok({ data: { signedOut: true } }); });
