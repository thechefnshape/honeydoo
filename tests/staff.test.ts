import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from './helpers';
import { base32Encode, base32Decode, currentStep, totpAt, verifyTotp } from '../src/lib/totp';
import { beginSetup, completeSetup, disableStaff, inviteStaff, listStaff, signInStaff, staffFromToken, revokeStaffSession } from '../src/server/staff';
import type { Db } from '../src/lib/db';

let db: Db;
beforeAll(async () => { db = await freshDb(false); });

const code = (secret: string, offset = 0) => totpAt(secret, currentStep() + offset);
const tokenFrom = (url: string) => new URL(url).searchParams.get('token')!;

describe('TOTP', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    // RFC 6238 Appendix B: T = 59s -> 94287082 (8 digits); the 6-digit code is the last 6.
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
  });
  it('accepts one step of drift and rejects older codes', () => {
    const s = base32Encode(Buffer.from('abcdefghijabcdefghij'));
    expect(verifyTotp(s, code(s, -1))).not.toBeNull();
    expect(verifyTotp(s, code(s, -3))).toBeNull();
    expect(verifyTotp(s, 'abcdef')).toBeNull();
  });
});

describe('Staff accounts', () => {
  let ownerSecret = '', ownerToken = '', ownerId = '';

  it('sets up the first owner from an invite: QR secret, code, password, session', async () => {
    const inv = await inviteStaff({ email: 'Josh@Honeydoo.com', name: 'Josh', role: 'owner' }, null);
    expect((await db.query(`select count(*)::int as n from staff_invites where token_hash = $1`, [tokenFrom(inv.setupUrl)])).rows[0].n).toBe(0);
    const s1 = await beginSetup(tokenFrom(inv.setupUrl));
    expect((await beginSetup(tokenFrom(inv.setupUrl))).secret).toBe(s1.secret); // stable across reloads
    ownerSecret = s1.secret;
    const stored = (await db.query(`select totp_secret_enc from staff_users where id = $1`, [inv.staffId])).rows[0].totp_secret_enc;
    expect(stored).not.toContain(ownerSecret);
    await expect(completeSetup(tokenFrom(inv.setupUrl), 'short', code(ownerSecret))).rejects.toThrow(/12 characters/);
    await expect(completeSetup(tokenFrom(inv.setupUrl), 'a-long-staff-password', '000000')).rejects.toThrow(/did not match/);
    const done = await completeSetup(tokenFrom(inv.setupUrl), 'a-long-staff-password', code(ownerSecret));
    ownerToken = done.token; ownerId = done.staff.id;
    expect((await staffFromToken(ownerToken))?.role).toBe('owner');
    await expect(beginSetup(tokenFrom(inv.setupUrl))).rejects.toThrow(/expired or was already used/);
  });

  it('requires password and a fresh code, and blocks reusing a code', async () => {
    // The setup code was just used, so the same step cannot sign in again.
    await expect(signInStaff({ email: 'josh@honeydoo.com', password: 'a-long-staff-password', code: code(ownerSecret) }, 'ip')).rejects.toThrow(/not correct/);
    await db.query(`update staff_users set totp_last_step = $2 where id = $1`, [ownerId, currentStep() - 2]);
    const ok = await signInStaff({ email: 'josh@honeydoo.com', password: 'a-long-staff-password', code: code(ownerSecret) }, 'ip');
    expect(ok.staff.email).toBe('josh@honeydoo.com');
    await revokeStaffSession(ok.token);
    expect(await staffFromToken(ok.token)).toBeNull();
  });

  it('gives one error for every kind of failure and locks after 5', async () => {
    await db.query(`update staff_users set totp_last_step = 0 where id = $1`, [ownerId]);
    const before = (await db.query(`select count(*)::int as n from audit_log where action = 'staff.login_failed'`)).rows[0].n;
    const msgs = new Set<string>();
    msgs.add(await signInStaff({ email: 'nobody@honeydoo.com', password: 'x', code: '123456' }, 'ip').catch((e) => e.message));
    for (let i = 0; i < 4; i++) msgs.add(await signInStaff({ email: 'josh@honeydoo.com', password: 'wrong-password-123', code: code(ownerSecret) }, 'ip').catch((e) => e.message));
    expect([...msgs]).toEqual(['That email, password or code is not correct.']);
    await signInStaff({ email: 'josh@honeydoo.com', password: 'a-long-staff-password', code: '111111' }, 'ip').catch(() => {});
    await expect(signInStaff({ email: 'josh@honeydoo.com', password: 'a-long-staff-password', code: code(ownerSecret) }, 'ip')).rejects.toThrow(/Too many attempts/);
    const fails = (await db.query(`select count(*)::int as n from audit_log where action = 'staff.login_failed'`)).rows[0].n;
    expect(fails - before).toBe(5);
    await db.query(`update staff_users set locked_until = null where id = $1`, [ownerId]);
  });

  it('only owners invite and remove; removal ends sessions immediately', async () => {
    const owner = (await staffFromToken(ownerToken))!;
    const inv = await inviteStaff({ email: 'analyst@honeydoo.com', name: 'Ana', role: 'analyst' }, owner);
    const sec = (await beginSetup(tokenFrom(inv.setupUrl))).secret;
    await expect(completeSetup(tokenFrom(inv.setupUrl), 'analyst-password-1', code(sec))).rejects.toThrow(/email name/);
    const { staff: ana, token: anaToken } = await completeSetup(tokenFrom(inv.setupUrl), 'bright-orchard-41', code(sec));
    await expect(inviteStaff({ email: 'x@honeydoo.com', name: 'X', role: 'owner' }, ana)).rejects.toThrow(/Only owners/);
    await expect(disableStaff(ana, owner.id)).rejects.toThrow(/Only owners/);
    await expect(disableStaff(owner, owner.id)).rejects.toThrow(/your own access/);
    await expect(inviteStaff({ email: 'ANALYST@honeydoo.com', name: 'Ana', role: 'analyst' }, owner)).rejects.toThrow(/already has/);
    await disableStaff(owner, ana.id);
    expect(await staffFromToken(anaToken)).toBeNull();
    expect((await listStaff()).find((r) => r.id === ana.id)?.disabled).toBe(true);
    // A removed person can be re-invited, which resets their password and authenticator.
    const again = await inviteStaff({ email: 'analyst@honeydoo.com', name: 'Ana', role: 'analyst' }, owner);
    expect((await beginSetup(tokenFrom(again.setupUrl))).secret).not.toBe(sec);
  });
});
