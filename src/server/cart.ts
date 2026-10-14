import { db, type Queryable } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { isDemoMode } from '@/lib/env';

export interface CartLine {
  id: string; productId: string; productName: string; image: string | null; variationId: string; variationName: string;
  unitPrice: number; modifiers: { id: string; name: string; price: number }[]; quantity: number; lineTotal: number;
  available: boolean; availabilityNote: string | null; locationId: string;
}
export interface CartGroup { merchant: { id: string; slug: string; name: string; isDemo: boolean; serviceFee: number }; lines: CartLine[]; subtotal: number }
export interface CartView { id: string; version: number; groups: CartGroup[]; itemCount: number }

/** Signed-in shoppers share one bag across devices; guests get one bag per browser. */
export async function getOrCreateCart(sessionId: string, customerId: string | null = null): Promise<{ id: string; version: number }> {
  const d = await db();
  const found = customerId
    ? await d.query<{ id: string; version: number }>(`select id, version from carts where customer_id = $1 and status = 'open' order by updated_at desc limit 1`, [customerId])
    : await d.query<{ id: string; version: number }>(`select id, version from carts where session_id = $1 and customer_id is null and status = 'open' order by created_at desc limit 1`, [sessionId]);
  if (found.rows[0]) return found.rows[0];
  const r = await d.query<{ id: string; version: number }>(`insert into carts(session_id, customer_id) values ($1, $2) returning id, version`, [sessionId, customerId]);
  return r.rows[0];
}

/** A bag belongs to its account, or (for guest bags) to the browser session that made it. */
export async function assertCartOwner(cartId: string, sessionId: string, customerId: string | null = null) {
  if (!/^[0-9a-f-]{36}$/i.test(cartId)) throw new HttpError(404, 'cart_not_found', 'Bag not found.');
  const d = await db();
  const r = await d.query(`select id from carts where id = $1 and status = 'open' and (customer_id = $3::uuid or (customer_id is null and session_id = $2))`, [cartId, sessionId, customerId]);
  if (!r.rows[0]) throw new HttpError(404, 'cart_not_found', 'Bag not found.');
}

/** Validates a variation + modifier selection against the live catalog. Returns the location to sell from. */
export async function validateSelection(q: Queryable, variationId: string, modifierIds: string[]) {
  const v = await q.query(
    `select v.id, v.product_id, v.available_for_sale, p.merchant_id, l.id as location_id, a.availability_status
       from product_variations v
       join products p on p.id = v.product_id and p.publication_status = 'published'
       join merchants m on m.id = p.merchant_id and m.status = 'active' ${isDemoMode() ? '' : 'and not m.is_demo'}
       join merchant_locations l on l.merchant_id = m.id and l.active and l.pickup_enabled
       left join product_overrides o on o.product_id = p.id
       left join product_location_availability a on a.variation_id = v.id and a.merchant_location_id = l.id
      where v.id = $1 and coalesce(o.published_in_honeydoo, true)
      order by l.created_at limit 1`, [variationId]);
  const row = v.rows[0];
  if (!row) throw new HttpError(404, 'product_unavailable', 'That item is no longer available on Honeydoo.');
  if (!row.available_for_sale || row.availability_status === 'out_of_stock' || row.availability_status === 'not_sold_here')
    throw new HttpError(409, 'out_of_stock', 'That option is sold out right now.');

  const lists = await q.query(
    `select ml.id, ml.name, ml.min_selected, ml.max_selected, ml.selection_type, array_agg(md.id) as ids
       from product_modifier_lists pml join modifier_lists ml on ml.id = pml.modifier_list_id
       join modifiers md on md.modifier_list_id = ml.id
      where pml.product_id = $1 group by ml.id`, [row.product_id]);
  const allowed = new Map<string, string>(); // modifier id -> list id
  for (const l of lists.rows) for (const id of l.ids) allowed.set(id, l.id);
  const unique = [...new Set(modifierIds)];
  for (const id of unique) if (!allowed.has(id)) throw new HttpError(400, 'invalid_modifier', 'One of the selected options is not valid for this item.');
  for (const l of lists.rows) {
    const n = unique.filter((id) => allowed.get(id) === l.id).length;
    if (n < l.min_selected) throw new HttpError(400, 'modifier_required', `Choose ${l.name.toLowerCase()}.`);
    if (l.max_selected !== null && n > l.max_selected) throw new HttpError(400, 'too_many_modifiers', `Choose up to ${l.max_selected} for ${l.name.toLowerCase()}.`);
  }
  return { locationId: row.location_id as string, merchantId: row.merchant_id as string, productId: row.product_id as string, modifierIds: unique.sort() };
}

