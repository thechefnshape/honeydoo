import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, SESSION } from './helpers';
import { addItem, getCartView, getOrCreateCart, updateItem } from '../src/server/cart';
import { quoteMerchant } from '../src/server/pricing';
import { createCheckout } from '../src/server/checkout';
import { getOrderForShopper } from '../src/server/orders';
import { taxOn } from '../src/lib/money';
import type { Db } from '../src/lib/db';

let db: Db;
const variation = async (product: string, name?: string) =>
  (await db.query(`select v.id, p.merchant_id from product_variations v join products p on p.id = v.product_id where p.name = $1 ${name ? 'and v.name = $2' : ''} order by v.ordinal limit 1`, name ? [product, name] : [product])).rows[0];
const modifier = async (name: string) => (await db.query(`select id from modifiers where name = $1 limit 1`, [name])).rows[0].id;

beforeAll(async () => { db = await freshDb(); });

describe('Cart and pricing', () => {
  it('validates modifiers and prices lines from the catalog', async () => {
    const cart = await getOrCreateCart(SESSION);
    const latte = await variation('Iced Vanilla Latte', '16 oz');
    await expect(addItem(cart.id, { variationId: latte.id, quantity: 1, modifierIds: [] })).rejects.toThrow(/Choose milk/);
    await expect(addItem(cart.id, { variationId: latte.id, quantity: 1, modifierIds: [await modifier('Oat milk'), await modifier('Almond milk')] })).rejects.toThrow(/up to 1/);
    const bouquetMod = await modifier('Handwritten note card');
    await expect(addItem(cart.id, { variationId: latte.id, quantity: 1, modifierIds: [await modifier('Oat milk'), bouquetMod] })).rejects.toThrow(/not valid/);
    await addItem(cart.id, { variationId: latte.id, quantity: 2, modifierIds: [await modifier('Oat milk'), await modifier('Extra shot')] });
    const view = await getCartView(cart.id);
    expect(view.groups[0].lines[0]).toMatchObject({ unitPrice: 595 + 75 + 100, lineTotal: 1540, quantity: 2 });
  });

  it('merges identical lines instead of duplicating them', async () => {
    const cart = await getOrCreateCart(SESSION);
    const latte = await variation('Iced Vanilla Latte', '16 oz');
    await addItem(cart.id, { variationId: latte.id, quantity: 1, modifierIds: [await modifier('Extra shot'), await modifier('Oat milk')] });
    const lines = (await getCartView(cart.id)).groups[0].lines;
    expect(lines).toHaveLength(1); expect(lines[0].quantity).toBe(3);
  });

  it('rejects sold-out items and flags quantities above stock', async () => {
    const cart = await getOrCreateCart(SESSION);
    await expect(addItem(cart.id, { variationId: (await variation('Six-Inch Birthday Cake')).id, quantity: 1, modifierIds: [] })).rejects.toThrow(/sold out/);
    const croissant = await variation('Almond Croissant');
    await addItem(cart.id, { variationId: croissant.id, quantity: 6, modifierIds: [] });
    const g = (await getCartView(cart.id)).groups.find((x) => x.merchant.id === croissant.merchant_id)!;
    expect(g.lines[0].availabilityNote).toBe('Only 4 available');
    const line = g.lines[0];
    await updateItem(cart.id, line.id, 4);
    expect((await getCartView(cart.id)).groups.find((x) => x.merchant.id === croissant.merchant_id)!.lines[0].available).toBe(true);
  });

  it('computes tax only on taxable items and never adds a fee to the customer total', async () => {
    const cart = await getOrCreateCart(SESSION);
    const latte = await variation('Iced Vanilla Latte', '16 oz');
    const beans = await variation('Locally Roasted Coffee Beans');
    await addItem(cart.id, { variationId: beans.id, quantity: 1, modifierIds: [] }); // not taxable
    const q = await quoteMerchant(db, { cartId: cart.id, merchantId: latte.merchant_id });
    expect(q.merchandiseSubtotal).toBe(3 * 770 + 1700);
    expect(q.taxTotal).toBe(taxOn(3 * 770, 800));
    expect(q.grandTotal).toBe(q.merchandiseSubtotal + q.taxTotal);   // customer pays shop prices + tax only
    expect(q.merchantFee).toBe(100);                                  // the shop pays honeydoo's $1
  });

  it('lets an admin waive the merchant fee for a promotion', async () => {
    const cart = await getOrCreateCart(SESSION);
    const latte = await variation('Iced Vanilla Latte', '16 oz');
    await db.query(`update merchants set service_fee_enabled = false where id = $1`, [latte.merchant_id]);
    const q = await quoteMerchant(db, { cartId: cart.id, merchantId: latte.merchant_id });
    expect(q).toMatchObject({ merchantFee: 0, merchantFeeWaived: true });
    await db.query(`update merchants set service_fee_enabled = true where id = $1`, [latte.merchant_id]);
  });

  it('changes the quote hash when the price changes', async () => {
    const cart = await getOrCreateCart(SESSION);
    const latte = await variation('Iced Vanilla Latte', '16 oz');
    const a = await quoteMerchant(db, { cartId: cart.id, merchantId: latte.merchant_id });
    await db.query(`update product_variations set price_minor_units = 625 where id = $1`, [latte.id]);
    const b = await quoteMerchant(db, { cartId: cart.id, merchantId: latte.merchant_id });
    expect(b.quoteHash).not.toBe(a.quoteHash);
    expect(b.merchandiseSubtotal).toBe(a.merchandiseSubtotal + 3 * 30);
  });
});

describe('Checkout', () => {
  it('is idempotent, rejects stale quotes, and never marks a demo order paid', async () => {
    const cart = await getOrCreateCart(SESSION);
    const latte = await variation('Iced Vanilla Latte', '16 oz');
    const q = await quoteMerchant(db, { cartId: cart.id, merchantId: latte.merchant_id });
    const input = { sessionId: SESSION, cartId: cart.id, merchantId: latte.merchant_id, quoteHash: q.quoteHash, contact: { name: 'A', email: 'a@example.com' } };
    await expect(createCheckout({ ...input, quoteHash: 'f'.repeat(32) })).rejects.toThrow(/changed/);
    const [a, b] = await Promise.all([createCheckout(input), createCheckout(input)]);
    expect(a.orderId).toBe(b.orderId);
    expect(a.status).toBe('payment_not_configured');
    expect((await db.query(`select count(*)::int as n from orders`)).rows[0].n).toBe(1);
    const order = await getOrderForShopper(a.orderId, SESSION);
    expect(order.grandTotal).toBe(q.grandTotal);
    expect((await db.query(`select service_fee, merchant_fee from orders where id = $1`, [a.orderId])).rows[0]).toEqual({ service_fee: 0, merchant_fee: 100 });
    expect(order.items.every((i) => i.unitPrice > 0)).toBe(true);
    expect((await db.query(`select count(*)::int as n from transactions`)).rows[0].n).toBe(0);
    expect((await getCartView(cart.id)).groups.find((g) => g.merchant.id === latte.merchant_id)).toBeUndefined();
  });

  it('keeps guest orders private to their session', async () => {
    const o = (await db.query(`select id from orders limit 1`)).rows[0].id;
    await expect(getOrderForShopper(o, 'someone-elses-session-zzzzzz')).rejects.toThrow(/not found/);
    await expect(getOrderForShopper('not-a-uuid', SESSION)).rejects.toThrow(/not found/);
  });
});
