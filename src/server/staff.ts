import { z } from 'zod';
import { db, type Queryable } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { env } from '@/lib/env';
import { decryptSecret, encryptSecret, randomToken, sha256 } from '@/lib/crypto';
import { newTotpSecret, verifyTotp } from '@/lib/totp';
import { hashPassword, verifyPassword, Email, Name } from './accounts';

// Staff accounts for the honeydoo admin dashboard. Invite-only; every sign-in needs the password
// and a code from an authenticator app. Lockouts and sessions live in the database so they hold
// across server instances.

export type StaffRole = 'owner' | 'analyst';
export interface Staff { id: string; email: string; name: string; role: StaffRole }

export const STAFF_SESSION_HOURS = 12;
const INVITE_HOURS = 72;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
export const StaffPassword = z.string().min(12, 'Use at least 12 characters.').max(200);
const BAD = 'That email, password or code is not correct.';
let dummy: Promise<string> | null = null; // equalizes timing when the email is unknown

const audit = (q: Queryable, actor: string, action: string, id: string | null, details: Record<string, unknown> = {}) =>
  q.query(`insert into audit_log(actor, action, entity, entity_id, details) values ($1,$2,'staff',$3,$4)`, [actor, action, id, JSON.stringify(details)]);
const key = () => {
  const k = env().TOKEN_ENCRYPTION_KEY;
  if (!k) throw new HttpError(500, 'not_configured', 'TOKEN_ENCRYPTION_KEY must be set before staff accounts can be used.');
  return k;
};
const toStaff = (r: any): Staff => ({ id: r.id, email: r.email, name: r.name, role: r.role });

