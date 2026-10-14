import { handler, ok } from '@/lib/http';
import { listCategories } from '@/server/catalog';
export const GET = handler(async () => ok({ data: await listCategories() }));
