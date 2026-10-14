import { handler, ok } from '@/lib/http';
import { requireMerchant } from '@/server/merchant-auth';
import { merchantOrders } from '@/server/merchant';
export const GET = handler(async () => { const s = await requireMerchant(); return ok({ data: await merchantOrders(s.merchantId) }); });
