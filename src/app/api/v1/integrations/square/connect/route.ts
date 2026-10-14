import { NextResponse } from 'next/server';
import { handler, HttpError } from '@/lib/http';
import { squareConfigured } from '@/lib/env';
import { sessionId } from '@/lib/session';
import { track } from '@/lib/analytics';
import { authorizeUrl, createOAuthState } from '@/server/integrations/square/oauth';
import { currentMerchant } from '@/server/merchant-auth';

export const GET = handler(async () => {
  if (!squareConfigured()) throw new HttpError(503, 'square_not_configured', 'Square is not configured on this Honeydoo environment yet.');
  const sid = await sessionId();
  const m = await currentMerchant();
  const state = await createOAuthState({ initiatedBy: sid, merchantId: m && !m.isDemo ? m.merchantId : null, redirectAfter: '/merchant' });
  await track('merchant_signup_started', { sessionId: sid });
  return NextResponse.redirect(authorizeUrl(state), 302);
});
