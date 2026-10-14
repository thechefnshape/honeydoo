import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, fakeSquare, squareMerchant, SESSION } from './helpers';
import { authorizeUrl, consumeOAuthState, createOAuthState } from '../src/server/integrations/square/oauth';
import { accessTokenFor } from '../src/server/integrations/square/credentials';
import { decryptSecret, encryptSecret } from '../src/lib/crypto';
import { signSession, verifySession } from '../src/server/merchant-auth';
import type { Db } from '../src/lib/db';

let db: Db;
beforeAll(async () => { db = await freshDb(false); });

describe('Merchant OAuth state', () => {
  it('is single-use and bound to the browser that started it', async () => {
    const state = await createOAuthState({ initiatedBy: SESSION });
    await expect(consumeOAuthState(state, 'another-browser-session-xxxx')).rejects.toThrow(/expired or was already used/);
    await expect(consumeOAuthState(state, SESSION)).resolves.toBeTruthy();
    await expect(consumeOAuthState(state, SESSION)).rejects.toThrow(/already used/);
  });
  it('rejects missing, unknown and expired states', async () => {
    await expect(consumeOAuthState(null, SESSION)).rejects.toThrow();
    await expect(consumeOAuthState('x'.repeat(40), SESSION)).rejects.toThrow();
    const s = await createOAuthState({ initiatedBy: SESSION });
    await db.query(`update oauth_states set expires_at = now() - interval '1 minute' where state = $1`, [s]);
    await expect(consumeOAuthState(s, SESSION)).rejects.toThrow();
  });
  it('requests least-privilege scopes on the sandbox host', () => {
    const u = new URL(authorizeUrl('state123'));
    expect(u.host).toBe('connect.squareupsandbox.com');
    const scopes = u.searchParams.get('scope')!.split(' ');
    expect(scopes).toContain('ITEMS_READ');
    expect(scopes).toContain('PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS');
    expect(scopes).not.toContain('ITEMS_WRITE');
    expect(scopes).not.toContain('CUSTOMERS_WRITE');
  });
});

describe('Token storage and refresh', () => {
  it('encrypts tokens at rest and detects tampering', () => {
    const env = encryptSecret('EAAA-secret', process.env.TOKEN_ENCRYPTION_KEY);
    expect(env).not.toContain('EAAA');
    expect(decryptSecret(env, process.env.TOKEN_ENCRYPTION_KEY)).toBe('EAAA-secret');
    const parts = env.split('.'); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'B' : 'A') + parts[3].slice(-1);
    expect(() => decryptSecret(parts.join('.'), process.env.TOKEN_ENCRYPTION_KEY)).toThrow();
  });
  it('refreshes a token close to expiry and stores the new one', async () => {
    const { integrationId } = await squareMerchant(db);
    await db.query(`update merchant_integrations set token_expires_at = now() + interval '1 day' where id = $1`, [integrationId]);
    fakeSquare((m, p, b) => m === 'POST' && p === '/oauth2/token' && b.grant_type === 'refresh_token' && b.refresh_token === 'EQAA-refresh'
      ? [200, { access_token: 'EAAA-new', refresh_token: 'EQAA-refresh', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), merchant_id: 'SQ_MERCHANT_1' }] : undefined);
    expect(await accessTokenFor(integrationId)).toBe('EAAA-new');
    const row = (await db.query(`select token_expires_at, connection_status, encrypted_credentials_reference from merchant_integrations where id = $1`, [integrationId])).rows[0];
    expect(new Date(row.token_expires_at).getTime()).toBeGreaterThan(Date.now() + 20 * 864e5);
    expect(row.encrypted_credentials_reference).not.toContain('EAAA-new');
  });
  it('marks the connection as needing re-authorization when refresh is rejected', async () => {
    const { integrationId } = (await db.query(`select id as "integrationId" from merchant_integrations limit 1`)).rows[0];
    await db.query(`update merchant_integrations set token_expires_at = now() where id = $1`, [integrationId]);
    fakeSquare((m, p) => (p === '/oauth2/token' ? [401, { errors: [{ category: 'AUTHENTICATION_ERROR', code: 'UNAUTHORIZED' }] }] : undefined));
    await expect(accessTokenFor(integrationId)).rejects.toThrow(/reconnected/);
    expect((await db.query(`select connection_status from merchant_integrations where id = $1`, [integrationId])).rows[0].connection_status).toBe('needs_reauth');
  });
});

describe('Merchant session cookies', () => {
  it('rejects forged or expired sessions', () => {
    const good = signSession({ merchantId: 'm1', sub: 'u1', exp: Math.floor(Date.now() / 1000) + 60 });
    expect(verifySession(good)?.merchantId).toBe('m1');
    const [payload] = good.split('.');
    const forged = Buffer.from(JSON.stringify({ merchantId: 'm2', sub: 'u1', exp: 9e9 })).toString('base64url') + '.' + good.split('.')[1];
    expect(verifySession(forged)).toBeNull();
    expect(verifySession(payload + '.bad')).toBeNull();
    expect(verifySession(signSession({ merchantId: 'm1', sub: 'u1', exp: 1 }))).toBeNull();
  });
});
