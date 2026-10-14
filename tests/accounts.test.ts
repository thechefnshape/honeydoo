import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb } from './helpers';
import { signUp, signIn, customerFromToken, revokeSession, changePassword, requestPasswordReset, resetPassword, deleteAccount, hashPassword, verifyPassword, updateProfile } from '../src/server/accounts';
import { setEmailSenderForTests } from '../src/server/email';
import { addItem, assertCartOwner, getCartView, getOrCreateCart } from '../src/server/cart';
import { quoteMerchant } from '../src/server/pricing';
import { createCheckout } from '../src/server/checkout';
import { getOrderForShopper, listOrdersForShopper } from '../src/server/orders';
import { safeNext } from '../src/lib/safe-next';
import type { Db } from '../src/lib/db';

let db: Db;
const PHONE = 'guest-phone-session-aaaaaaaaaaaa';
const LAPTOP = 'guest-laptop-session-bbbbbbbbbbb';
const STRANGER = 'stranger-session-cccccccccccccccc';
const variation = async (product: string) =>
  (await db.query(`select v.id, p.merchant_id from product_variations v join products p on p.id = v.product_id where p.name = $1 order by v.ordinal limit 1`, [product])).rows[0];

async function guestOrder(sessionId: string, customerId: string | null = null) {
  const cart = await getOrCreateCart(sessionId, customerId);
  const v = await variation('Almond Croissant');
  await addItem(cart.id, { variationId: v.id, quantity: 1, modifierIds: [] });
  const q = await quoteMerchant(db, { cartId: cart.id, merchantId: v.merchant_id });
  return createCheckout({ sessionId, customerId, cartId: cart.id, merchantId: v.merchant_id, quoteHash: q.quoteHash, contact: { name: 'Ada', email: 'ada@example.com' } });
}

beforeAll(async () => { db = await freshDb(); });

describe('Passwords', () => {
  it('hashes with scrypt and a per-password salt, never storing the password', async () => {
    const a = await hashPassword('correct horse'), b = await hashPassword('correct horse');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/); expect(a).not.toBe(b); expect(a).not.toContain('correct');
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('correct horsf', a)).toBe(false);
  });
});

describe('Sign up and sign in', () => {
  let token = '';
  it('creates an account, normalizes the email and moves the guest order and bag into it', async () => {
    const order = await guestOrder(PHONE);
    const bagCart = await getOrCreateCart(PHONE);
    await addItem(bagCart.id, { variationId: (await variation('Almond Croissant')).id, quantity: 2, modifierIds: [] });

    const out = await signUp({ name: 'Ada Lovelace', email: '  Ada@Example.COM ', password: 'analytical1' }, PHONE);
    token = out.token;
    expect(out.customer.email).toBe('ada@example.com');
    const stored = (await db.query(`select password_hash from customers where id = $1`, [out.customer.id])).rows[0].password_hash;
    expect(stored).not.toContain('analytical1');
    expect((await db.query(`select token_hash from customer_sessions where customer_id = $1`, [out.customer.id])).rows[0].token_hash).not.toBe(token);

    expect((await customerFromToken(token))?.id).toBe(out.customer.id);
    expect((await listOrdersForShopper('', out.customer.id)).map((o) => o.id)).toContain(order.orderId);
    const accountCart = await getOrCreateCart('any-other-session-ddddddddddd', out.customer.id);
    expect(accountCart.id).toBe(bagCart.id);
  });

  it('rejects a duplicate email, weak passwords and bad emails', async () => {
    await expect(signUp({ name: 'Ada', email: 'ADA@example.com', password: 'whatever12' }, null)).rejects.toThrow(/already exists/);
    await expect(signUp({ name: 'Bo', email: 'bo@example.com', password: 'short' }, null)).rejects.toThrow(/8 characters/);
    await expect(signUp({ name: 'Bo', email: 'not-an-email', password: 'longenough' }, null)).rejects.toThrow(/valid email/);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const a = await signIn({ email: 'ada@example.com', password: 'wrong-password' }, null).catch((e) => e.message);
    const b = await signIn({ email: 'nobody@example.com', password: 'wrong-password' }, null).catch((e) => e.message);
    expect(a).toBe(b); expect(a).toMatch(/do not match/);
  });

  it('signing in on another device merges that device bag into the account bag', async () => {
    const laptopCart = await getOrCreateCart(LAPTOP);
    const croissant = await variation('Almond Croissant');
    await addItem(laptopCart.id, { variationId: croissant.id, quantity: 1, modifierIds: [] });
    const { customer, token: t2 } = await signIn({ email: 'ada@example.com', password: 'analytical1' }, LAPTOP);
    const cart = await getOrCreateCart(LAPTOP, customer.id);
    const line = (await getCartView(cart.id)).groups.flatMap((g) => g.lines).find((l) => l.variationId === croissant.id)!;
    expect(line.quantity).toBe(3);
    expect((await db.query(`select status from carts where id = $1`, [laptopCart.id])).rows[0].status).toBe('abandoned');
    await revokeSession(t2);
    expect(await customerFromToken(t2)).toBeNull();
  });

  it('keeps account bags and orders private from other browsers', async () => {
    const c = (await customerFromToken(token))!;
    const cart = await getOrCreateCart(PHONE, c.id);
    await expect(assertCartOwner(cart.id, PHONE, null)).rejects.toThrow(/not found/);
    await expect(assertCartOwner(cart.id, STRANGER, null)).rejects.toThrow(/not found/);
    await assertCartOwner(cart.id, STRANGER, c.id);
    const [o] = await listOrdersForShopper('', c.id);
    await expect(getOrderForShopper(o.id, PHONE, null)).rejects.toThrow(/not found/);
    expect((await getOrderForShopper(o.id, STRANGER, c.id)).id).toBe(o.id);
  });

  it('records signed-in checkouts on the account', async () => {
    const c = (await customerFromToken(token))!;
    const out = await guestOrder(STRANGER, c.id);
    expect((await db.query(`select customer_id from orders where id = $1`, [out.orderId])).rows[0].customer_id).toBe(c.id);
  });

  it('updates profile details with validation', async () => {
    const c = (await customerFromToken(token))!;
    expect((await updateProfile(c.id, { name: 'Ada L.', phone: '(216) 555-0100' })).phone).toBe('(216) 555-0100');
    await expect(updateProfile(c.id, { phone: 'call me maybe' })).rejects.toThrow(/valid phone/);
  });

  it('changing the password signs out other devices but keeps this one', async () => {
    const c = (await customerFromToken(token))!;
    const other = (await signIn({ email: 'ada@example.com', password: 'analytical1' }, null)).token;
    await expect(changePassword(c.id, 'nope', 'difference-engine', token)).rejects.toThrow(/not correct/);
    await changePassword(c.id, 'analytical1', 'difference-engine', token);
    expect(await customerFromToken(token)).not.toBeNull();
    expect(await customerFromToken(other)).toBeNull();
  });
});

