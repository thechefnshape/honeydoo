import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { db, type Queryable } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { env } from '@/lib/env';
import { randomToken, sha256, safeEqual } from '@/lib/crypto';
import { sendEmail } from './email';

// Customer accounts. Email + password with scrypt, opaque server-side sessions (only hashes stored),
// and guest data (bag and orders from this browser) moved into the account on sign-in.

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 64;
export const SESSION_TTL_DAYS = 60;
const RESET_TTL_MIN = 30;

export const Email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(200);
export const Password = z.string().min(8, 'Use at least 8 characters.').max(200, 'Use 200 characters or fewer.');
export const Name = z.string().trim().min(1, 'Enter your name.').max(80);

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw.normalize('NFKC'), salt, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(pw.normalize('NFKC'), Buffer.from(salt, 'base64url'), LEN, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return safeEqual(key.toString('base64url'), hash);
}

// Used when the email is unknown so a failed sign-in takes the same time either way.
let dummyHash: Promise<string> | null = null;
const dummy = () => (dummyHash ??= hashPassword(randomToken(12)));

export interface Customer { id: string; email: string; name: string | null; phone: string | null; createdAt: string }
// Written on the transaction's own connection so it commits or rolls back with the change.
const audit = (q: Queryable, actor: string, id: string, action: string, details: Record<string, unknown>) =>
  q.query(`insert into audit_log(actor, action, entity, entity_id, details) values ($1,$2,'customer',$3,$4)`, [actor, action, id, JSON.stringify(details)]);

const toCustomer = (r: any): Customer => ({ id: r.id, email: r.email, name: r.name, phone: r.phone, createdAt: new Date(r.created_at).toISOString() });

export async function createSession(q: Queryable, customerId: string): Promise<string> {
  const token = randomToken(32);
  await q.query(`insert into customer_sessions(customer_id, token_hash, expires_at) values ($1, $2, now() + make_interval(days => $3))`,
    [customerId, sha256(token), SESSION_TTL_DAYS]);
  return token;
}

export async function customerFromToken(token: string | undefined | null): Promise<Customer | null> {
  if (!token || token.length < 40 || token.length > 60) return null;
  const d = await db();
  const r = (await d.query(
    `select c.*, s.id as sid, s.last_seen_at from customer_sessions s join customers c on c.id = s.customer_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and c.deleted_at is null`, [sha256(token)])).rows[0];
  if (!r) return null;
  if (Date.now() - new Date(r.last_seen_at).getTime() > 3_600_000) await d.query(`update customer_sessions set last_seen_at = now() where id = $1`, [r.sid]);
  return toCustomer(r);
}

export async function revokeSession(token: string | undefined | null) {
  if (!token) return;
  await (await db()).query(`update customer_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`, [sha256(token)]);
}

/**
 * Moves this browser's guest data into the account: orders placed here, and the open bag
 * (merged line by line into the account's bag if one already exists on another device).
 */
export async function linkGuestData(q: Queryable, customerId: string, sessionId: string | null) {
  if (!sessionId) return;
  await q.query(`update orders set customer_id = $1 where session_id = $2 and customer_id is null`, [customerId, sessionId]);
  const guest = (await q.query(`select id from carts where session_id = $1 and customer_id is null and status = 'open' order by created_at desc limit 1`, [sessionId])).rows[0];
  if (!guest) return;
  const mine = (await q.query(`select id from carts where customer_id = $1 and status = 'open' order by updated_at desc limit 1`, [customerId])).rows[0];
  if (!mine) {
    await q.query(`update carts set customer_id = $1, updated_at = now() where id = $2`, [customerId, guest.id]);
    return;
  }
  await q.query(
    `insert into cart_items(cart_id, product_variation_id, merchant_location_id, quantity, selected_modifiers, line_key)
     select $1, product_variation_id, merchant_location_id, quantity, selected_modifiers, line_key from cart_items where cart_id = $2
     on conflict (cart_id, line_key) do update set quantity = least(50, cart_items.quantity + excluded.quantity)`, [mine.id, guest.id]);
  await q.query(`update carts set status = 'abandoned', updated_at = now() where id = $1`, [guest.id]);
  await q.query(`update carts set version = version + 1, updated_at = now() where id = $1`, [mine.id]);
}

export async function signUp(input: { email: string; password: string; name: string }, sessionId: string | null) {
  const email = Email.parse(input.email), name = Name.parse(input.name), password = Password.parse(input.password);
  if (password.toLowerCase() === email) throw new HttpError(400, 'weak_password', 'Choose a password that is different from your email.');
  const hash = await hashPassword(password);
  const d = await db();
  return d.tx(async (q) => {
    const existing = (await q.query(`select id, password_hash from customers where lower(email) = $1 and deleted_at is null`, [email])).rows[0];
    if (existing?.password_hash) throw new HttpError(409, 'email_taken', 'An account with that email already exists. Sign in instead.');
    // A customer row can exist without a password (created before accounts); claim it.
    const c = existing
      ? (await q.query(`update customers set password_hash = $2, name = $3, updated_at = now() where id = $1 returning *`, [existing.id, hash, name])).rows[0]
      : (await q.query(`insert into customers(email, name, password_hash) values ($1, $2, $3) returning *`, [email, name, hash])).rows[0];
    await linkGuestData(q, c.id, sessionId);
    const token = await createSession(q, c.id);
    await audit(q, `customer:${c.id}`, c.id, 'customer.signed_up', {});
    return { customer: toCustomer(c), token };
  });
}

