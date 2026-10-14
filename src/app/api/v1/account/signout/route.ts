import { handler, ok } from '@/lib/http';
import { signOutBrowser } from '@/server/customer-session';

export const POST = handler(async () => {
  await signOutBrowser();
  return ok({ data: { signedOut: true } });
});