describe('Password reset', () => {
  it('sends a single-use link only for real accounts and revokes old sessions', async () => {
    const sent: { to: string; text: string }[] = [];
    setEmailSenderForTests(async (m) => { sent.push(m); });
    await requestPasswordReset('nobody@example.com');
    expect(sent).toHaveLength(0);
    const before = (await signIn({ email: 'ada@example.com', password: 'difference-engine' }, null)).token;
    await requestPasswordReset('ADA@example.com');
    expect(sent).toHaveLength(1);
    const resetToken = new URL(sent[0].text.match(/https?:\S+/)![0]).searchParams.get('token')!;
    expect((await db.query(`select count(*)::int as n from password_resets where token_hash = $1`, [resetToken])).rows[0].n).toBe(0);
    await expect(resetPassword(resetToken, 'short')).rejects.toThrow(/8 characters/);
    await resetPassword(resetToken, 'babbage-1834');
    await expect(resetPassword(resetToken, 'babbage-1835')).rejects.toThrow(/expired or was already used/);
    expect(await customerFromToken(before)).toBeNull();
    await signIn({ email: 'ada@example.com', password: 'babbage-1834' }, null);
    setEmailSenderForTests(null);
  });
});

describe('Account deletion', () => {
  it('erases personal details, unlinks orders and blocks sign-in', async () => {
    const { customer, token } = await signIn({ email: 'ada@example.com', password: 'babbage-1834' }, null);
    await expect(deleteAccount(customer.id, 'wrong')).rejects.toThrow(/not correct/);
    await deleteAccount(customer.id, 'babbage-1834');
    const row = (await db.query(`select email, name, phone, password_hash, deleted_at from customers where id = $1`, [customer.id])).rows[0];
    expect(row).toMatchObject({ email: null, name: null, phone: null, password_hash: null });
    expect(row.deleted_at).not.toBeNull();
    expect(await customerFromToken(token)).toBeNull();
    expect((await db.query(`select count(*)::int as n from orders where customer_id = $1`, [customer.id])).rows[0].n).toBe(0);
    await expect(signIn({ email: 'ada@example.com', password: 'babbage-1834' }, null)).rejects.toThrow(/do not match/);
    // The email can be used again for a new account.
    await signUp({ name: 'Ada', email: 'ada@example.com', password: 'fresh-start-1' }, null);
  });
});

describe('Redirect safety', () => {
  it('only allows same-site paths after sign-in', () => {
    expect(safeNext('/orders/abc')).toBe('/orders/abc');
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '', null]) expect(safeNext(bad)).toBe('/profile');
  });
});