export async function signIn(input: { email: string; password: string }, sessionId: string | null) {
  const email = Email.safeParse(input.email);
  const d = await db();
  const c = email.success ? (await d.query(`select * from customers where lower(email) = $1 and deleted_at is null`, [email.data])).rows[0] : null;
  const ok = c?.password_hash ? await verifyPassword(input.password ?? '', c.password_hash) : (await verifyPassword(input.password ?? '', await dummy()), false);
  if (!c || !ok) throw new HttpError(401, 'invalid_credentials', 'That email and password do not match.');
  return d.tx(async (q) => {
    await linkGuestData(q, c.id, sessionId);
    const token = await createSession(q, c.id);
    return { customer: toCustomer(c), token };
  });
}

export async function updateProfile(customerId: string, input: { name?: string; phone?: string | null }) {
  const name = input.name === undefined ? undefined : Name.parse(input.name);
  const phone = input.phone === undefined ? undefined : (input.phone ? z.string().trim().max(30).regex(/^[0-9+().\-\s]*$/, 'Enter a valid phone number.').parse(input.phone) : null);
  const r = (await (await db()).query(
    `update customers set name = coalesce($2, name), phone = case when $3::boolean then $4 else phone end, updated_at = now() where id = $1 and deleted_at is null returning *`,
    [customerId, name ?? null, phone !== undefined, phone ?? null])).rows[0];
  if (!r) throw new HttpError(404, 'not_found', 'Account not found.');
  return toCustomer(r);
}

export async function changePassword(customerId: string, current: string, next: string, keepToken: string | null) {
  const pw = Password.parse(next);
  const d = await db();
  const c = (await d.query(`select password_hash from customers where id = $1 and deleted_at is null`, [customerId])).rows[0];
  if (!c?.password_hash || !(await verifyPassword(current, c.password_hash))) throw new HttpError(401, 'invalid_credentials', 'Your current password is not correct.');
  await d.tx(async (q) => {
    await q.query(`update customers set password_hash = $2, updated_at = now() where id = $1`, [customerId, await hashPassword(pw)]);
    // Sign out every other device.
    await q.query(`update customer_sessions set revoked_at = now() where customer_id = $1 and revoked_at is null and token_hash <> $2`, [customerId, keepToken ? sha256(keepToken) : '']);
    await audit(q, `customer:${customerId}`, customerId, 'customer.password_changed', {});
  });
}

/**
 * Sends a single-use reset link if the account exists. The response is the same whether or not it
 * does, so the endpoint cannot be used to discover who has an account.
 */
export async function requestPasswordReset(rawEmail: string) {
  const email = Email.parse(rawEmail);
  const d = await db();
  const c = (await d.query(`select id, email from customers where lower(email) = $1 and deleted_at is null and password_hash is not null`, [email])).rows[0];
  if (!c) return;
  const token = randomToken(32);
  await d.query(`update password_resets set used_at = now() where customer_id = $1 and used_at is null`, [c.id]);
  await d.query(`insert into password_resets(customer_id, token_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))`, [c.id, sha256(token), RESET_TTL_MIN]);
  const link = `${env().APP_URL}/account/reset?token=${token}`;
  await sendEmail({
    to: c.email, subject: 'Reset your honeydoo password',
    text: `Use this link to choose a new password. It works once and expires in ${RESET_TTL_MIN} minutes.\n\n${link}\n\nIf you did not ask for this, you can ignore this email. Your password has not changed.`,
  });
}

export async function resetPassword(token: string, next: string) {
  const pw = Password.parse(next);
  const d = await db();
  return d.tx(async (q) => {
    const r = (await q.query(`select id, customer_id from password_resets where token_hash = $1 and used_at is null and expires_at > now() for update`, [sha256(token ?? '')])).rows[0];
    if (!r) throw new HttpError(400, 'invalid_token', 'This reset link has expired or was already used. Request a new one.');
    await q.query(`update password_resets set used_at = now() where id = $1`, [r.id]);
    await q.query(`update customers set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $1`, [r.customer_id, await hashPassword(pw)]);
    await q.query(`update customer_sessions set revoked_at = now() where customer_id = $1 and revoked_at is null`, [r.customer_id]);
    await audit(q, `customer:${r.customer_id}`, r.customer_id, 'customer.password_reset', {});
    return { token: await createSession(q, r.customer_id) };
  });
}

/**
 * Deletes the account. Personal details are erased and sessions revoked. Orders stay with the shop
 * as transaction records (required for refunds and tax) but are no longer linked to the account.
 */
export async function deleteAccount(customerId: string, password: string) {
  const d = await db();
  const c = (await d.query(`select password_hash from customers where id = $1 and deleted_at is null`, [customerId])).rows[0];
  if (!c?.password_hash || !(await verifyPassword(password, c.password_hash))) throw new HttpError(401, 'invalid_credentials', 'Your password is not correct.');
  await d.tx(async (q) => {
    await q.query(`update customer_sessions set revoked_at = now() where customer_id = $1 and revoked_at is null`, [customerId]);
    await q.query(`update orders set customer_id = null where customer_id = $1`, [customerId]);
    await q.query(`update carts set status = 'abandoned', customer_id = null where customer_id = $1`, [customerId]);
    await q.query(`update customers set email = null, name = null, phone = null, password_hash = null, deleted_at = now(), updated_at = now() where id = $1`, [customerId]);
    await audit(q, `customer:${customerId}`, customerId, 'customer.deleted', {});
  });
}
