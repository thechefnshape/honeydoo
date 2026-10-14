import { db, type Queryable } from '@/lib/db';
import { env } from '@/lib/env';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { HttpError } from '@/lib/http';
import { refreshTokens, type TokenSet } from './oauth';
import { SquareApiError } from './client';

const REFRESH_BEFORE_MS = 7 * 24 * 3600 * 1000;

export function sealTokens(t: Pick<TokenSet, 'accessToken' | 'refreshToken'>) {
  return encryptSecret(JSON.stringify({ a: t.accessToken, r: t.refreshToken }), env().TOKEN_ENCRYPTION_KEY);
}
function openTokens(envelope: string): { a: string; r: string } {
  return JSON.parse(decryptSecret(envelope, env().TOKEN_ENCRYPTION_KEY));
}

/** Returns a usable access token, refreshing it when close to expiry. Tokens are never logged or returned to clients. */
export async function accessTokenFor(integrationId: string, q?: Queryable): Promise<string> {
  const d = q ?? (await db());
  const r = (await d.query(`select * from merchant_integrations where id = $1 and provider = 'square'`, [integrationId])).rows[0];
  if (!r || !r.encrypted_credentials_reference) throw new HttpError(409, 'not_connected', 'Square is not connected for this shop.');
  if (r.connection_status === 'revoked' || r.connection_status === 'disconnected') throw new HttpError(409, 'not_connected', 'Square access was revoked for this shop.');
  const tokens = openTokens(r.encrypted_credentials_reference);
  if (r.token_expires_at && new Date(r.token_expires_at).getTime() - Date.now() > REFRESH_BEFORE_MS) return tokens.a;
  return (await refreshIntegration(integrationId, d)).accessToken;
}

export async function refreshIntegration(integrationId: string, d: Queryable) {
  const r = (await d.query(`select * from merchant_integrations where id = $1`, [integrationId])).rows[0];
  const tokens = openTokens(r.encrypted_credentials_reference);
  try {
    const t = await refreshTokens(tokens.r, r.granted_scopes ?? []);
    await d.query(`update merchant_integrations set encrypted_credentials_reference = $2, token_expires_at = $3, connection_status = 'connected', last_error = null, updated_at = now() where id = $1`,
      [integrationId, sealTokens(t), t.expiresAt]);
    return t;
  } catch (e) {
    const auth = e instanceof SquareApiError && (e.isAuth || e.status === 400);
    await d.query(`update merchant_integrations set connection_status = $2, last_error = $3, updated_at = now() where id = $1`,
      [integrationId, auth ? 'needs_reauth' : 'error', e instanceof Error ? e.message.slice(0, 300) : 'refresh failed']);
    throw new HttpError(409, 'needs_reauth', 'Square needs to be reconnected for this shop.');
  }
}