export async function addItem(cartId: string, input: { variationId: string; quantity: number; modifierIds: string[] }) {
  const d = await db();
  return d.tx(async (q) => {
    const sel = await validateSelection(q, input.variationId, input.modifierIds);
    const lineKey = `${input.variationId}:${sel.modifierIds.join(',')}`;
    await q.query(
      `insert into cart_items(cart_id, product_variation_id, merchant_location_id, quantity, selected_modifiers, line_key)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (cart_id, line_key) do update set quantity = least(cart_items.quantity + excluded.quantity, 50)`,
      [cartId, input.variationId, sel.locationId, input.quantity, JSON.stringify(sel.modifierIds), lineKey]);
    await q.query(`update carts set version = version + 1, updated_at = now() where id = $1`, [cartId]);
    return sel;
  });
}

export async function updateItem(cartId: string, itemId: string, quantity: number) {
  const d = await db();
  const r = await d.query(`update cart_items set quantity = $3 where id = $2 and cart_id = $1 returning id`, [cartId, itemId, quantity]);
  if (!r.rows[0]) throw new HttpError(404, 'item_not_found', 'That item is no longer in your bag.');
  await d.query(`update carts set version = version + 1, updated_at = now() where id = $1`, [cartId]);
}

export async function removeItem(cartId: string, itemId: string) {
  const d = await db();
  await d.query(`delete from cart_items where id = $2 and cart_id = $1`, [cartId, itemId]);
  await d.query(`update carts set version = version + 1, updated_at = now() where id = $1`, [cartId]);
}

/** Reads the bag with current catalog prices (never cached prices). */
export async function getCartView(cartId: string, q?: Queryable): Promise<CartView> {
  const d = q ?? (await db());
  const c = await d.query<{ version: number }>(`select version from carts where id = $1`, [cartId]);
  const { rows } = await d.query(
    `select ci.id, ci.quantity, ci.selected_modifiers, ci.merchant_location_id,
            v.id as variation_id, v.name as variation_name, v.price_minor_units, v.available_for_sale,
            p.id as product_id, p.name as product_name, coalesce(o.featured_image_url, p.primary_image_url) as image, p.publication_status,
            coalesce(o.published_in_honeydoo, true) as visible,
            m.id as merchant_id, m.slug, m.display_name, m.is_demo, m.status as merchant_status,
            case when m.service_fee_enabled then m.service_fee_minor else 0 end as fee,
            a.availability_status, a.quantity as stock
       from cart_items ci
       join product_variations v on v.id = ci.product_variation_id
       join products p on p.id = v.product_id
       join merchants m on m.id = p.merchant_id
       left join product_overrides o on o.product_id = p.id
       left join product_location_availability a on a.variation_id = v.id and a.merchant_location_id = ci.merchant_location_id
      where ci.cart_id = $1 order by m.display_name, ci.created_at`, [cartId]);

  const modIds = [...new Set(rows.flatMap((r) => parseIds(r.selected_modifiers)))];
  const mods = modIds.length ? (await d.query(`select id, name, price_minor_units from modifiers where id = any($1::uuid[])`, [modIds])).rows : [];
  const modMap = new Map(mods.map((m) => [m.id, { id: m.id, name: m.name, price: m.price_minor_units as number }]));

  const groups = new Map<string, CartGroup>();
  for (const r of rows) {
    const modifiers = parseIds(r.selected_modifiers).map((id) => modMap.get(id)).filter(Boolean) as CartLine['modifiers'];
    const unit = r.price_minor_units + modifiers.reduce((s, m) => s + m.price, 0);
    let note: string | null = null;
    if (r.merchant_status !== 'active' || r.publication_status !== 'published' || !r.visible) note = 'No longer available on Honeydoo';
    else if (!r.available_for_sale || r.availability_status === 'out_of_stock') note = 'Sold out';
    else if (r.stock !== null && r.stock !== undefined && r.quantity > r.stock) note = `Only ${r.stock} available`;
    const line: CartLine = {
      id: r.id, productId: r.product_id, productName: r.product_name, image: r.image, variationId: r.variation_id, variationName: r.variation_name,
      unitPrice: unit, modifiers, quantity: r.quantity, lineTotal: unit * r.quantity, available: note === null, availabilityNote: note, locationId: r.merchant_location_id,
    };
    const g: CartGroup = groups.get(r.merchant_id) ?? { merchant: { id: r.merchant_id, slug: r.slug, name: r.display_name, isDemo: r.is_demo, serviceFee: r.fee }, lines: [], subtotal: 0 };
    g.lines.push(line); g.subtotal += line.available ? line.lineTotal : 0;
    groups.set(r.merchant_id, g);
  }
  const list = [...groups.values()];
  return { id: cartId, version: c.rows[0]?.version ?? 1, groups: list, itemCount: list.reduce((s, g) => s + g.lines.reduce((t, l) => t + l.quantity, 0), 0) };
}

function parseIds(v: unknown): string[] { return Array.isArray(v) ? v : typeof v === 'string' ? JSON.parse(v) : []; }