/** Creates (or re-issues) an invite. Returns a one-time setup token that is shown once and never stored. */
export async function inviteStaff(input: { email: string; name: string; role: StaffRole }, invitedBy: Staff | null) {
  const email = Email.parse(input.email), name = Name.parse(input.name), role = z.enum(['owner', 'analyst']).parse(input.role);
  if (invitedBy && invitedBy.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only owners can invite staff.');
  const token = randomToken(32);
  const d = await db();
  const staffId = await d.tx(async (q) => {
    const existing = (await q.query(`select id, password_hash, disabled_at from staff_users where lower(email) = $1`, [email])).rows[0];
    if (existing?.password_hash && !existing.disabled_at) throw new HttpError(409, 'exists', 'That person already has staff access.');
    const id = existing
      ? (await q.query(`update staff_users set name = $2, role = $3, password_hash = null, totp_secret_enc = null, totp_enabled_at = null, disabled_at = null, failed_attempts = 0, locked_until = null where id = $1 returning id`, [existing.id, name, role])).rows[0].id
      : (await q.query(`insert into staff_users(email, name, role, invited_by) values ($1,$2,$3,$4) returning id`, [email, name, role, invitedBy?.id ?? null])).rows[0].id;
    await q.query(`update staff_invites set used_at = now() where staff_id = $1 and used_at is null`, [id]);
    await q.query(`insert into staff_invites(staff_id, token_hash, expires_at) values ($1,$2, now() + make_interval(hours => $3))`, [id, sha256(token), INVITE_HOURS]);
    await audit(q, invitedBy ? `staff:${invitedBy.id}` : 'cli', 'staff.invited', id, { role });
    return id as string;
  });
  return { staffId, setupToken: token, setupUrl: `${env().APP_URL}/admin/setup?token=${token}` };
}

async function openInvite(q: Queryable, token: string) {
  const r = (await q.query(
    `select i.id as invite_id, s.* from staff_invites i join staff_users s on s.id = i.staff_id
      where i.token_hash = $1 and i.used_at is null and i.expires_at > now() and s.disabled_at is null`, [sha256(token ?? '')])).rows[0];
  if (!r) throw new HttpError(400, 'invalid_invite', 'This setup link has expired or was already used. Ask an owner for a new one.');
  return r;
}

/** Step 1 of setup: returns the authenticator secret to enroll (created once per invite). */
export async function beginSetup(token: string): Promise<{ email: string; name: string; secret: string }> {
  const d = await db();
  return d.tx(async (q) => {
    const r = await openInvite(q, token);
    let secret = r.totp_secret_enc ? decryptSecret(r.totp_secret_enc, key()) : null;
    if (!secret) {
      secret = newTotpSecret();
      await q.query(`update staff_users set totp_secret_enc = $2 where id = $1`, [r.id, encryptSecret(secret, key())]);
    }
    return { email: r.email, name: r.name, secret };
  });
}

/** Step 2 of setup: proves the authenticator works, sets the password, signs in. */
export async function completeSetup(token: string, password: string, code: string) {
  const pw = StaffPassword.parse(password);
  const d = await db();
  return d.tx(async (q) => {
    const r = await openInvite(q, token);
    if (!r.totp_secret_enc) throw new HttpError(400, 'setup_incomplete', 'Reload this page to get your authenticator code.');
    if (pw.toLowerCase().includes(r.email.split('@')[0].toLowerCase())) throw new HttpError(400, 'weak_password', 'Choose a password that does not contain your email name.');
    const step = verifyTotp(decryptSecret(r.totp_secret_enc, key()), code);
    if (step === null) throw new HttpError(400, 'invalid_code', 'That code did not match. Check the time on your phone and try the newest code.');
    await q.query(`update staff_users set password_hash = $2, totp_enabled_at = now(), totp_last_step = $3, last_login_at = now() where id = $1`, [r.id, await hashPassword(pw), step]);
    await q.query(`update staff_invites set used_at = now() where id = $1`, [r.invite_id]);
    await audit(q, `staff:${r.id}`, 'staff.setup_completed', r.id);
    return { staff: toStaff(r), token: await createStaffSession(q, r.id) };
  });
}

async function createStaffSession(q: Queryable, staffId: string) {
  const token = randomToken(32);
  await q.query(`insert into staff_sessions(staff_id, token_hash, expires_at) values ($1,$2, now() + make_interval(hours => $3))`, [staffId, sha256(token), STAFF_SESSION_HOURS]);
  return token;
}

export async function signInStaff(input: { email: string; password: string; code: string }, ip: string) {
  const email = Email.safeParse(input.email);
  const d = await db();
  const r = email.success ? (await d.query(`select * from staff_users where lower(email) = $1`, [email.data])).rows[0] : null;
  if (r?.locked_until && new Date(r.locked_until) > new Date()) {
    await audit(d, 'anon', 'staff.login_locked', r.id, { ip });
    throw new HttpError(429, 'locked', 'Too many attempts. Wait 15 minutes and try again.');
  }
  const pwOk = r?.password_hash ? await verifyPassword(input.password ?? '', r.password_hash) : (await verifyPassword(input.password ?? '', await (dummy ??= hashPassword(randomToken(12)))), false);
  const step = r && pwOk && r.totp_enabled_at && r.totp_secret_enc ? verifyTotp(decryptSecret(r.totp_secret_enc, key()), input.code ?? '') : null;
  const ok = !!r && !r.disabled_at && pwOk && step !== null && step > Number(r.totp_last_step);
  if (!ok) {
    if (r) {
      await d.query(
        `update staff_users set failed_attempts = case when failed_attempts + 1 >= $2 then 0 else failed_attempts + 1 end,
           locked_until = case when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end where id = $1`, [r.id, MAX_FAILS, LOCK_MINUTES]);
      await audit(d, 'anon', 'staff.login_failed', r.id, { ip });
    }
    throw new HttpError(401, 'invalid_credentials', BAD);
  }
  return d.tx(async (q) => {
    await q.query(`update staff_users set failed_attempts = 0, locked_until = null, totp_last_step = $2, last_login_at = now() where id = $1`, [r.id, step]);
    await audit(q, `staff:${r.id}`, 'staff.login', r.id, { ip });
    return { staff: toStaff(r), token: await createStaffSession(q, r.id) };
  });
}

export async function staffFromToken(token: string | null | undefined): Promise<Staff | null> {
  if (!token || token.length < 40 || token.length > 60) return null;
  const r = (await (await db()).query(
    `select u.* from staff_sessions s join staff_users u on u.id = s.staff_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.disabled_at is null and u.totp_enabled_at is not null`, [sha256(token)])).rows[0];
  return r ? toStaff(r) : null;
}

export async function revokeStaffSession(token: string | null | undefined) {
  if (token) await (await db()).query(`update staff_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`, [sha256(token)]);
}

export async function listStaff() {
  return (await (await db()).query(
    `select id, email, name, role, last_login_at, disabled_at, totp_enabled_at is not null as active, created_at from staff_users order by disabled_at nulls first, created_at`)).rows
    .map((r) => ({ id: r.id as string, email: r.email as string, name: r.name as string, role: r.role as StaffRole, active: r.active as boolean,
      disabled: !!r.disabled_at, lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null }));
}

/** Owners only. Removes access immediately and ends every session. */
export async function disableStaff(actor: Staff, staffId: string) {
  if (actor.role !== 'owner') throw new HttpError(403, 'forbidden', 'Only owners can remove staff.');
  if (actor.id === staffId) throw new HttpError(400, 'self', 'You cannot remove your own access.');
  const d = await db();
  await d.tx(async (q) => {
    const r = await q.query(`update staff_users set disabled_at = now() where id = $1 and disabled_at is null returning id`, [staffId]);
    if (!r.rows[0]) throw new HttpError(404, 'not_found', 'Staff member not found.');
    await q.query(`update staff_sessions set revoked_at = now() where staff_id = $1 and revoked_at is null`, [staffId]);
    await audit(q, `staff:${actor.id}`, 'staff.disabled', staffId);
  });
}
