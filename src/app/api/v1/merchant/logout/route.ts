import { handler, ok } from '@/lib/http';
import { clearMerchantSession } from '@/server/merchant-auth';
export const POST = handler(async () => { await clearMerchantSession(); return ok({ data: { signedOut: true } }); });
