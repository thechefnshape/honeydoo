import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/http';
import { randomToken } from '@/lib/crypto';
import { requestedScopes, squareBase } from './config';
import { squareRequest } from './client';

const STATE_TTL_MIN = 10;

/** Creates a single-use, short-lived CSRF state bound to the browser that started the flow. */
export async function createOAuthState(args: { initiatedBy: string; merchantId?: string | null; redirectAfter?: string }) {
  const d = await db();
  const state = randomToken(32);
  await d.query(`insert into oauth_states(state, provider, merchant_id, initiated_by, redirect_after, expires_at)
                 values ($1,'square',$2,$3,$4, now() + interval '${STATE_TTL_MIN} minutes')`, [state, args.merchantId ?? null, args.initiatedBy, args.redirectAfter ?? null]);
  return state;
}

/** Validates and burns the state. Fails if unknown, expired, reused, or started by a different browser. */
export async function consumeOAuthState(state: string | null, initiatedBy: string) {
  if (!state || state.length < 20) throw new HttpError(400, 'invalid_state', 'This connection link is invalid. Start again from Honeydoo.');
  const d = await db();
  const r = await d.query(
    `update oauth_states set consumed_at = now()
      where state = $1 and provider = 'square' and consumed_at is null and expires_at > now() and initiated_by = $2
      returning merchant_id, redirect_after`, [state, initiatedBy]);
  if (!r.rows[0]) throw new HttpError(400, 'invalid_state', 'This connection link expired or was already used. Start again from Honeydoo.');
  return r.rows[0] as { merchant_id: string | null; redirect_after: string | null };
}

export function authorizeUrl(state: string) {
  const e = env();
  const p = new URLSearchParams({ client_id: e.SQUARE_APPLICATION_ID!, scope: requestedScopes().join(' '), session: 'false', state, redirect_uri: e.SQUARE_REDIRECT_URI! });
  return `${squareBase()}/oauth2/authorize?${p.toString()}`;
}

export interface TokenSet { accessToken: string; refreshToken: string; expiresAt: Date; merchantId: string; scopes: string[] }

function toTokens(j: any, fallbackScopes: string[]): TokenSet {
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(j.expires_at), merchantId: j.merchant_id,
    scopes: typeof j.scope === 'string' ? j.scope.split(/[\s,]+/).filter(Boolean) : fallbackScopes };
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const e = env();
  const j = await squareRequest('/oauth2/token', { body: { client_id: e.SQUARE_APPLICATION_ID, client_secret: e.SQUARE_APPLICATION_SECRET, code, grant_type: 'authorization_code', redirect_uri: e.SQUARE_REDIRECT_URI } });
  return toTokens(j, requestedScopes());
}

export async function refreshTokens(refreshToken: string, scopes: string[]): Promise<TokenSet> {
  const e = env();
  const j = await squareRequest('/oauth2/token', { body: { client_id: e.SQUARE_APPLICATION_ID, client_secret: e.SQUARE_APPLICATION_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' } });
  return { ...toTokens(j, scopes), refreshToken: j.refresh_token ?? refreshToken };
}

export async function revokeAccess(squareMerchantId: string) {
  const e = env();
  await squareRequest('/oauth2/revoke', { authHeader: `Client ${e.SQUARE_APPLICATION_SECRET}`, body: { client_id: e.SQUARE_APPLICATION_ID, merchant_id: squareMerchantId } });
}
